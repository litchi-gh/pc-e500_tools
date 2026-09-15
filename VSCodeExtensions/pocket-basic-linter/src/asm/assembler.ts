// Port of Assembler/src/E500Assembler.Core/Assembler.cs, adapted to collect diagnostics
// for an editor instead of stopping at the first error.
import * as path from "node:path";
import { LintIssue, Severity } from "../core";
import { InstructionEncoder, MNEMONICS } from "./encoder";
import { AssemblyError, DivideByZeroError, evaluate, parseString, splitOperands, stripComment } from "./expression";

export interface AsmHost {
  /** Text of a file, or undefined when it does not exist. */
  readText(filePath: string): string | undefined;
  /** Bytes of a file, or undefined when it does not exist. */
  readBinary(filePath: string): Uint8Array | undefined;
}

export interface AsmOptions {
  /** Path of the document being linted; needed to resolve INCLUDE / INCBIN. */
  readonly filePath?: string;
  readonly includeDirectories?: readonly string[];
  readonly defines?: Readonly<Record<string, number>>;
  readonly host?: AsmHost;
}

export interface AsmResult {
  readonly issues: LintIssue[];
  readonly origin: number;
  readonly binary: Uint8Array;
  readonly symbols: ReadonlyMap<string, bigint>;
}

export const DIRECTIVES: ReadonlySet<string> = new Set(["ORG", "EQU", "DB", "DEFB", "BYTE", "DW", "DEFW", "WORD", "DP", "DS", "DEFS", "SPACE", "ALIGN", "INCLUDE", "INCBIN", "END", "ASSERT"]);
const NAME_PATTERN = /^[A-Za-z_.][A-Za-z_0-9.]*$/;

/** Where a statement's diagnostics are shown: a line of the linted document and a column range. */
interface Location {
  readonly line: number;
  readonly start: number;
  readonly end: number;
}

interface Statement {
  readonly file: string;
  /** Message prefix for statements that came from an INCLUDEd file ("" for the main document). */
  readonly where: string;
  readonly text: string;
  readonly label?: string;
  readonly op: string;
  readonly args: readonly string[];
  /** Column of the operand list within `text` (main document only). */
  readonly argsColumn: number;
  readonly whole: Location;
  readonly labelAt: Location;
  readonly opAt: Location;
  readonly argsAt: Location;
}

function issue(code: string, message: string, severity: Severity, at: Location): LintIssue {
  return { code, message, severity, range: { line: at.line, start: at.start, end: Math.max(at.start + 1, at.end) } };
}

function parseStatement(raw: string, file: string, where: string, line: number, fallback?: Location): Statement {
  const text = stripComment(raw);
  const body = text.trimEnd();
  const at = (start: number, end: number): Location => fallback ?? { line, start, end };
  let cursor = body.length - body.trimStart().length;
  const whole = at(cursor, body.length);
  let s = body.slice(cursor);
  let label: string | undefined;
  let labelAt = at(cursor, cursor);

  const labelMatch = /^([A-Za-z_.][A-Za-z_0-9.]*)\s*:/.exec(s);
  if (labelMatch) {
    label = labelMatch[1];
    labelAt = at(cursor, cursor + label.length);
    const after = s.slice(labelMatch[0].length);
    cursor += labelMatch[0].length + (after.length - after.trimStart().length);
    s = after.trimStart();
  } else {
    const equMatch = /^([A-Za-z_.][A-Za-z_0-9.]*)\s+(?:\.?EQU\b|=)\s*(.*)$/i.exec(s);
    if (equMatch) {
      const name = equMatch[1];
      const afterName = s.slice(name.length);
      const opColumn = cursor + name.length + (afterName.length - afterName.trimStart().length);
      const argsColumn = cursor + s.length - equMatch[2].length;
      return {
        file, where, text, label: name, op: "EQU", args: [equMatch[2]], argsColumn, whole,
        labelAt: at(cursor, cursor + name.length), opAt: at(opColumn, argsColumn), argsAt: at(argsColumn, body.length)
      };
    }
  }
  if (s.length === 0) {
    return { file, where, text, label, op: "", args: [], argsColumn: cursor, whole, labelAt, opAt: at(cursor, cursor), argsAt: at(cursor, cursor) };
  }
  let opEnd = 0;
  while (opEnd < s.length && !/\s/.test(s[opEnd])) opEnd += 1;
  let op = s.slice(0, opEnd).toUpperCase();
  if (op.startsWith(".") && DIRECTIVES.has(op.slice(1))) op = op.slice(1);
  const rest = s.slice(opEnd);
  const argsColumn = cursor + opEnd + (rest.length - rest.trimStart().length);
  return {
    file, where, text, label, op, args: splitOperands(rest), argsColumn, whole,
    labelAt, opAt: at(cursor, cursor + opEnd), argsAt: at(argsColumn, body.length)
  };
}

function findFile(name: string, sourceFile: string, options: AsmOptions): string | undefined {
  const host = options.host;
  if (!host) return undefined;
  const candidates = [path.join(path.dirname(sourceFile), name), ...(options.includeDirectories ?? []).map(dir => path.join(dir, name))];
  for (const candidate of candidates) {
    if (host.readText(candidate) !== undefined) return path.resolve(candidate);
  }
  return undefined;
}

export function assemble(source: string, options: AsmOptions = {}): AsmResult {
  const issues: LintIssue[] = [];
  const statements: Statement[] = [];
  const mainFile = options.filePath ? path.resolve(options.filePath) : "<input>";
  const active = new Set<string>([mainFile]);
  let ended = false;

  const readLines = (text: string, file: string, where: string, fallback?: Location): void => {
    const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    for (let n = 0; n < lines.length && !ended; n += 1) {
      const line = lines[n];
      const prefix = where ? `${where}(${n + 1}): ` : "";
      const lineAt: Location = fallback ?? { line: n, start: line.length - line.trimStart().length, end: line.trimEnd().length };
      let statement: Statement;
      try {
        statement = parseStatement(line, file, where, n, fallback);
      } catch (error) {
        if (!(error instanceof AssemblyError)) throw error;
        issues.push(issue(error.code, prefix + error.message, "error", lineAt));
        continue;
      }
      if (statement.op === "INCLUDE") {
        if (statement.args.length !== 1) {
          issues.push(issue("ASM021", `${prefix}INCLUDE にはファイル名を 1 つ指定します。`, "error", statement.whole));
          continue;
        }
        if (statement.label !== undefined) {
          issues.push(issue("ASM020", `${prefix}INCLUDE にラベルは付けられません。`, "error", statement.labelAt));
          continue;
        }
        let name: string;
        try {
          name = parseString(statement.args[0]);
        } catch (error) {
          if (!(error instanceof AssemblyError)) throw error;
          issues.push(issue(error.code, prefix + error.message, "error", statement.argsAt));
          continue;
        }
        if (!options.host || !options.filePath) {
          issues.push(issue("ASM060", `${prefix}INCLUDE を解決するにはファイルを保存してください。`, "warning", statement.whole));
          continue;
        }
        const resolved = findFile(name, file, options);
        if (resolved === undefined) {
          issues.push(issue("ASM060", `${prefix}ファイルが見つかりません: ${name}`, "error", statement.argsAt));
          continue;
        }
        if (active.size >= 64 || active.has(resolved)) {
          issues.push(issue("ASM060", `${prefix}INCLUDE が再帰しています: ${name}`, "error", statement.argsAt));
          continue;
        }
        active.add(resolved);
        try {
          readLines(options.host.readText(resolved) ?? "", resolved, where ? `${where} > ${name}` : name, statement.whole);
        } finally {
          active.delete(resolved);
        }
        continue;
      }
      statements.push(statement);
      if (statement.op === "END") ended = true;
    }
  };
  readLines(source, mainFile, "");

  const top: Location = { line: 0, start: 0, end: 1 };
  const defines = new Map<string, bigint>();
  for (const [name, value] of Object.entries(options.defines ?? {})) {
    if (!NAME_PATTERN.test(name)) {
      issues.push(issue("ASM030", `設定 pocketAsm.defines のシンボル名 ${name} が不正です。`, "error", top));
      continue;
    }
    defines.set(name.toUpperCase(), BigInt(Math.trunc(value)));
  }

  // Checks that do not need addresses. Statements failing them are skipped in the passes below.
  const knownNames = new Set(defines.keys());
  const broken = new Set<Statement>();
  for (const s of statements) {
    const prefix = s.where ? `${s.where}: ` : "";
    if (s.label !== undefined) {
      const key = s.label.toUpperCase();
      if (knownNames.has(key)) {
        issues.push(issue("ASM030", `${prefix}シンボル ${s.label} が重複しています。`, "error", s.labelAt));
        broken.add(s);
      } else {
        knownNames.add(key);
      }
    }
    if (s.op === "EQU" && s.label === undefined) {
      issues.push(issue("ASM032", `${prefix}EQU にはラベルが必要です。`, "error", s.opAt));
      broken.add(s);
    }
    if (s.op !== "" && s.op !== "EQU" && !DIRECTIVES.has(s.op) && !MNEMONICS.has(s.op)) {
      const hint = s.args.length === 0 && s.label === undefined && NAME_PATTERN.test(s.op) ? "ラベルには末尾に ':' を付けます。" : "";
      issues.push(issue("ASM020", `${prefix}SC62015 にない命令または疑似命令 '${s.op}' です。${hint}`, "error", s.opAt));
      broken.add(s);
    }
  }

  const equs = new Map<string, { s: Statement; i: number }>();
  statements.forEach((s, i) => {
    if (s.op === "EQU" && s.label !== undefined && !broken.has(s)) equs.set(s.label.toUpperCase(), { s, i });
  });

  const reported = new Set<Statement>();
  const report = (s: Statement, error: AssemblyError): void => {
    if (reported.has(s)) return;
    reported.add(s);
    const prefix = s.where ? `${s.where}: ` : "";
    let at = s.argsAt.end > s.argsAt.start ? s.argsAt : s.whole;
    let message = error.message;
    const undefinedName = /^Undefined:(.+)$/.exec(message);
    if (undefinedName) {
      const name = undefinedName[1];
      message = `未定義のシンボル ${name} です。`;
      if (!s.where) {
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const match = new RegExp(`(?<![A-Za-z_0-9.])${escaped}(?![A-Za-z_0-9.])`, "i").exec(s.text.slice(s.argsColumn));
        if (match) at = { line: s.whole.line, start: s.argsColumn + match.index, end: s.argsColumn + match.index + name.length };
      }
    }
    issues.push(issue(error.code, prefix + message, "error", at));
  };

  let previous = new Map(defines);
  let previousLayout: Array<[number, number]> = [];
  let symbols = new Map(defines);
  let listing: Array<{ s: Statement; address: number; data: Uint8Array }> = [];
  let converged = false;
  let finalPc = 0;
  const binaryFiles = new Map<Statement, Uint8Array>();

  for (let pass = 0; pass < 65; pass += 1) {
    const strict = converged;
    symbols = new Map(defines);
    listing = [];
    const layout: Array<[number, number]> = [];
    let pc = 0;
    const resolving = new Set<string>();
    const equValues = new Map<string, bigint>();

    const resolveFinal = (name: string): bigint => {
      const key = name.toUpperCase();
      const cached = equValues.get(key);
      if (cached !== undefined) return cached;
      const equ = equs.get(key);
      if (equ) {
        if (resolving.has(key)) throw new AssemblyError(`EQU の定義が循環しています: ${name}`, "ASM032");
        resolving.add(key);
        if (equ.s.args.length !== 1) throw new AssemblyError("EQU には式を 1 つ指定します。", "ASM021");
        const v = evaluate(equ.s.args[0], resolveFinal, previousLayout[equ.i]?.[0] ?? 0);
        resolving.delete(key);
        equValues.set(key, v);
        return v;
      }
      const value = previous.get(key);
      if (value === undefined) throw new AssemblyError(`Undefined:${name}`, "ASM031");
      return value;
    };

    statements.forEach((s, index) => {
      let address = pc;
      let data = new Uint8Array(0);
      try {
        if (broken.has(s)) throw new AssemblyError("", "ASM000");
        let missing = false;
        const eval_ = (expression: string): bigint => {
          const symbol = (name: string): bigint => {
            if (strict) return resolveFinal(name);
            const key = name.toUpperCase();
            const v = symbols.get(key) ?? previous.get(key);
            if (v !== undefined) return v;
            missing = true;
            return 0n;
          };
          try {
            return evaluate(expression, symbol, pc);
          } catch (error) {
            if (error instanceof DivideByZeroError && !strict && missing) return 0n;
            throw error;
          }
        };
        const range = (expression: string, min: number, max: number): number => {
          const v = eval_(expression);
          if (v < BigInt(min) || v > BigInt(max)) {
            if (strict) throw new AssemblyError(`値 ${v} が ${min}～${max} の範囲外です。`, "ASM040");
            return min;
          }
          return Number(v);
        };
        const requireCount = (min: number, max = min): void => {
          if (s.args.length < min || s.args.length > max) throw new AssemblyError(`${s.op} のオペランドは ${min === max ? String(min) : `${min}～${max}`} 個です。`, "ASM021");
        };

        if (s.label !== undefined && s.op !== "EQU") symbols.set(s.label.toUpperCase(), BigInt(pc));
        switch (s.op) {
          case "": break;
          case "EQU": requireCount(1); symbols.set(s.label!.toUpperCase(), eval_(s.args[0])); break;
          case "ORG": requireCount(1); pc = range(s.args[0], 0, 0xfffff); address = pc; break;
          case "DB": case "DEFB": case "BYTE": case "DW": case "DEFW": case "WORD": case "DP": {
            if (s.args.length === 0) throw new AssemblyError(`${s.op} にはデータが必要です。`, "ASM021");
            const width = ["DW", "DEFW", "WORD"].includes(s.op) ? 2 : s.op === "DP" ? 3 : 1;
            const values: number[] = [];
            for (const arg of s.args) {
              if (arg.startsWith('"')) {
                if (width !== 1) throw new AssemblyError("文字列は DB でのみ使用できます。", "ASM020");
                for (const c of parseString(arg)) {
                  const code = c.charCodeAt(0);
                  if (code > 255) throw new AssemblyError("DB の文字列は 1 バイト文字のみです。PC-E500 独自文字は数値で指定してください。", "ASM040");
                  values.push(code);
                }
              } else {
                const v = range(arg, -(1 << (width * 8 - 1)), (1 << (width * 8)) - 1);
                for (let i = 0; i < width; i += 1) values.push((v >> (8 * i)) & 0xff);
              }
            }
            data = Uint8Array.from(values);
            break;
          }
          case "DS": case "DEFS": case "SPACE": case "ALIGN": {
            requireCount(1, 2);
            let count = range(s.args[0], s.op === "ALIGN" ? 1 : 0, 0x100000);
            if (s.op === "ALIGN") count = (count - (pc % count)) % count;
            const fill = s.args.length === 2 ? range(s.args[1], 0, 255) : 0;
            data = new Uint8Array(count).fill(fill);
            break;
          }
          case "INCBIN": {
            requireCount(1, 3);
            let raw = binaryFiles.get(s);
            if (raw === undefined) {
              const name = parseString(s.args[0]);
              if (!options.host || !options.filePath) throw new AssemblyError("INCBIN を解決するにはファイルを保存してください。", "ASM060");
              const resolved = findFile(name, s.file, options);
              raw = resolved === undefined ? undefined : options.host.readBinary(resolved);
              if (raw === undefined) throw new AssemblyError(`ファイルが見つかりません: ${name}`, "ASM060");
              binaryFiles.set(s, raw);
            }
            const offset = s.args.length >= 2 ? range(s.args[1], 0, raw.length) : 0;
            const length = s.args.length >= 3 ? range(s.args[2], 0, raw.length - offset) : raw.length - offset;
            data = raw.slice(offset, offset + length);
            break;
          }
          case "ASSERT": requireCount(1); if (eval_(s.args[0]) === 0n && strict) throw new AssemblyError("ASSERT が成立しません。", "ASM070"); break;
          case "END": requireCount(0); break;
          default:
            data = Uint8Array.from(new InstructionEncoder(eval_, pc, strict).encode(s.op, s.args));
            if (strict && (pc & 0xffff) + data.length > 0x10000) throw new AssemblyError("命令が 64 KiB セグメント境界をまたいでいます。", "ASM041");
            break;
        }
        if (pc + data.length > 0x100000) throw new AssemblyError("出力が 20 ビットアドレス空間を超えています。", "ASM050");
      } catch (error) {
        if (!(error instanceof AssemblyError)) throw error;
        if (strict && error.code !== "ASM000") report(s, error);
        // Keep the size from the converged pass so later addresses stay stable and diagnostics do not cascade.
        data = new Uint8Array(strict ? previousLayout[index]?.[1] ?? 0 : 0);
      }
      listing.push({ s, address, data });
      layout.push([address, data.length]);
      pc += data.length;
    });
    finalPc = pc;
    if (strict) break;
    const same = previousLayout.length === layout.length && previousLayout.every((x, i) => x[0] === layout[i][0] && x[1] === layout[i][1])
      && previous.size === symbols.size && [...previous].every(([k, v]) => symbols.get(k) === v);
    converged = same;
    if (!same && pass === 63) {
      issues.push(issue("ASM001", "アドレス配置が収束しません（EQU/ORG の循環など）。", "error", top));
      break;
    }
    previous = symbols;
    previousLayout = layout;
  }

  const emitted = listing.filter(x => x.data.length !== 0);
  let origin = finalPc;
  let endAddress = finalPc;
  if (emitted.length > 0) {
    origin = emitted.reduce((min, x) => Math.min(min, x.address), Number.MAX_SAFE_INTEGER);
    endAddress = emitted.reduce((max, x) => Math.max(max, x.address + x.data.length), 0);
  }
  const binary = new Uint8Array(endAddress - origin);
  const occupied = new Uint8Array(binary.length);
  for (const line of emitted) {
    let overlapReported = false;
    for (let i = 0; i < line.data.length; i += 1) {
      const index = line.address + i - origin;
      if (occupied[index]) {
        if (!overlapReported) {
          const prefix = line.s.where ? `${line.s.where}: ` : "";
          issues.push(issue("ASM050", `${prefix}出力が重複しています: ${(line.address + i).toString(16).toUpperCase().padStart(5, "0")}h`, "error", line.s.whole));
          overlapReported = true;
        }
        continue;
      }
      occupied[index] = 1;
      binary[index] = line.data[i];
    }
  }
  issues.sort((a, b) => a.range.line - b.range.line || a.range.start - b.range.start);
  return { issues, origin, binary, symbols };
}

export function lintAsm(source: string, options: AsmOptions = {}): LintIssue[] {
  return assemble(source, options).issues;
}
