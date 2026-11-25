// *.e500test.json: tests that call a routine of an assembly program (or type a
// BASIC line) in the emulator and check registers, memory and the screen.
import * as fs from "node:fs";
import * as path from "node:path";
import { decodeLcd, HEIGHT, WIDTH } from "../lcd/lcdFile";
import { EmulatorClient, Registers } from "./client";
import { loadProgram } from "./prepare";
import { hex5, parseNumber, Program } from "./program";
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
}

export interface TestCase {
  readonly name: string;
  /** Routine to call: a label, or an address. */
  readonly call?: string;
  /** How the routine returns: "far" (RETF, as for BASIC's CALL; the default) or "near" (RET). */
  readonly return?: "far" | "near";
  /** BASIC to type at the prompt instead of calling (a newline ends each line). */
  readonly basic?: string;
  /** Keys pressed one after another when the BASIC line has run (or not ended in time). */
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
  /** The assembly program, relative to the test file. */
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
  if (typeof spec.program !== "string") throw new Error(L("\"program\"（アセンブリのファイル）がありません。", "\"program\" (the assembly file) is missing."));
  if (!Array.isArray(spec.tests)) throw new Error(L("\"tests\" の配列がありません。", "The \"tests\" array is missing."));
  spec.tests.forEach((t, i) => { if (typeof t.name !== "string") throw new Error(L(`tests[${i}] に "name" がありません。`, `tests[${i}] has no "name".`)); });
  return spec;
}

/** The 0-based line of a test's "name" in the file text (for showing failures there). */
export function testLine(text: string, name: string): number {
  const lines = text.split(/\r?\n/);
  const quoted = JSON.stringify(name);
  const index = lines.findIndex(l => /"name"\s*:/.test(l) && l.includes(quoted));
  return Math.max(0, index);
}

function valueOf(program: Program, v: Value): number {
  if (typeof v === "number") return v;
  return parseNumber(v) ?? program.resolve(v);
}

function bytesOf(v: readonly number[] | string): number[] {
  return typeof v === "string" ? [...v].map(c => c.charCodeAt(0) & 0xff) : v.map(x => x & 0xff);
}

/** A place in memory; "(name)" is internal RAM, as in a source. */
function placeOf(program: Program, where: string): { address: number; inside: boolean } {
  const m = /^\s*\((.+)\)\s*$/.exec(where);
  return { address: valueOf(program, m ? m[1] : where), inside: !!m };
}

async function writeBytes(client: EmulatorClient, program: Program, where: string, data: number[]): Promise<void> {
  const { address, inside } = placeOf(program, where);
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
  program: Program,
  spec: TestFile,
  options: { folder?: string; only?: ReadonlySet<string>; log?: (text: string) => void; onResult?: (result: TestResult) => void; cancelled?: () => boolean } = {}
): Promise<TestResult[]> {
  await loadProgram(client, program, options.log);
  const base = await client.saveState();
  const results: TestResult[] = [];
  for (const test of spec.tests) {
    if (options.only && !options.only.has(test.name)) continue;
    if (options.cancelled?.()) break;
    const started = Date.now();
    const messages: string[] = [];
    try {
      await client.loadState(base);
      for (const [where, data] of Object.entries(test.memory ?? {})) await writeBytes(client, program, where, bytesOf(data));
      let registers: Registers | undefined, running = "";
      const limit = test.maxCycles ?? 768000 * 5;
      if (test.basic !== undefined) {
        await client.tap("C-CE");
        const typed = await client.type(test.basic.endsWith("\n") ? test.basic : test.basic + "\n");
        if (typed.skipped) messages.push(L(`キーで入力できない文字を省きました: ${typed.skipped}`, `Left out characters that cannot be typed on the keys: ${typed.skipped}`));
        // Typing a line takes its time too: it does not count.
        const run = await client.run(768000 * 120, { untilTyped: true, settle: 768000 / 2 });
        if (run.reason === "exception") messages.push(L(`未定義命令で止まりました（PC=${hex5(run.pc)}）。`, `Stopped on an undefined instruction (PC=${hex5(run.pc)}).`));
        // Wait for a program started by the line to finish (BUSY goes out), within the limit.
        let spent = 768000 / 2;
        while ((await client.mode()).busy && spent < limit) spent += (await client.run(768000 / 4)).cycles;
        if (spent >= limit && !test.keys && (await client.mode()).busy) running = L(`（まだ実行中です。maxCycles ${limit}）`, ` (still running: maxCycles ${limit})`);
        for (const key of test.keys ?? []) {
          await client.key(key, true);
          await client.run(768000 / 5);
          await client.key(key, false);
          await client.run(768000);
        }
        registers = await client.registers();
      } else {
        const entry = program.entry(test.call);
        const set: Record<string, number> = {};
        for (const [name, v] of Object.entries(test.registers ?? {})) set[name.toUpperCase()] = valueOf(program, v);
        await client.call(entry, test.return !== "near", set);
        const run = await client.run(limit);
        if (run.reason === "return") registers = run.registers;
        else if (run.reason === "timeout") {
          const at = `PC=${hex5(run.pc)}${program.symbolFor(run.pc) ? " " + program.symbolFor(run.pc) : ""}`;
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
        const got = [...inside ? (await client.internalMemory()).subarray(address, address + want.length) : await client.read(address, want.length)];
        if (got.some((b, i) => b !== want[i])) {
          const wanted = want.map(b => hex(b, 2).slice(0, 2)).join(" "), actual = got.map(b => hex(b, 2).slice(0, 2)).join(" ");
          messages.push(L(`${where}（${inside ? hex(address) : hex5(address)}）: 期待 ${wanted}、実際 ${actual}`, `${where} (${inside ? hex(address) : hex5(address)}): expected ${wanted}, got ${actual}`));
        }
      }
      if (expect.screen !== undefined) {
        const text = (await client.screen()).text ?? "";
        for (const want of typeof expect.screen === "string" ? [expect.screen] : expect.screen)
          if (!text.includes(want)) messages.push(L(`画面に「${want}」がありません${running}。画面:\n${text}`, `"${want}" is not on the screen${running}. Screen:\n${text}`));
      }
      if (expect.picture !== undefined) {
        const want = decodeLcd(fs.readFileSync(path.resolve(options.folder ?? path.dirname(program.file), expect.picture)));
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
