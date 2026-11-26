// *.e500test.json: tests that call a routine of an assembly or BASIC program (or type a
// BASIC line) in the emulator and check registers, memory, variables and the screen.
import * as fs from "node:fs";
import * as path from "node:path";
import { decodeLcd, HEIGHT, WIDTH } from "../lcd/lcdFile";
import { EmulatorClient, Registers } from "./client";
import { loadProgram } from "./prepare";
import { BuildOptions, hex5, parseNumber, Program } from "./program";
import { pcE500Dialect } from "../dialects/pcE500";
import { lint } from "../linter/parser";
import { encodeSource, findVariable, readBasicVariables, shownText, sourceLineNumbers } from "./basic";
import { BasicSession } from "./basicSession";
import { BasicWatch } from "./basicState";
import { plainJson } from "../jsonc";
import { L } from "../l10n";

export type Value = number | string;

export interface Expectations {
  /** A, IL, BA, I, X, Y, U, S, P, F, and the flags C and Z (0 or 1). */
  readonly registers?: Readonly<Record<string, Value>>;
  /** Address (label, expression or number; "(name)" for internal RAM) → bytes, or text (its character codes). */
  readonly memory?: Readonly<Record<string, readonly number[] | string>>;
  /** Text that must be on the LCD (each one, when a list). */
  readonly screen?: string | readonly string[];
  /** A .lcd or .pixels file (relative to the test file) the LCD must be the same as, dot for dot. */
  readonly picture?: string;
  /** BASIC variables: A, XY, B$, D#, P(1). Numbers and text are compared as such. */
  readonly variables?: Readonly<Record<string, Value>>;
  /** How BASIC is left: at its prompt, still running, or with an error (which is a failure otherwise). */
  readonly state?: "ended" | "running" | "error";
  /** Text of the error. */
  readonly error?: string;
}

export interface TestCase {
  readonly name: string;
  /** Routine to call: a label, or an address; in a BASIC program the line of a subroutine. */
  readonly call?: string | number;
  /** How the routine returns: "far" (RETF, as for BASIC's CALL; the default) or "near" (RET). */
  readonly return?: "far" | "near";
  /** BASIC to type at the prompt instead of calling (a newline ends each line). */
  readonly basic?: string;
  /** Typed when the BASIC line has run or waits (INPUT), line by line. */
  readonly type?: string;
  /** BASIC variables set before. */
  readonly variables?: Readonly<Record<string, Value>>;
  /** Keys pressed one after another when the BASIC line has run (or not ended in time); "wait:1" waits a second. */
  readonly keys?: readonly string[];
  /** Registers set before the call. */
  readonly registers?: Readonly<Record<string, Value>>;
  /** Memory written before the call; "(name)" is internal RAM (00h-EEh). */
  readonly memory?: Readonly<Record<string, readonly number[] | string>>;
  readonly expect?: Expectations;
  /** CPU cycles the routine may take (768000 a second; 5 seconds by default). */
  readonly maxCycles?: number;
}

export interface TestFile {
  /** The assembly or BASIC program, relative to the test file. */
  readonly program: string;
  readonly tests: readonly TestCase[];
}

export interface TestResult {
  readonly name: string;
  readonly passed: boolean;
  readonly messages: string[];
  readonly durationMs: number;
}

/** Reads the JSON of a test file; // and /* *\/ comments are allowed. */
export function parseTestFile(text: string): TestFile {
  const spec = JSON.parse(plainJson(text)) as TestFile;
  if (typeof spec.program !== "string") throw new Error(L("\"program\"（.asm か .bas のファイル）がありません。", "\"program\" (a .asm or .bas file) is missing."));
  const isBasic = BASIC_FILE.test(spec.program);
  if (!Array.isArray(spec.tests)) throw new Error(L("\"tests\" の配列がありません。", "The \"tests\" array is missing."));
  // A name that is not known would check nothing, and the test would pass.
  const known = (where: string, o: object, names: readonly string[]): void => {
    if (typeof o !== "object" || o === null || Array.isArray(o)) throw new Error(L(`${where} は { } で書きます。`, `${where} must be an object.`));
    const wrong = Object.keys(o).filter(k => !names.includes(k));
    if (wrong.length > 0) throw new Error(L(`${where} に知らない項目があります: ${wrong.join("、")}（使えるもの: ${names.join(" ")}）`, `${where} has unknown items: ${wrong.join(", ")} (known: ${names.join(" ")})`));
  };
  const bytes = (where: string, o: unknown): void => {
    if (o === undefined) return;
    if (typeof o !== "object" || o === null || Array.isArray(o)) throw new Error(L(`${where} は { } で書きます。`, `${where} must be an object.`));
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === "string") continue;
      if (!Array.isArray(v) || v.length === 0 || v.some(b => !Number.isInteger(b) || b < -128 || b > 255)) throw new Error(L(`${where} の ${k} は、0〜255 の数の配列か文字列です。`, `${where}: ${k} must be a list of numbers 0-255, or text.`));
    }
  };
  const isText = (v: unknown): boolean => typeof v === "string" || (Array.isArray(v) && v.length > 0 && v.every(x => typeof x === "string"));
  known(L("テストのファイル", "The test file"), spec, ["$schema", "program", "tests"]);
  const names = new Set<string>();
  spec.tests.forEach((t, i) => {
    known(`tests[${i}]`, t, ["name", "call", "return", "basic", "type", "keys", "registers", "variables", "memory", "maxCycles", "expect"]);
    if (typeof t.name !== "string") throw new Error(L(`tests[${i}] に "name" がありません。`, `tests[${i}] has no "name".`));
    if (names.has(t.name)) throw new Error(L(`同じ名前のテストがあります: ${t.name}`, `Two tests have the name ${t.name}`));
    names.add(t.name);
    const where = `"${t.name}"`;
    if (isBasic) {
      const not = ["return", "registers"].filter(k => k in t);
      if (not.length > 0) throw new Error(L(`${where}: BASIC のプログラムには使えません: ${not.join("、")}`, `${where}: not for a BASIC program: ${not.join(", ")}`));
      if (t.call !== undefined && (!/^\d+$|^\*[A-Z][A-Z0-9]*$/i.test(String(t.call)))) throw new Error(L(`${where}: "call" はサブルーチンの行番号か *ラベル です。`, `${where}: "call" is the line or *label of a subroutine.`));
    } else if (t.call !== undefined && typeof t.call !== "string") throw new Error(L(`${where}: "call" はラベルか式です。`, `${where}: "call" is a label or an expression.`));
    else if (t.basic === undefined && ("type" in t || "variables" in t)) throw new Error(L(`${where}: "type" と "variables" は "basic" と一緒に使います。`, `${where}: "type" and "variables" go with "basic".`));
    const plain = (what: string, o: unknown): void => {
      if (o === undefined) return;
      if (typeof o !== "object" || o === null || Array.isArray(o)) throw new Error(L(`${what} は { } で書きます。`, `${what} must be an object.`));
      for (const [k, v] of Object.entries(o)) {
        if (!/^[A-Z][A-Z0-9]*[#$]?(?:\([0-9]+(?:,[0-9]+)?\))?$/i.test(k)) throw new Error(L(`${what}: 変数の名前ではありません: ${k}`, `${what}: not the name of a variable: ${k}`));
        if (typeof v !== "string" && !Number.isFinite(v)) throw new Error(L(`${what} の ${k} は、数か文字列です。`, `${what}: ${k} must be a number or text.`));
        if (/\$/.test(k) !== (typeof v === "string")) throw new Error(L(`${what} の ${k}: 文字変数（$）には文字列、ほかには数を書きます。`, `${what}: ${k}: text for $ variables, numbers for the others.`));
      }
    };
    if (t.type !== undefined && typeof t.type !== "string") throw new Error(L(`${where}: "type" は文字列です。`, `${where}: "type" is text.`));
    plain(`${where} "variables"`, t.variables);
    if (t.return !== undefined && t.return !== "far" && t.return !== "near") throw new Error(L(`${where}: "return" は "far" か "near" です。`, `${where}: "return" is "far" or "near".`));
    if (t.basic !== undefined && typeof t.basic !== "string") throw new Error(L(`${where}: "basic" は文字列です。`, `${where}: "basic" is text.`));
    if (!isBasic && t.basic !== undefined && t.call !== undefined) throw new Error(L(`${where}: "basic" と "call" は一緒に書けません。`, `${where}: "basic" and "call" do not go together.`));
    if (!isBasic && t.basic === undefined && t.keys !== undefined) throw new Error(L(`${where}: "keys" は "basic" と一緒に使います。`, `${where}: "keys" goes with "basic".`));
    const registers = (what: string, o: unknown): void => { if (o !== undefined) known(what, o as object, Object.keys(o as object).filter(k => /^(?:A|IL|BA|I|X|Y|U|S|P|F|C|Z)$/i.test(k))); };
    registers(`${where} "registers"`, t.registers);
    registers(`${where} "expect.registers"`, t.expect?.registers);
    if (t.maxCycles !== undefined && !(Number.isInteger(t.maxCycles) && t.maxCycles > 0)) throw new Error(L(`${where}: "maxCycles" は 1 以上の数です。`, `${where}: "maxCycles" is a number above 0.`));
    if (t.keys !== undefined && !(Array.isArray(t.keys) && t.keys.length === 0) && !isText(t.keys)) throw new Error(L(`${where}: "keys" は文字列の配列です。`, `${where}: "keys" is a list of names.`));
    bytes(`${where} "memory"`, t.memory);
    if (t.expect === undefined) return;
    known(`${where} "expect"`, t.expect, ["registers", "memory", "screen", "picture", "variables", "state", "error"]);
    plain(`${where} "expect.variables"`, t.expect.variables);
    if (t.expect.state !== undefined && !["ended", "running", "error"].includes(t.expect.state)) throw new Error(L(`${where}: "state" は "ended"、"running"、"error" のどれかです。`, `${where}: "state" is "ended", "running" or "error".`));
    if (t.expect.error !== undefined && typeof t.expect.error !== "string") throw new Error(L(`${where}: "error" は文字列です。`, `${where}: "error" is text.`));
    if (!isBasic && t.basic === undefined && ["variables", "state", "error"].some(k => k in t.expect!)) throw new Error(L(`${where}: "variables"、"state"、"error" は "basic" のテストで調べます。`, `${where}: "variables", "state" and "error" are checked in tests with "basic".`));
    if (isBasic && t.expect.registers) throw new Error(L(`${where}: BASIC のプログラムでは registers は調べられません。`, `${where}: registers cannot be checked in a BASIC program.`));
    bytes(`${where} "expect.memory"`, t.expect.memory);
    if (t.expect.screen !== undefined && !isText(t.expect.screen)) throw new Error(L(`${where}: "screen" は文字列か文字列の配列です。`, `${where}: "screen" is text or a list of texts.`));
    if (t.expect.picture !== undefined && typeof t.expect.picture !== "string") throw new Error(L(`${where}: "picture" はファイル名です。`, `${where}: "picture" is a file name.`));
  });
  return spec;
}

/** The 0-based line of a test's "name" in the file text (for showing failures there). */
export function testLine(text: string, name: string): number {
  const lines = text.split(/\r?\n/);
  const quoted = JSON.stringify(name);
  const index = lines.findIndex(l => /"name"\s*:/.test(l) && l.includes(quoted));
  return Math.max(0, index);
}

/** What is tested: an assembled program, or the source of a BASIC program. */
export interface BasicTarget { readonly file: string; readonly source: string; readonly errors: readonly string[] }
export type TestTarget = Program | BasicTarget;
const BASIC_FILE = /\.(?:bas|basic|e500)$/i;

/** A program to be tested, by its file name; its mistakes are in `errors`. */
export function testTarget(file: string, source: string, options: () => BuildOptions): TestTarget {
  if (!BASIC_FILE.test(file)) return Program.build(file, source, options());
  const errors = lint(source, pcE500Dialect, { requireLineNumbers: true, checkMissingTargets: true }).filter(i => i.severity === "error");
  return { file, source, errors: errors.map(i => `${path.basename(file)}(${i.range.line + 1}): ${i.message}`) };
}

function valueOf(program: Program | undefined, v: Value): number {
  if (typeof v === "number") return v;
  const n = parseNumber(v);
  if (n === undefined && !program) throw new Error(L(`アドレスではありません: ${v}`, `Not an address: ${v}`));
  return n ?? program!.resolve(v);
}

const MARK_AT = 0xbfe02, MARK = 165;

/** A subroutine of a BASIC program is run from a line put after its last. */
function withCalls(source: string, spec: TestFile): { source: string; lines: Map<string, number> } {
  const lines = new Map<string, number>(), added: string[] = [];
  let next = Math.max(0, ...sourceLineNumbers(source).map(n => n ?? 0));
  // A program that runs past its last line must not come into these.
  if (spec.tests.some(t => t.call !== undefined)) added.push(`${++next} END`);
  for (const call of spec.tests.map(t => t.call).filter(c => c !== undefined).map(String)) {
    if (lines.has(call)) continue;
    if (++next > 65279) throw new Error(L("行番号 65279 の後に、テスト用の行を足せません。", "There is no line number after 65279 for the test."));
    lines.set(call, next);
    // The mark tells a RETURN from an END in the subroutine. No ROM uses the byte but for CALL &HFFFDC.
    added.push(`${next} GOSUB ${call}:POKE ${MARK_AT},${MARK}:END`);
  }
  return { source: added.length > 0 ? `${source.replace(/\u001a\s*$/, "").replace(/\s*$/, "")}\n${added.join("\n")}\n` : source, lines };
}

/** What is typed at the prompt to set variables, a line each. */
function assignments(variables: Readonly<Record<string, Value>>): string {
  return Object.entries(variables).map(([name, v]) => {
    // Codes that have no key (the arrows' 0Eh, 0Fh ...) come from CHR$.
    const text = (t: string): string => t.split(/([^ -!#-~])/).filter(p => p !== "").map(p => /^[^ -!#-~]$/.test(p) ? `CHR$ ${codesOf(p)[0]}` : `"${p}"`).join("+") || '""';
    return `${name.toUpperCase()}=${typeof v === "string" ? text(v) : v}\n`;
  }).join("");
}

function bytesOf(v: readonly number[] | string): number[] {
  return typeof v === "string" ? [...v].map(c => c.charCodeAt(0) & 0xff) : v.map(x => x & 0xff);
}

/** A place in memory; "(name)" is internal RAM, as in a source. */
function placeOf(program: Program | undefined, where: string): { address: number; inside: boolean } {
  const m = /^\s*\((.+)\)\s*$/.exec(where);
  return { address: valueOf(program, m ? m[1] : where), inside: !!m };
}

async function writeBytes(client: EmulatorClient, program: Program | undefined, where: string, data: number[]): Promise<void> {
  const { address, inside } = placeOf(program, where);
  if (inside && (address < 0 || address + data.length > 0xef)) throw new Error(L(`${where} は書ける内部 RAM（00h〜EEh）の外です。`, `${where} is outside the internal RAM that can be written, 00h-EEh.`));
  if (inside) await client.writeInternalMemory(address, Uint8Array.from(data));
  else await client.write(address, Uint8Array.from(data));
}

const hex = (n: number, width = 2): string => n.toString(16).toUpperCase().padStart(width, "0") + "h";

function register(registers: Registers, name: string): number | undefined {
  const key = name.toUpperCase();
  if (key === "C") return registers.F & 1;
  if (key === "Z") return (registers.F >> 1) & 1;
  const value = (registers as unknown as Record<string, number>)[key];
  return typeof value === "number" ? value : undefined;
}

/**
 * Runs the tests of one file on a machine that already has BASIC at its prompt.
 * The machine is saved once with the program in it, and every test starts from there.
 */
export async function runTests(
  client: EmulatorClient,
  target: TestTarget,
  spec: TestFile,
  options: { folder?: string; only?: ReadonlySet<string>; log?: (text: string) => void; onResult?: (result: TestResult) => void; cancelled?: () => boolean } = {}
): Promise<TestResult[]> {
  const program = target instanceof Program ? target : undefined;
  let session: BasicSession | undefined, calls = new Map<string, number>();
  if (program) await loadProgram(client, program, options.log);
  else {
    const { source, lines } = withCalls((target as BasicTarget).source, spec);
    calls = lines;
    session = await BasicSession.load(client, path.basename(target.file), source, options.log);
  }
  try { return await runEach(client, target, program, calls, spec, options, session); } finally { session?.dispose(); }
}

type RunOptions = Parameters<typeof runTests>[3] & object;

/** Whether a variable has this value; text with the codes the machine has for it. */
function hasValue(got: string | undefined, want: Value): boolean {
  if (got === undefined) return false;
  if (typeof want === "number") return Number(got) === want || Math.abs(Number(got) - want) <= Math.abs(want) * 1e-9;
  return got === JSON.stringify(shownText(Buffer.from(codesOf(want))));
}

/** The machine's codes of a text: half-width kana and ¥ have their own, control codes are as they are. */
function codesOf(text: string): number[] {
  return [...text].flatMap(c => {
    const n = c.charCodeAt(0);
    if (n < 0x20 || (n >= 0x7f && n <= 0xff && c !== "¥")) return [n];
    const { bytes, unsupported } = encodeSource(`1${c}`);
    if (unsupported) throw new Error(L(`本体にない文字です: ${c}`, `Not a character of the machine: ${c}`));
    return [bytes[1]];
  });
}

async function runEach(client: EmulatorClient, target: TestTarget, program: Program | undefined, calls: ReadonlyMap<string, number>, spec: TestFile, options: RunOptions, session?: BasicSession): Promise<TestResult[]> {
  const base = await client.saveState(), watch = await BasicWatch.create(client);
  const results: TestResult[] = [];
  for (const test of spec.tests) {
    if (options.only && !options.only.has(test.name)) continue;
    if (options.cancelled?.()) break;
    const started = Date.now();
    const messages: string[] = [];
    try {
      await client.loadState(base);
      session?.restoreDisk();
      for (const [where, data] of Object.entries(test.memory ?? {})) await writeBytes(client, program, where, bytesOf(data));
      let registers: Registers | undefined, running = "", error: string | undefined, broken = false;
      // In a BASIC program a line given with a call gets things ready for it (DIM ...).
      const call = !program && test.call !== undefined ? `GOTO ${calls.get(String(test.call))}` : undefined;
      const line = call ?? test.basic ?? (program ? undefined : "RUN");
      const look = async (): Promise<string> => {
        const now = await watch.look(broken);
        error ??= now.error;
        return now.state;
      };
      const enter = async (text: string): Promise<void> => {
        const typed = await client.type(text);
        if (typed.skipped) messages.push(L(`キーで入力できない文字を省きました: ${typed.skipped}`, `Left out characters that cannot be typed on the keys: ${typed.skipped}`));
        await client.run(768000 * 120, { untilTyped: true, settle: 768000 / 2 });
      };
      const limit = test.maxCycles ?? 768000 * 5;
      if (line !== undefined) {
        await client.tap("C-CE");
        if (call !== undefined && test.basic !== undefined) {
          await enter(test.basic.endsWith("\n") ? test.basic : test.basic + "\n");
          const ready = await watch.look();
          if (ready.state !== "ended") throw new Error(L(`準備の "basic" が終わりません（${ready.error ?? ready.state}）。`, `The "basic" before the call did not end (${ready.error ?? ready.state}).`));
        }
        if (test.variables) {
          await enter(assignments(test.variables));
          const { variables } = await readBasicVariables((at, n) => client.read(at, n), client.info?.internalKB ?? 32);
          for (const [name, v] of Object.entries(test.variables))
            if (!hasValue(findVariable(variables, name)?.value, v)) throw new Error(L(`変数 ${name} に ${JSON.stringify(v)} を入れられません（今の値 ${findVariable(variables, name)?.value ?? "なし"}）。`, `The variable ${name} cannot be set to ${JSON.stringify(v)} (it is ${findVariable(variables, name)?.value ?? "not there"}).`));
        }
        if (call !== undefined) await client.write(MARK_AT, Uint8Array.of(0));
        const typed = await client.type(line.endsWith("\n") ? line : line + "\n");
        if (typed.skipped) messages.push(L(`キーで入力できない文字を省きました: ${typed.skipped}`, `Left out characters that cannot be typed on the keys: ${typed.skipped}`));
        // Typing a line takes its time too: it does not count.
        const run = await client.run(768000 * 120, { untilTyped: true, settle: 768000 / 2 });
        if (run.reason === "exception") messages.push(L(`未定義命令で止まりました（PC=${hex5(run.pc)}）。`, `Stopped on an undefined instruction (PC=${hex5(run.pc)}).`));
        // Wait for a program started by the line to finish (BUSY goes out), within the limit.
        let spent = 768000 / 2;
        for (const [i, answer] of (test.type ?? "").split("\n").entries()) {
          const more = i < (test.type ?? "").split("\n").length - 1;
          if (answer === "" && !more) break;
          await enter(answer + (more ? "\n" : ""));
        }
        while ((await client.mode()).busy && spent < limit) spent += (await client.run(768000 / 4)).cycles;
        // The message of an error takes a moment more.
        if (!(await client.mode()).busy) await client.run(768000 / 4);
        await look();
        if (spent >= limit && !test.keys && (await client.mode()).busy) running = L(`（まだ実行中です。maxCycles ${limit}）`, ` (still running: maxCycles ${limit})`);
        for (const key of test.keys ?? []) {
          const pause = /^wait:(\d+(?:\.\d+)?)$/i.exec(key);
          if (pause) await client.run(768000 * Number(pause[1]));
          else {
            broken = broken || key.toUpperCase() === "ON/BRK";
            await client.key(key, true);
            await client.run(768000 / 5);
            await client.key(key, false);
            await client.run(768000);
          }
          await look();
        }
        registers = await client.registers();
      } else {
        const entry = program!.entry(test.call as string | undefined);
        const set: Record<string, number> = {};
        for (const [name, v] of Object.entries(test.registers ?? {})) set[name.toUpperCase()] = valueOf(program, v);
        await client.call(entry, test.return !== "near", set);
        const run = await client.run(limit);
        if (run.reason === "return") registers = run.registers;
        else if (run.reason === "timeout") {
          const at = `PC=${hex5(run.pc)}${program!.symbolFor(run.pc) ? " " + program!.symbolFor(run.pc) : ""}`;
          messages.push(L(`${limit} サイクル以内に戻りませんでした（${at}）。`, `Did not return within ${limit} cycles (${at}).`));
        }
        else if (run.reason === "exception") messages.push(L(`未定義命令で止まりました（PC=${hex5(run.pc)}）。`, `Stopped on an undefined instruction (PC=${hex5(run.pc)}).`));
        else messages.push(L(`ブレークポイントで止まりました（PC=${hex5(run.pc)}）。`, `Stopped at a breakpoint (PC=${hex5(run.pc)}).`));
      }
      const expect = test.expect ?? {};
      if (registers) {
        for (const [name, v] of Object.entries(expect.registers ?? {})) {
          const got = register(registers, name);
          const want = valueOf(program, v);
          if (got === undefined) messages.push(L(`レジスタ ${name} はありません。`, `There is no register ${name}.`));
          else if (got !== want) messages.push(L(`${name.toUpperCase()}: 期待 ${want}（${hex(want)}）、実際 ${got}（${hex(got)}）`, `${name.toUpperCase()}: expected ${want} (${hex(want)}), got ${got} (${hex(got)})`));
        }
      }
      for (const [where, data] of Object.entries(expect.memory ?? {})) {
        const want = bytesOf(data), { address, inside } = placeOf(program, where);
        if (inside && (address < 0 || address + want.length > 256)) {
          messages.push(L(`${where} は内部 RAM（00h〜FFh）の外です（${hex5(address)}）。外部メモリなら括弧を付けません。`, `${where} is outside internal RAM, 00h-FFh (${hex5(address)}). Memory is written without the brackets.`));
          continue;
        }
        const got = [...inside ? (await client.internalMemory()).subarray(address, address + want.length) : await client.read(address, want.length)];
        if (got.length !== want.length || got.some((b, i) => b !== want[i])) {
          const wanted = want.map(b => hex(b, 2).slice(0, 2)).join(" "), actual = got.map(b => hex(b, 2).slice(0, 2)).join(" ");
          messages.push(L(`${where}（${inside ? hex(address) : hex5(address)}）: 期待 ${wanted}、実際 ${actual}`, `${where} (${inside ? hex(address) : hex5(address)}): expected ${wanted}, got ${actual}`));
        }
      }
      if (line !== undefined) {
        const now = await look(), state = now === "menu" || now === "running" ? now : error !== undefined ? "error" : "ended";
        const wanted = expect.state ?? (expect.error !== undefined ? "error" : undefined);
        const shown = ((await client.screen()).text ?? "").trim();
        // A subroutine comes back; a program may go on.
        if (wanted !== undefined ? state !== wanted : state === "menu" || (!program && (state === "error" || (call !== undefined && state === "running"))))
          messages.push(L(`状態: 期待 ${wanted ?? "ended か running"}、実際 ${state === "menu" ? L("BASIC の外（暴走）", "") : state}${error ? `（${error}）` : ""}。画面:\n${shown}`, `State: expected ${wanted ?? "ended or running"}, got ${state === "menu" ? "out of BASIC (a crash)" : state}${error ? ` (${error})` : ""}. Screen:\n${shown}`));
        if (call !== undefined && wanted === undefined && state === "ended" && (await client.read(MARK_AT, 1))[0] !== MARK)
          messages.push(L("RETURN で戻りませんでした（サブルーチンの中で終わっています）。", "It did not RETURN: the program ended inside the subroutine."));
        if (expect.error !== undefined && !(error ?? "").includes(expect.error)) messages.push(L(`エラー: 期待「${expect.error}」、実際「${error ?? "なし"}」`, `Error: expected "${expect.error}", got "${error ?? "none"}"`));
      }
      if (expect.variables) {
        const { variables } = await readBasicVariables((at, n) => client.read(at, n), client.info?.internalKB ?? 32);
        for (const [name, want] of Object.entries(expect.variables)) {
          const got = findVariable(variables, name)?.value;
          if (!hasValue(got, want)) messages.push(L(`${name}: 期待 ${JSON.stringify(want)}、実際 ${got ?? "（変数がない）"}`, `${name}: expected ${JSON.stringify(want)}, got ${got ?? "(no such variable)"}`));
        }
      }
      if (expect.screen !== undefined) {
        const text = (await client.screen()).text ?? "";
        for (const want of typeof expect.screen === "string" ? [expect.screen] : expect.screen)
          if (!text.includes(want)) messages.push(L(`画面に「${want}」がありません${running}。画面:\n${text}`, `"${want}" is not on the screen${running}. Screen:\n${text}`));
      }
      if (expect.picture !== undefined) {
        const want = decodeLcd(fs.readFileSync(path.resolve(options.folder ?? path.dirname(target.file), expect.picture)));
        const shown = Buffer.from((await client.screen()).pixels, "base64");
        if (!want) messages.push(L(`${expect.picture} は LCD の絵ではありません。`, `${expect.picture} is not an LCD picture.`));
        else {
          const wrong = [...want.dots.keys()].filter(i => ((shown[i >> 3] >> (7 - (i & 7))) & 1) !== want.dots[i]);
          if (wrong.length > 0) messages.push(L(`${expect.picture} と ${wrong.length} ドット違います（最初は x=${wrong[0] % WIDTH}, y=${Math.floor(wrong[0] / WIDTH)}。全部で ${WIDTH * HEIGHT} ドット）。`, `${wrong.length} of ${WIDTH * HEIGHT} dots differ from ${expect.picture} (the first at x=${wrong[0] % WIDTH}, y=${Math.floor(wrong[0] / WIDTH)}).`));
        }
      }
    } catch (error) {
      messages.push(error instanceof Error ? error.message : String(error));
    }
    const result: TestResult = { name: test.name, passed: messages.length === 0, messages, durationMs: Date.now() - started };
    results.push(result);
    options.onResult?.(result);
  }
  return results;
}
