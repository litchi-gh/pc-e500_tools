// Port of Assembler/src/E500Assembler.Core/Assembler.cs, adapted to collect diagnostics
// for an editor instead of stopping at the first error.
import * as path from "node:path";
import { LintIssue, Severity } from "../core";
import { L } from "../l10n";
import { InstructionEncoder, MNEMONICS } from "./encoder";
import { AssemblyError, evaluate, parseBytes, parseString, splitOperands, stripComment, ValueError } from "./expression";

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
  /** Where the bytes go with no ORG (0). */
  readonly origin?: number;
  /** What gaps and DS are filled with (0). */
  readonly fill?: number;
}

/** A line of the listing: every statement, also those with no bytes. */
export interface ListedLine {
  readonly file: string;
  /** 0-based line number in that file. */
  readonly line: number;
  readonly address: number;
  readonly data: Uint8Array;
}

/** Where the bytes of one source line went (for breakpoints and the call stack). */
export interface AsmLine {
  /** Absolute path of the file the line is in ("<input>" for unsaved text). */
  readonly file: string;
  /** 0-based line number in that file. */
  readonly line: number;
  readonly address: number;
  readonly length: number;
  /** An instruction (true) or data from DB, DS, INCBIN... (false). */
  readonly code: boolean;
}

export interface AsmResult {
  readonly issues: LintIssue[];
  readonly origin: number;
  readonly binary: Uint8Array;
  readonly symbols: ReadonlyMap<string, bigint>;
  /** Lines that produced bytes, in source order. */
  readonly lines: readonly AsmLine[];
  /** Labels (not EQU constants), upper-cased, with their addresses. */
  readonly labels: ReadonlyMap<string, number>;
  readonly listing: readonly ListedLine[];
  /** The symbols' names as they were first written, by their names in capitals. */
  readonly names: ReadonlyMap<string, string>;
  /** Every file read: the source, INCLUDE and INCBIN. */
  readonly inputFiles: readonly string[];
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
  /** 0-based line within `file`. */
  readonly sourceLine: number;
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
        file, sourceLine: line, where, text, label: name, op: "EQU", args: [equMatch[2]], argsColumn, whole,
        labelAt: at(cursor, cursor + name.length), opAt: at(opColumn, argsColumn), argsAt: at(argsColumn, body.length)
      };
    }
  }
  if (s.length === 0) {
    return { file, sourceLine: line, where, text, label, op: "", args: [], argsColumn: cursor, whole, labelAt, opAt: at(cursor, cursor), argsAt: at(cursor, cursor) };
  }
  let opEnd = 0;
  while (opEnd < s.length && !/\s/.test(s[opEnd])) opEnd += 1;
  let op = s.slice(0, opEnd).toUpperCase();
  if (op.startsWith(".") && DIRECTIVES.has(op.slice(1))) op = op.slice(1);
  const rest = s.slice(opEnd);
  const argsColumn = cursor + opEnd + (rest.length - rest.trimStart().length);
  return {
    file, sourceLine: line, where, text, label, op, args: splitOperands(rest), argsColumn, whole,
    labelAt, opAt: at(cursor, cursor + opEnd), argsAt: at(argsColumn, body.length)
  };
}

export function findFile(givenName: string, sourceFile: string, options: AsmOptions): string | undefined {
  const host = options.host;
  if (!host) return undefined;
  // Windows で書いたソースの "inc\\defs.inc" も、ほかの OS で開けるようにする（e500asm と同じ）
  const name = path.sep === "/" ? givenName.replace(/\\/g, "/") : givenName;
  const candidates = [path.resolve(path.dirname(sourceFile), name), ...(options.includeDirectories ?? []).map(dir => path.resolve(dir, name))];
  for (const candidate of candidates) {
    if (host.readText(candidate) !== undefined) return path.resolve(candidate);
  }
  return undefined;
}

class NeededError extends Error {
  constructor(readonly needed: string) { super(needed); }
}

export function assemble(source: string, options: AsmOptions = {}): AsmResult {
  const issues: LintIssue[] = [];
  const statements: Statement[] = [];
  const mainFile = options.filePath ? path.resolve(options.filePath) : "<input>";
  const active = new Set<string>([mainFile]);
  const inputFiles = new Set<string>([mainFile]);
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
        // The label is there all the same: what uses it is not wrong.
        const label = /^\s*([A-Za-z_.][A-Za-z_0-9.]*)\s*:/.exec(line)?.[1];
        if (label) statements.push({ file, sourceLine: n, where, text: line, label, op: "", args: [], argsColumn: line.length, whole: lineAt, labelAt: lineAt, opAt: lineAt, argsAt: lineAt });
        continue;
      }
      if (statement.op === "INCLUDE") {
        if (statement.args.length !== 1) {
          issues.push(issue("ASM021", prefix + L("INCLUDE にはファイル名を 1 つ指定します。", "INCLUDE takes one file name."), "error", statement.whole));
          continue;
        }
        if (statement.label !== undefined) {
          issues.push(issue("ASM020", prefix + L("INCLUDE にラベルは付けられません。", "INCLUDE cannot have a label."), "error", statement.labelAt));
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
          issues.push(issue("ASM060", prefix + L("INCLUDE を解決するにはファイルを保存してください。", "Save the file to resolve INCLUDE."), "warning", statement.whole));
          continue;
        }
        const resolved = findFile(name, file, options);
        if (resolved === undefined) {
          issues.push(issue("ASM060", prefix + L(`ファイルが見つかりません: ${name}`, `File not found: ${name}`), "error", statement.argsAt));
          continue;
        }
        if (active.size >= 64 || active.has(resolved)) {
          issues.push(issue("ASM060", prefix + L(`INCLUDE が再帰しています: ${name}`, `Recursive INCLUDE: ${name}`), "error", statement.argsAt));
          continue;
        }
        active.add(resolved);
        inputFiles.add(resolved);
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
      issues.push(issue("ASM030", L(`設定 pcE500.asm.defines のシンボル名 ${name} が不正です。`, `Invalid symbol name ${name} in the setting pcE500.asm.defines.`), "error", top));
      continue;
    }
    if (typeof value !== "number" || !Number.isFinite(value)) {
      issues.push(issue("ASM030", L(`設定 pcE500.asm.defines の ${name} の値は数にしてください。`, `The value of ${name} in the setting pcE500.asm.defines must be a number.`), "error", top));
      continue;
    }
    defines.set(name.toUpperCase(), BigInt(Math.trunc(value)));
  }

  // Checks that do not need addresses. Statements failing them are skipped in the passes below.
  const knownNames = new Set(defines.keys());
  const broken = new Set<Statement>();
  const duplicates = new Set<Statement>();
  for (const s of statements) {
    const prefix = s.where ? `${s.where}: ` : "";
    if (s.label !== undefined) {
      const key = s.label.toUpperCase();
      if (knownNames.has(key)) {
        issues.push(issue("ASM030", prefix + L(`シンボル ${s.label} が重複しています。`, `Duplicate symbol ${s.label}.`), "error", s.labelAt));
        broken.add(s);
        duplicates.add(s);
      } else {
        knownNames.add(key);
      }
    }
    if (s.op === "EQU" && s.label === undefined) {
      issues.push(issue("ASM032", prefix + L("EQU にはラベルが必要です。", "EQU needs a label."), "error", s.opAt));
      broken.add(s);
    }
    if (s.op !== "" && s.op !== "EQU" && !DIRECTIVES.has(s.op) && !MNEMONICS.has(s.op)) {
      const hint = s.args.length === 0 && s.label === undefined && NAME_PATTERN.test(s.op) ? L("ラベルには末尾に ':' を付けます。", " A label ends with ':'.") : "";
      issues.push(issue("ASM020", prefix + L(`SC62015 にない命令または疑似命令 '${s.op}' です。`, `'${s.op}' is not an SC62015 instruction or directive.`) + hint, "error", s.opAt));
      broken.add(s);
    }
  }

  const equs = new Map<string, { s: Statement; i: number }>();
  statements.forEach((s, i) => {
    if (s.op === "EQU" && s.label !== undefined && !broken.has(s)) equs.set(s.label.toUpperCase(), { s, i });
  });

  const labelNames = new Set(statements.filter(s => s.label !== undefined && s.op !== "EQU").map(s => s.label!.toUpperCase()));

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
      message = L(`未定義のシンボル ${name} です。`, `Undefined symbol ${name}.`);
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
    let pc = options.origin ?? 0;
    const equValues = new Map<string, bigint>();

    const known = (name: string): bigint => {
      const key = name.toUpperCase();
      const cached = equValues.get(key);
      if (cached !== undefined) return cached;
      if (equs.has(key)) throw new NeededError(name);
      const value = previous.get(key);
      if (value === undefined) throw new AssemblyError(`Undefined:${name}`, "ASM031");
      return value;
    };
    // An EQU needs other EQUs: these are worked out first, from a list and not by recursion, which a long chain would overflow.
    const resolveFinal = (name: string): bigint => {
      if (!equs.has(name.toUpperCase()) || equValues.has(name.toUpperCase())) return known(name);
      const waiting = [name.toUpperCase()], resolving = new Set(waiting);
      while (waiting.length > 0) {
        const top = waiting[waiting.length - 1], equ = equs.get(top)!;
        if (equ.s.args.length !== 1) throw new AssemblyError(L("EQU には式を 1 つ指定します。", "EQU takes one expression."), "ASM021");
        try {
          equValues.set(top, evaluate(equ.s.args[0], known, previousLayout[equ.i]?.[0] ?? 0));
          waiting.pop();
          resolving.delete(top);
        } catch (error) {
          if (!(error instanceof NeededError)) throw error;
          const key = error.needed.toUpperCase();
          if (resolving.has(key)) throw new AssemblyError(L(`EQU の定義が循環しています: ${error.needed}`, `Circular EQU definition: ${error.needed}`), "ASM032");
          waiting.push(key);
          resolving.add(key);
        }
      }
      return equValues.get(name.toUpperCase())!;
    };

    statements.forEach((s, index) => {
      let address = pc;
      let data = new Uint8Array(0);
      try {
        if (broken.has(s)) {
          if (s.label !== undefined && s.op !== "EQU" && !duplicates.has(s)) symbols.set(s.label.toUpperCase(), BigInt(pc));
          throw new AssemblyError("", "ASM000");
        }
        const eval_ = (expression: string): bigint => {
          const symbol = (name: string): bigint => {
            if (strict) return resolveFinal(name);
            const key = name.toUpperCase();
            const v = symbols.get(key) ?? previous.get(key);
            if (v !== undefined) return v;
            return 0n;
          };
          try {
            return evaluate(expression, symbol, pc);
          } catch (error) {
            if (error instanceof ValueError && !strict) return 0n;
            throw error;
          }
        };
        // Whether an expression names a label of the lowest 64 KB (a number below 10000h is an offset in the segment).
        const lowLabel = (expression: string): boolean => (expression.match(/[A-Za-z_.][A-Za-z_0-9.]*/g) ?? []).some(n => {
          const at = labelNames.has(n.toUpperCase()) ? previous.get(n.toUpperCase()) : undefined;
          return at !== undefined && at <= 0xffffn;
        });
        const range = (expression: string, min: number, max: number): number => {
          const v = eval_(expression);
          if (v < BigInt(min) || v > BigInt(max)) {
            if (strict) throw new AssemblyError(L(`値 ${v} が ${min}～${max} の範囲外です。`, `The value ${v} is outside ${min} to ${max}.`), "ASM040");
            return min;
          }
          return Number(v);
        };
        const requireCount = (min: number, max = min): void => {
          if (s.args.length < min || s.args.length > max) throw new AssemblyError(L(`${s.op} のオペランドは ${min === max ? String(min) : `${min}～${max}`} 個です。`, `${s.op} takes ${min === max ? String(min) : `${min} to ${max}`} operand${max === 1 ? "" : "s"}.`), "ASM021");
        };

        if (s.label !== undefined && s.op !== "EQU") symbols.set(s.label.toUpperCase(), BigInt(pc));
        switch (s.op) {
          case "": break;
          case "EQU": requireCount(1); symbols.set(s.label!.toUpperCase(), eval_(s.args[0])); break;
          case "ORG": requireCount(1); pc = range(s.args[0], 0, 0xfffff); address = pc; break;
          case "DB": case "DEFB": case "BYTE": case "DW": case "DEFW": case "WORD": case "DP": {
            if (s.args.length === 0) throw new AssemblyError(L(`${s.op} にはデータが必要です。`, `${s.op} needs data.`), "ASM021");
            const width = ["DW", "DEFW", "WORD"].includes(s.op) ? 2 : s.op === "DP" ? 3 : 1;
            const values: number[] = [];
            for (const arg of s.args) {
              if (arg.startsWith('"')) {
                if (width !== 1) throw new AssemblyError(L("文字列は DB でのみ使用できます。", "Strings are allowed in DB only."), "ASM020");
                for (const c of parseBytes(arg)) values.push(c.charCodeAt(0));
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
            const fill = s.args.length === 2 ? range(s.args[1], 0, 255) : options.fill ?? 0;
            data = new Uint8Array(count).fill(fill);
            break;
          }
          case "INCBIN": {
            requireCount(1, 3);
            let raw = binaryFiles.get(s);
            if (raw === undefined) {
              const name = parseString(s.args[0]);
              if (!options.host || !options.filePath) throw new AssemblyError(L("INCBIN を解決するにはファイルを保存してください。", "Save the file to resolve INCBIN."), "ASM060");
              const resolved = findFile(name, s.file, options);
              raw = resolved === undefined ? undefined : options.host.readBinary(resolved);
              if (raw === undefined) throw new AssemblyError(L(`ファイルが見つかりません: ${name}`, `File not found: ${name}`), "ASM060");
              binaryFiles.set(s, raw);
              inputFiles.add(resolved!);
            }
            const offset = s.args.length >= 2 ? range(s.args[1], 0, raw.length) : 0;
            const length = s.args.length >= 3 ? range(s.args[2], 0, raw.length - offset) : raw.length - offset;
            data = raw.slice(offset, offset + length);
            break;
          }
          case "ASSERT": requireCount(1); if (eval_(s.args[0]) === 0n && strict) throw new AssemblyError(L("ASSERT が成立しません。", "ASSERT failed."), "ASM070"); break;
          case "END": requireCount(0); break;
          default:
            data = Uint8Array.from(new InstructionEncoder(eval_, pc, strict, lowLabel).encode(s.op, s.args));
            if (strict && (pc & 0xffff) + data.length > 0x10000) throw new AssemblyError(L("命令が 64 KiB セグメント境界をまたいでいます。", "The instruction crosses a 64 KiB segment boundary."), "ASM041");
            break;
        }
        // Before the last pass the layout is provisional, and may reach too far for a while.
        if (pc + data.length > (strict ? 0x100000 : 0x200000)) throw new AssemblyError(L("出力が 20 ビットアドレス空間を超えています。", "The output goes beyond the 20-bit address space."), "ASM050");
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
      issues.push(issue("ASM001", L("アドレス配置が収束しません（EQU/ORG の循環など）。", "Addresses do not settle (a circular EQU or ORG, for example)."), "error", top));
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
  const binary = new Uint8Array(endAddress - origin).fill(options.fill ?? 0);
  const occupied = new Uint8Array(binary.length);
  for (const line of emitted) {
    let overlapReported = false;
    for (let i = 0; i < line.data.length; i += 1) {
      const index = line.address + i - origin;
      if (occupied[index]) {
        if (!overlapReported) {
          const prefix = line.s.where ? `${line.s.where}: ` : "";
          issues.push(issue("ASM050", prefix + L(`出力が重複しています: ${(line.address + i).toString(16).toUpperCase().padStart(5, "0")}h`, `Output overlaps at ${(line.address + i).toString(16).toUpperCase().padStart(5, "0")}h`), "error", line.s.whole));
          overlapReported = true;
        }
        continue;
      }
      occupied[index] = 1;
      binary[index] = line.data[i];
    }
  }
  issues.sort((a, b) => a.range.line - b.range.line || a.range.start - b.range.start);
  const lines: AsmLine[] = emitted.map(x => ({ file: x.s.file, line: x.s.sourceLine, address: x.address, length: x.data.length, code: !DIRECTIVES.has(x.s.op) }));
  const labels = new Map<string, number>();
  for (const x of listing) if (x.s.label !== undefined && x.s.op !== "EQU") labels.set(x.s.label.toUpperCase(), Number(symbols.get(x.s.label.toUpperCase()) ?? BigInt(x.address)));
  const names = new Map<string, string>();
  for (const n of [...Object.keys(options.defines ?? {}), ...listing.flatMap(x => (x.s.label === undefined ? [] : [x.s.label]))]) if (!names.has(n.toUpperCase())) names.set(n.toUpperCase(), n);
  return { issues, origin, binary, symbols, lines, labels, names, listing: listing.map(x => ({ file: x.s.file, line: x.s.sourceLine, address: x.address, data: x.data })), inputFiles: [...inputFiles] };
}

export function lintAsm(source: string, options: AsmOptions = {}): LintIssue[] {
  return assemble(source, options).issues;
}
