#!/usr/bin/env node
// e500: what the extension does, from a command line (bin/e500, bin/e500.cmd). It is for
// programs that cannot press F5: scripts, and Claude Code, Codex and the like.
//
// Exit codes: 0 done, 1 the program has mistakes or a test failed, 2 the command was
// given wrongly or something it needs is missing.
import * as fs from "node:fs";
import * as path from "node:path";
import { createInterface } from "node:readline";
import { AsmHost, assemble, lintAsm } from "../asm/assembler";
import { disassemble, DisassemblyError, isSaveM, readImage } from "../asm/disassembler";
import { LintIssue } from "../core";
import { pcE500Dialect } from "../dialects/pcE500";
import { driveName, encodeSource } from "../emu/basic";
import { BasicSession } from "../emu/basicSession";
import { BasicWatch } from "../emu/basicState";
import { EmulatorClient } from "../emu/client";
import { basicCall, loadProgram, startMachine } from "../emu/prepare";
import { hex5, parseNumber, Program } from "../emu/program";
import { parseTestFile, runTests, TestResult, testTarget } from "../emu/testfile";
import { L, setLanguage } from "../l10n";
import { lint } from "../linter/parser";
import { basicLines, binName, isProgramName, loadMFile, loadMOrigin, sharesName } from "../project/loadM";
import { templates } from "../project/templates";
import { lookup, words } from "./lookup";
import { addressOption, Arguments, defines, expressionValue, extensionRoot, find, last, machine, numberOption, parseArguments, UsageError } from "./options";
import { lcdPng } from "./png";
import { intelHex, listingText, symbolText } from "./output";
import * as os from "node:os";
import { guideText, guideTopics, installSkill, installStub } from "./skill";

const HZ = 768000;
const print = (text = ""): void => { process.stdout.write(text + "\n"); };
const note = (text: string): void => { process.stderr.write(text + "\n"); };

const host: AsmHost = {
  readText: f => { try { return fs.readFileSync(f, "utf8"); } catch { return undefined; } },
  readBinary: f => { try { return fs.readFileSync(f); } catch { return undefined; } }
};

const MACHINE = ["emulator", "rom", "ram", "core", "server"], ASM = ["include", "define"];
const COMMANDS: Record<string, { options: string[]; run: (a: Arguments) => Promise<number> | number; usage: string }> = {
  asm: { options: ["out", "format", "listing", "symbols", "org", "fill", ...ASM], run: asmCommand, usage: "asm FILE.asm [-o FILE] [-f bin|hex|ce140f] [-l LISTING] [-s SYMBOLS] [--org ADDRESS] [--fill N] [-I FOLDER] [-D NAME=VALUE]" },
  dis: { options: ["out", "format", "org", "force", "no-labels", "no-addresses", "no-bytes"], run: disCommand, usage: "dis FILE [-f raw|ce140f] [--org ADDRESS] [-o FILE.asm] [--force] [--no-labels] [--no-addresses] [--no-bytes]" },
  lint: { options: ["json", ...ASM], run: lintCommand, usage: "lint FILE|FOLDER..." },
  test: { options: ["json", "only", ...MACHINE, ...ASM], run: testCommand, usage: "test FILE|FOLDER... [--only NAME]" },
  run: { options: ["json", "seconds", "keys", "type", "type-file", "basic", "basic-file", "call", "png", "memory", "no-screen", ...MACHINE, ...ASM], run: runCommand, usage: "run FILE.asm|FILE.bas [--seconds N] [--keys A,B,wait:1] [--type TEXT|--type-file FILE] [--basic LINE|--basic-file FILE] [--png FILE] [--memory ADDRESS:LENGTH|(NAME):LENGTH]" },
  bin: { options: ["json", "out", "force", "ram", ...ASM], run: binCommand, usage: "bin FILE.asm|FILE.bas [-o FILE] [--force]" },
  help: { options: ["json"], run: helpCommand, usage: "help WORD..." },
  new: { options: ["force", "kind"], run: newCommand, usage: "new NAME [FOLDER] [--kind basicapp|basicgame|app|game|screen|text|routine|minimal]" },
  skill: { options: ["force"], run: skillCommand, usage: "skill [FOLDER]" },
  setup: { options: ["force", "home"], run: setupCommand, usage: "setup [--force]" },
  guide: { options: [], run: guideCommand, usage: "guide [TOPIC]" },
  check: { options: ["json", ...MACHINE], run: checkCommand, usage: "check" }
};

const read = (file: string): string => {
  try { return fs.readFileSync(file, "utf8").replace(/^﻿/, ""); } catch { throw new UsageError(L(`ファイルを読めません: ${file}`, `Cannot read the file: ${file}`)); }
};

const asmOptions = (a: Arguments): { host: AsmHost; includeDirectories: string[]; defines: Record<string, number> } =>
  ({ host, includeDirectories: [...(a.options.get("include") ?? []).map(d => path.resolve(d)), path.join(extensionRoot, "inc")], defines: defines(a) });

/** The files named, and in the folders named (not node_modules and the like). */
function files(names: readonly string[], wanted: RegExp): string[] {
  const out: string[] = [];
  const walk = (folder: string): void => {
    for (const e of fs.readdirSync(folder, { withFileTypes: true }).sort((x, y) => x.name.localeCompare(y.name))) {
      const f = path.join(folder, e.name);
      if (e.isDirectory()) { if (!/^(node_modules|\.git|\.vscode|out)$/.test(e.name)) walk(f); }
      else if (wanted.test(e.name)) out.push(f);
    }
  };
  for (const n of names) {
    let stat: fs.Stats;
    try { stat = fs.statSync(n); } catch { throw new UsageError(L(`ありません: ${n}`, `Not found: ${n}`)); }
    if (stat.isDirectory()) walk(n); else out.push(n);
  }
  return out;
}

const isBasic = (f: string): boolean => /\.(bas|basic|e500)$/i.test(f);

// --- asm, dis ----------------------------------------------------------------

const samePath = (a: string, b: string): boolean => {
  const [x, y] = [path.resolve(a), path.resolve(b)];
  return process.platform === "linux" ? x === y : x.toLowerCase() === y.toLowerCase();
};

/** Refuses outputs that are files the program is made of. */
function keepSources(targets: readonly string[], sources: readonly string[]): void {
  const over = targets.find(t => sources.some(s => samePath(s, t)));
  if (over) throw new UsageError(L(`プログラムが使うファイルを上書きします: ${over}（-o で別の名前にしてください）`, `Would overwrite a file the program uses: ${over} (name another with -o)`));
}

/** Writes all of the files or, when one cannot be written, none. */
function writeAll(files: ReadonlyArray<readonly [string, string | Uint8Array]>): void {
  const staged: Array<[string, string]> = [];
  try {
    for (const [to, data] of files) {
      if (fs.existsSync(to) && fs.statSync(to).isDirectory()) throw new UsageError(L(`出力がフォルダです: ${to}`, `The output is a folder: ${to}`));
      fs.mkdirSync(path.dirname(path.resolve(to)), { recursive: true });
      // NUL, /dev/null and the like are written to, and not replaced.
      const device = process.platform === "win32" && /^(?:con|prn|aux|nul|com\d|lpt\d)$/i.test(path.basename(to));
      if (device || (fs.existsSync(to) && !fs.statSync(to).isFile())) { fs.writeFileSync(device ? "\\\\.\\" + path.basename(to) : to, data); continue; }
      const temp = `${path.resolve(to)}.${process.pid}-${staged.length}.tmp`;
      staged.push([temp, to]);
      fs.writeFileSync(temp, data);
    }
    for (const [temp, to] of staged) fs.renameSync(temp, to);
  } finally { for (const [temp] of staged) fs.rmSync(temp, { force: true }); }
}

function asmCommand(a: Arguments): number {
  if (a.words.length !== 1) throw new UsageError(L("ファイルを 1 つ指定してください。", "Name one file."));
  const file = a.words[0], format = last(a, "format") ?? "bin", fill = last(a, "fill") === undefined ? 0 : expressionValue(last(a, "fill")!, "--fill");
  if (!["bin", "hex", "ce140f"].includes(format)) throw new UsageError(L("--format は bin、hex、ce140f のどれかです。", "--format is bin, hex or ce140f."));
  if (!Number.isInteger(fill) || fill < 0 || fill > 255) throw new UsageError(L("--fill は 0〜255 です。", "--fill is 0 to 255."));
  const out = last(a, "out") ?? file.replace(/\.[^./\\]*$/, "") + ({ bin: ".bin", hex: ".hex" }[format] ?? ".BIN");
  const targets = [out, last(a, "listing"), last(a, "symbols")].filter((t): t is string => t !== undefined);
  if (targets.some((t, i) => targets.some((u, k) => k !== i && samePath(t, u)))) throw new UsageError(L("出力、リスト、シンボルは別のファイルにしてください。", "Output, listing and symbols must have different paths."));
  const result = assemble(read(file), { filePath: path.resolve(file), ...asmOptions(a), origin: addressOption(a, "org"), fill });
  const errors = result.issues.filter(i => i.severity === "error");
  if (errors.length > 0) {
    for (const i of errors) note(`${file}:${i.range.line + 1}:${i.range.start + 1}: ${i.code}: ${i.message}`);
    return 1;
  }
  keepSources(targets, result.inputFiles);
  const listing = last(a, "listing"), symbols = last(a, "symbols");
  if (format === "ce140f" && result.origin + result.binary.length > 0x100000) { note(L("プログラムが FFFFFh を越えます。", "The program runs past FFFFFh.")); return 1; }
  const outputs: Array<[string, string | Uint8Array]> = [[out, format === "bin" ? result.binary : format === "hex" ? intelHex(result.origin, result.binary) : loadMFile(result.origin, result.binary)]];
  if (listing !== undefined) outputs.push([listing, listingText(result, f => (samePath(f, file) ? read(file) : read(f)))]);
  if (symbols !== undefined) outputs.push([symbols, symbolText(result)]);
  writeAll(outputs);
  print(`OK: ${result.binary.length} bytes, origin=${hex5(result.origin)}h -> ${path.resolve(out)}`);
  return 0;
}

function disCommand(a: Arguments): number {
  if (a.words.length !== 1) throw new UsageError(L("ファイルを 1 つ指定してください。", "Name one file."));
  const file = a.words[0];
  let data: Buffer;
  try { data = fs.readFileSync(file); } catch { throw new UsageError(L(`ファイルを読めません: ${file}`, `Cannot read the file: ${file}`)); }
  const given = last(a, "format")?.toLowerCase();
  if (given !== undefined && !["raw", "ce140f", "save-m"].includes(given)) throw new UsageError(L("--format は raw か ce140f です。", "--format is raw or ce140f."));
  // With none given, the header of SAVE M says it.
  const format = given === "raw" ? "raw" : given !== undefined || isSaveM(data) ? "ce140f" : "raw";
  const out = last(a, "out") ?? file.replace(/\.[^./\\]*$/, "") + ".asm";
  if (samePath(out, file)) throw new UsageError(L("入力を上書きします。-o で出力を指定してください。", "Would overwrite the input: name the output with -o."));
  // HELLO.BIN made from hello.asm leads back to hello.asm: a source must not be lost to a default name.
  if (last(a, "out") === undefined && last(a, "force") === undefined && fs.existsSync(out) && !read(out).startsWith("; Generated by e500dasm"))
    throw new UsageError(L(`${out} は逆アセンブラの出力ではないので上書きしません。-o で別の名前にするか、--force を付けてください。`, `${out} was not written by the disassembler. Name the output with -o, or replace it with --force.`));
  const on = (name: string): boolean => last(a, `no-${name}`) === undefined;
  try {
    const result = disassemble(readImage(data, format, addressOption(a, "org")), { labels: on("labels"), addresses: on("addresses"), bytes: on("bytes") });
    writeAll([[out, result.source]]);
    print(`OK: ${result.image.payload.length} bytes, origin=${hex5(result.image.origin)}h, ${result.instructions} instructions, ${result.dataBytes} DB bytes -> ${path.resolve(out)}`);
    return 0;
  } catch (error) {
    if (!(error instanceof DisassemblyError)) throw error;
    note(error.message);
    return 1;
  }
}

// --- lint -------------------------------------------------------------------

function issuesOf(file: string, a: Arguments): LintIssue[] {
  const text = read(file);
  return isBasic(file) ? lint(text, pcE500Dialect, { requireLineNumbers: true, checkMissingTargets: true }) : lintAsm(text, { filePath: path.resolve(file), ...asmOptions(a) });
}

function lintCommand(a: Arguments): number {
  if (a.words.length === 0) throw new UsageError(L("ファイルを指定してください。", "Name a file."));
  // Include files are parts of programs: only a program itself is looked at in a folder.
  const list = files(a.words, /\.(asm|e500asm|bas|basic)$/i);
  const found = list.flatMap(f => issuesOf(f, a).map(i => ({ file: f, line: i.range.line + 1, column: i.range.start + 1, severity: i.severity, code: i.code, message: i.message })));
  const errors = found.filter(i => i.severity === "error").length;
  if (last(a, "json") !== undefined) print(JSON.stringify({ files: list.length, errors, issues: found }, undefined, 1));
  else {
    for (const i of found) print(`${i.file}:${i.line}:${i.column}: ${i.severity} ${i.code}: ${i.message}`);
    print(L(`${list.length} ファイル、エラー ${errors} 件、そのほか ${found.length - errors} 件`, `${list.length} files, ${errors} errors, ${found.length - errors} others`));
  }
  return errors > 0 ? 1 : 0;
}

// --- test -------------------------------------------------------------------

async function testCommand(a: Arguments): Promise<number> {
  const list = files(a.words.length > 0 ? a.words : ["."], /\.e500test\.json$/i);
  if (list.length === 0) throw new UsageError(L("*.e500test.json がありません。", "There is no *.e500test.json."));
  const config = machine(a), json = last(a, "json") !== undefined;
  const only = a.options.get("only"), all: Array<TestResult & { file: string }> = [];
  for (const file of list) {
    const failed = (messages: string[]): void => { all.push({ file, name: path.basename(file), passed: false, messages, durationMs: 0 }); if (!json) print(`✕ ${file}\n    ${messages.join("\n    ")}`); };
    let client: EmulatorClient | undefined;
    try {
      const spec = parseTestFile(read(file));
      if (only && spec.tests.length > 0 && !spec.tests.some(t => only.includes(t.name))) continue;
      const source = path.resolve(path.dirname(file), spec.program);
      if (!fs.existsSync(source)) { failed([L(`プログラムがありません: ${source}`, `The program is missing: ${source}`)]); continue; }
      const program = testTarget(source, read(source), () => asmOptions(a));
      if (program.errors.length > 0) { failed([...program.errors]); continue; }
      if (spec.tests.length === 0) { failed([L("テストがありません（\"tests\" が空）。", "It has no tests (\"tests\" is empty).")]); continue; }
      if (!json) print(file);
      client = await startMachine(config);
      await runTests(client, program, spec, {
        folder: path.dirname(file), only: only ? new Set(only) : undefined,
        onResult: r => { all.push({ ...r, file }); if (!json) print(`  ${r.passed ? "✓" : "✕"} ${r.name}${r.messages.map(m => `\n      ${m.replace(/\n/g, "\n      ")}`).join("")}`); }
      });
    } catch (error) {
      failed([error instanceof Error ? error.message : String(error)]);
    } finally { client?.dispose(); }
  }
  if (all.length === 0) throw new UsageError(L("--only の名前のテストがありません。", "There is no test of the name given with --only."));
  const bad = all.filter(r => !r.passed).length;
  if (json) print(JSON.stringify({ passed: all.length - bad, failed: bad, tests: all }, undefined, 1));
  else print(L(`成功 ${all.length - bad} 件、失敗 ${bad} 件`, `${all.length - bad} passed, ${bad} failed`));
  return bad > 0 ? 1 : 0;
}

// --- run --------------------------------------------------------------------

/** Runs until the machine is not busy or the seconds are over; the seconds spent, and whether it stopped badly. */
async function settle(client: EmulatorClient, seconds: number): Promise<{ spent: number; fault?: number }> {
  let spent = 0;
  while (spent < seconds) {
    const run = await client.run(HZ / 4);
    spent += run.cycles / HZ;
    if (run.reason === "exception") return { spent, fault: run.pc };
    if (!(await client.mode()).busy) break;
  }
  return { spent };
}

async function runCommand(a: Arguments): Promise<number> {
  if (a.words.length !== 1) throw new UsageError(L("ファイルを 1 つ指定してください。", "Name one file."));
  const file = a.words[0], basic = isBasic(file), seconds = numberOption(a, "seconds", 10), json = last(a, "json") !== undefined;
  const mistakes = issuesOf(file, a).filter(i => i.severity === "error");
  if (mistakes.length > 0) {
    for (const i of mistakes) note(`${file}:${i.range.line + 1}:${i.range.start + 1}: ${i.code}: ${i.message}`);
    if (json) print(JSON.stringify({ state: "mistakes", issues: mistakes.map(i => ({ file, line: i.range.line + 1, column: i.range.start + 1, code: i.code, message: i.message })) }, undefined, 1));
    return 1;
  }
  const log = note, png = last(a, "png");
  // What is wrong in the command is said before the program runs.
  if (png) keepSources([png], [file]);
  if (png && fs.existsSync(png) && fs.statSync(png).isDirectory()) throw new UsageError(L(`出力がフォルダです: ${png}`, `The output is a folder: ${png}`));
  // "screens/title.png": the folder is made, before the program runs.
  if (png) {
    try {
      fs.mkdirSync(path.dirname(path.resolve(png)), { recursive: true });
    } catch (e) {
      throw new UsageError(L(`フォルダを作れません: ${path.dirname(png)}（${(e as Error).message}）`, `Cannot make the folder: ${path.dirname(png)} (${(e as Error).message})`));
    }
  }
  // From a file, for what a shell would change (quotes, > and &).
  const given = (name: "type" | "basic"): string | undefined => {
    const from = last(a, `${name}-file`);
    return from !== undefined ? read(from).replace(/\r\n?/g, "\n").replace(/\n$/, name === "basic" ? "" : "\n") : last(a, name)?.replace(/\\n/g, "\n");
  };
  given("type"); given("basic");
  const keys = (last(a, "keys") ?? "").split(/,(?!$)/).map(x => x.trim()).filter(x => x);
  for (const k of keys) if (/^wait:/i.test(k) && !/^wait:\d+(\.\d+)?$/i.test(k)) throw new UsageError(L(`wait:秒 の秒が数ではありません: ${k}`, `wait:SECONDS needs a number: ${k}`));
  for (const m of a.options.get("memory") ?? []) if (!/^.+:\d+$|^[^:]+$/.test(m)) throw new UsageError(L(`--memory は アドレス:バイト数 です: ${m}`, `--memory is ADDRESS:BYTES: ${m}`));
  const client = await startMachine(machine(a), log);
  let session: BasicSession | undefined;
  try {
    let program: Program | undefined, fault: number | undefined, spent = 0, error: string | undefined, started = false, watch: BasicWatch | undefined;
    /** An error of BASIC's is on the screen when the program stops; looked for when it does, as later keys change the screen. */
    const look = async (): Promise<void> => {
      if (fault !== undefined) return;
      watch ??= await BasicWatch.create(client);
      const now = await watch.look(keys.some(k => /^ON\/BRK$/i.test(k)));
      if (now.state === "running") { started = true; return; }
      if (!started || now.state === "menu") return;
      started = false;
      error = now.error;
    };
    const type = async (text: string): Promise<void> => {
      const typed = await client.type(text);
      if (typed.skipped) note(L(`キーで入力できない文字を省きました: ${typed.skipped}`, `Left out characters that cannot be typed on the keys: ${typed.skipped}`));
      const run = await client.run(HZ * 60, { untilTyped: true, settle: HZ / 20 });
      if (run.reason === "exception") fault = run.pc;
    };
    const wait = async (): Promise<void> => {
      if (fault !== undefined) return;
      const more = await settle(client, seconds);
      spent += more.spent;
      fault = more.fault;
      // The message of an error, or the menu after a crash, takes a moment more.
      if (fault === undefined && !(await client.mode()).busy) {
        const rest = await client.run(HZ / 4);
        if (rest.reason === "exception") fault = rest.pc;
      }
      await look();
    };
    started = true;
    if (basic) {
      session = await BasicSession.load(client, path.basename(file), read(file), log);
      await client.tap("C-CE");
      await type((given("basic") ?? "RUN") + "\n");
    } else {
      program = Program.build(path.resolve(file), read(file), asmOptions(a));
      await loadProgram(client, program, log);
      await client.tap("C-CE");
      await type((given("basic") ?? `CLS:${basicCall(program.entry(last(a, "call")))}`) + "\n");
    }
    await wait();
    const text = given("type");
    if (text !== undefined && fault === undefined) { await look(); started = started || text.includes("\n"); await type(text); await wait(); }
    for (const k of keys) {
      if (fault !== undefined) break;
      if (/^ENTER$/i.test(k)) started = true;
      const pause = /^wait:([\d.]+)$/i.exec(k);
      const run = pause ? await client.run(HZ * Number(pause[1])) : undefined;
      if (!pause) {
        const name = k.toUpperCase() === "COMMA" ? "," : k;
        await client.key(name, true);
        await client.run(HZ / 5);
        await client.key(name, false);
      }
      const after = run ?? await client.run(HZ / 2);
      spent += after.cycles / HZ;
      if (after.reason === "exception") fault = after.pc;
      await look();
    }
    // No prompt: an error, or a crash on its way to the main menu.
    if (fault === undefined && !(await client.mode()).busy && !/^\s*>/m.test((await client.screen()).text ?? "")) {
      const more = await client.run(HZ * 2);
      if (more.reason === "exception") fault = more.pc;
    }
    const screen = await client.screen(), mode = await client.mode(), registers = await client.registers();
    const bits = Buffer.from(screen.pixels, "base64");
    if (png) fs.writeFileSync(png, lcdPng(bits));
    const memory: Record<string, string> = {};
    for (const m of a.options.get("memory") ?? []) {
      const [where, length] = m.split(":");
      // "(name)" is internal RAM, as in a source.
      const inside = /^\((.+)\)$/.exec(where.trim());
      const name = inside ? inside[1] : where;
      const address = program ? program.resolve(name) : parseNumber(name);
      const n = Number(length ?? "1");
      if (address === undefined || !Number.isInteger(n) || n < 1 || (inside && address + n > 256)) throw new UsageError(L(`--memory は アドレス:バイト数 です: ${m}`, `--memory is ADDRESS:BYTES: ${m}`));
      memory[m] = [...inside ? (await client.internalMemory()).subarray(address, address + n) : await client.read(address, n)].map(b => b.toString(16).toUpperCase().padStart(2, "0")).join(" ");
    }
    const variables = session ? (await session.variablesAndLetters()).variables.filter(v => v.value !== "0" && v.value !== "\"\"").map(v => `${v.name}=${v.value}`) : undefined;
    // A crash ends at the main menu, which is no mode of BASIC's, or at NO MEMORY, which turns the machine off.
    const menu = fault === undefined && ((!mode.run && !mode.pro) || registers.off || (screen.text ?? "").trim() === "NO MEMORY");
    const state = fault !== undefined ? "fault" : menu ? "menu" : mode.busy ? "running" : error !== undefined ? "error" : "ended";
    if (json) print(JSON.stringify({ state, error, pc: hex5(fault ?? registers.P), seconds: Math.round(spent * 100) / 100, screen: screen.text ?? "", registers, memory, variables, png }, undefined, 1));
    else {
      print({
        fault: L(`未定義命令で停止（PC=${hex5(fault ?? 0)}${program?.symbolFor(fault ?? 0) ? " " + program.symbolFor(fault ?? 0) : ""}）`, `Stopped on an undefined instruction (PC=${hex5(fault ?? 0)})`), running: L(`実行中（${spent.toFixed(1)} 秒）`, `Still running (${spent.toFixed(1)} s)`), ended: L(`終了（${spent.toFixed(1)} 秒）`, `Ended (${spent.toFixed(1)} s)`),
        error: L(`BASIC のエラー: ${error}`, `BASIC error: ${error}`), menu: L(`${registers.off ? "電源が切れました" : "BASIC から出ました"}。暴走したようです（RET で戻った、スタックの数が合わないなど）`, `${registers.off ? "The machine is off" : "Left BASIC"}: it seems to have crashed (RET instead of RETF, an unbalanced stack ...)`)
      }[state]);
      if (last(a, "no-screen") === undefined) print("+" + "-".repeat(40) + "+\n" + (screen.text ?? "").split("\n").slice(0, 4).map(l => `|${l.padEnd(40)}|`).join("\n") + "\n+" + "-".repeat(40) + "+");
      for (const [m, v] of Object.entries(memory)) print(`${m} = ${v}`);
      if (variables && variables.length > 0) print(variables.join("  "));
      if (png) print(png);
      print(`state: ${state}`);
    }
    return state === "running" || state === "ended" ? 0 : 1;
  } finally {
    session?.dispose();
    client.dispose();
  }
}

// --- bin, help, new, skill, check --------------------------------------------

/** A default name may replace what the command made before, and nothing else: only -o or --force does. */
function mayReplace(a: Arguments, target: string, own: (bytes: Buffer) => boolean, others: readonly string[] = []): void {
  if (last(a, "out") !== undefined || last(a, "force") !== undefined || !fs.existsSync(target)) return;
  let bytes: Buffer;
  try { bytes = fs.readFileSync(target); } catch { throw new UsageError(L(`出力先に書けません: ${target}`, `Cannot write to ${target}`)); }
  if (others.length > 0) throw new UsageError(L(`${target} は ${others.join("、")} の出力かもしれないので上書きしません（同じ名前になるため。-o で別の名前にするか、--force を付けてください）`, `${target} may be made from ${others.join(", ")}, which gets the same name (name another with -o, or replace it with --force)`));
  if (!own(bytes)) throw new UsageError(L(`別のファイルがあるので上書きしません: ${target}（-o で別の名前にするか、--force を付けてください）`, `Another file is there: ${target} (name another with -o, or replace it with --force)`));
}

function binCommand(a: Arguments): number {
  if (a.words.length !== 1) throw new UsageError(L("ファイルを 1 つ指定してください。", "Name one file."));
  const file = a.words[0], json = last(a, "json") !== undefined;
  if (isBasic(file)) return basicFile(a, file);
  const program = Program.build(path.resolve(file), read(file), asmOptions(a));
  if (program.errors.length > 0) { for (const e of program.errors) note(e); if (json) print(JSON.stringify({ errors: program.errors }, undefined, 1)); return 1; }
  if (program.binary.length === 0) { note(L("プログラムが空です（出力されるバイトがありません）。", "The program is empty (it puts out no bytes).")); return 1; }
  const target = last(a, "out") ?? path.join(path.dirname(file), binName(file));
  keepSources([target], program.inputFiles);
  mayReplace(a, target, bytes => loadMOrigin(bytes) !== undefined, sharesName(file, binName));
  const lines = basicLines(program, path.basename(target), numberOption(a, "ram", 32));
  if (program.end > 0x100000) { note(L("プログラムが FFFFFh を越えます。", "The program runs past FFFFFh.")); return 1; }
  const outside = lines.reserve === undefined;
  if (outside) note(L(`${hex5(program.origin)}〜${hex5(program.end - 1)} は機械語エリア（BFBFFh まで）ではありません。ORG を確かめてください。`, `${hex5(program.origin)}-${hex5(program.end - 1)} is not in the machine-code area (up to BFBFFh). Check the ORG.`));
  writeAll([[target, loadMFile(program.origin, program.binary)]]);
  if (json) print(JSON.stringify({ file: target, outside, origin: hex5(program.origin), end: hex5(program.end - 1), bytes: program.binary.length, entry: hex5(program.entry()), ...lines }, undefined, 1));
  else {
    print(L(`${target}: ${program.binary.length} バイト、${hex5(program.origin)}〜${hex5(program.end - 1)}、開始 ${hex5(program.entry())}`, `${target}: ${program.binary.length} bytes, ${hex5(program.origin)}-${hex5(program.end - 1)}, starts at ${hex5(program.entry())}`));
    for (const l of [lines.reserve, lines.load, lines.call]) if (l) print(`  ${l}`);
  }
  return 0;
}

/** A BASIC source as the text LOAD reads from a CE-140F: the machine's characters, lines ended CR LF. */
function basicFile(a: Arguments, file: string): number {
  const { bytes, unsupported, skipped } = encodeSource(read(file));
  if (bytes.length === 0) { note(L("行番号のある行がありません。", "No line has a number.")); return 1; }
  const target = last(a, "out") ?? path.join(path.dirname(file), driveName(path.basename(file)));
  if (samePath(file, target)) throw new UsageError(L(`出力がソースと同じファイルになります（${target}）。-o で別の名前を指定してください。`, `The output would be the source itself (${target}). Give another name with -o.`));
  if (unsupported) note(L(`本体の文字にない文字があるため省きました: ${unsupported}`, `Left out characters the machine does not have: ${unsupported}`));
  if (skipped) note(L(`行番号のない行を ${skipped} 行省きました。`, `Left out ${skipped} line(s) with no line number.`));
  // Lines of BASIC as this writes them: numbered, each ended by CR LF.
  mayReplace(a, target, old => /^(?:\d[^\r\n]*\r\n)+$/.test(old.toString("latin1")), sharesName(file, f => driveName(path.basename(f))));
  writeAll([[target, bytes]]);
  const load = `LOAD "X:${path.basename(target)}"`;
  if (last(a, "json") !== undefined) print(JSON.stringify({ file: target, bytes: bytes.length, unsupported, skipped, load }, undefined, 1));
  else { print(L(`${target}: ${bytes.length} バイト`, `${target}: ${bytes.length} bytes`)); print(`  ${load}`); print("  RUN"); }
  return 0;
}

function helpCommand(a: Arguments): number {
  if (a.words.length === 0 && last(a, "json") !== undefined) { print(JSON.stringify(Object.fromEntries(words()), undefined, 1)); return 0; }
  if (a.words.length === 0) { for (const [kind, list] of words()) print(`${kind}: ${list.join(" ")}`); return 0; }
  let bad = 0;
  const all: Record<string, string[]> = {};
  for (const w of a.words) {
    const lines = all[w] = lookup(w);
    if (lines.length === 0) bad++;
    if (last(a, "json") === undefined) print(lines.length > 0 ? lines.join("\n") : L(`${w}: ありません`, `${w}: not found`));
  }
  if (last(a, "json") !== undefined) print(JSON.stringify(all, undefined, 1));
  return bad > 0 ? 1 : 0;
}

/** Which template: the one named, the one of the file's extension, the one chosen, or the one that fits most programs. */
async function newKind(name: string, extension: string | undefined, kind: string | undefined): Promise<string> {
  const list = templates();
  if (kind !== undefined) return kind;
  const game = /game/i.test(name);
  if (extension) return (extension === "bas" ? "basic" : "") + (game ? "game" : "app");
  const own = game ? "basicgame" : "basicapp";
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    note(L(`種類は ${own} にしました。変えるには --kind を付けます（${list.map(t => t.id).join(" ")}）。`, `Took ${own}. --kind chooses another (${list.map(t => t.id).join(" ")}).`));
    return own;
  }
  const ask = createInterface({ input: process.stdin, output: process.stdout });
  // One that asks for the language, one for what is made; ENTER takes what fits most programs.
  const choose = async <T>(title: string, choices: ReadonlyArray<readonly [string, T]>, usual: number): Promise<T> => {
    print(title);
    choices.forEach(([label], n) => print(`  ${n + 1}  ${label}${n === usual ? L("（ENTER）", " (ENTER)") : ""}`));
    for (;;) {
      const text = await new Promise<string>((resolve, reject) => {
        const gone = (): void => reject(new UsageError(L("やめました。", "Cancelled.")));
        ask.once("close", gone);
        ask.question("> ", t => { ask.off("close", gone); resolve(t.trim()); });
      });
      const picked = choices[text === "" ? usual : Number(text) - 1];
      if (picked) return picked[1];
    }
  };
  try {
    const basic = await choose(L("何で作りますか？", "Made in what?"), [[L("BASIC: 計算、一覧、記録、文字のゲーム。読んで直しやすい", "BASIC: sums, lists, records, games of text; easy to read and change"), true], [L("機械語: 速い。絵を動かす、大量の処理", "Machine code: fast; moving pictures, a lot to do"), false]], 0);
    const choices = list.filter(t => t.id.startsWith("basic") === basic);
    return await choose(L("何を作りますか？", "What is it?"), choices.map(t => [`${t.label}${L("：", ": ")}${t.detail}`, t.id as string] as const), Math.max(0, choices.findIndex(t => game && t.id.endsWith("game"))));
  } finally { ask.close(); process.stdin.pause(); }
}

async function newCommand(a: Arguments): Promise<number> {
  // "new NAME [FOLDER]"; the kind in front of the name, as it was, still works.
  const before = a.words.length >= 2 && last(a, "kind") === undefined && templates().some(t => t.id === a.words[0]);
  if (a.words.length > (before ? 3 : 2)) throw new UsageError(L("名前とフォルダのほかに言葉があります。", "There is more than a name and a folder."));
  const [word, where] = before ? a.words.slice(1) : a.words;
  if (word === undefined) throw new UsageError(L("名前を書いてください。", "Give a name."));
  const file = /^(.*)\.(asm|bas)$/i.exec(word), stem = file ? file[1] : word;
  const name = path.basename(stem), folder = where === undefined ? path.dirname(stem) : path.join(where, path.dirname(stem));
  if (fs.existsSync(folder) && !fs.statSync(folder).isDirectory()) throw new UsageError(L(`フォルダではありません: ${folder}`, `Not a folder: ${folder}`));
  if (!isProgramName(name)) throw new UsageError(L("名前は、英字で始まる 8 文字までの英数字と _ です。", "The name: up to 8 letters, digits and _, a letter first."));
  const given = last(a, "kind");
  if (file && given !== undefined && given.startsWith("basic") !== (file[2].toLowerCase() === "bas")) throw new UsageError(L(`${word} と --kind ${given} が合いません。`, `${word} and --kind ${given} do not go together.`));
  const kind = await newKind(name, file?.[2].toLowerCase(), given ?? (before ? a.words[0] : undefined));
  const template = templates().find(t => t.id === kind);
  if (!template) throw new UsageError(L(`テンプレートは次のどれかです: ${templates().map(t => `${t.id}（${t.label}）`).join("、")}`, `Templates: ${templates().map(t => `${t.id} (${t.label})`).join(", ")}`));
  const list = template.files(name).map(f => ({ ...f, to: path.join(folder, f.name) }));
  const there = list.filter(f => fs.existsSync(f.to));
  if (there.length > 0 && last(a, "force") === undefined) throw new UsageError(L(`既に存在します: ${there.map(f => f.to).join("、")}（--force で上書き）`, `Already there: ${there.map(f => f.to).join(", ")} (--force replaces)`));
  fs.mkdirSync(folder, { recursive: true });
  for (const f of list) { fs.writeFileSync(f.to, f.content); print(f.to); }
  return 0;
}

function skillCommand(a: Arguments): number {
  const { written, kept } = installSkill(path.resolve(a.words[0] ?? "."), extensionRoot, last(a, "force") !== undefined);
  for (const f of written) print(f);
  for (const f of kept) print(L(`残しました（--force で上書き）: ${f}`, `Kept (--force replaces): ${f}`));
  if (written.length + kept.length === 0) print(L("既に最新です。", "It is up to date."));
  return 0;
}

function setupCommand(a: Arguments): number {
  if (a.words.length > 0) throw new UsageError(L("setup はフォルダを取りません（ホームに置きます）。フォルダに置くのは e500 skill です。", "setup takes no folder (it uses your home folder). e500 skill puts the skill into a folder."));
  const home = last(a, "home") ?? os.homedir();
  const { written, kept } = installStub(path.resolve(home), extensionRoot, last(a, "force") !== undefined);
  for (const f of written) print(f);
  for (const f of kept) print(L(`残しました（別のスキルです。--force で置き換え）: ${f}`, `Kept (another skill; --force replaces it): ${f}`));
  if (written.length + kept.length === 0) print(L("既に置いてあります。", "It is in place."));
  if (kept.length === 0) print(L("Claude Code と Codex は、どのフォルダでも、このスキルを使います。本文は e500 guide が出します（いつも最新）。", "Claude Code and Codex use the skill in every folder. e500 guide prints its text (always the latest)."));
  return 0;
}

function guideCommand(a: Arguments): number {
  if (a.words.length > 1) throw new UsageError(L("名前は 1 つだけです。", "Give one name."));
  const text = guideText(extensionRoot, a.words[0]);
  if (text === undefined) throw new UsageError(L(`ありません: ${a.words[0]}（${guideTopics(extensionRoot).join("、")}）`, `No such topic: ${a.words[0]} (${guideTopics(extensionRoot).join(", ")})`));
  const version = (JSON.parse(fs.readFileSync(path.join(extensionRoot, "package.json"), "utf8")) as { version: string }).version;
  print(text.replace(/\n+$/, ""));
  if (a.words.length === 0) print(`\n(e500 ${version}: ${guideTopics(extensionRoot).map(t => `e500 guide ${t}`).join(", ")})`);
  return 0;
}

async function checkCommand(a: Arguments): Promise<number> {
  const found = find(a), state: Record<string, unknown> = { ...found, node: process.version };
  let ok = true;
  try {
    const started = Date.now(), client = await startMachine(machine(a));
    state.started = `ROM Ver.${client.info?.romVersion}, ${client.info?.internalKB} KB, ${Date.now() - started} ms`;
    client.dispose();
  } catch (error) { ok = false; state.error = error instanceof Error ? error.message : String(error); }
  if (last(a, "json") !== undefined) print(JSON.stringify(state, undefined, 1));
  else for (const [k, v] of Object.entries(state)) print(`${k}: ${v ?? "-"}`);
  return ok ? 0 : 2;
}

function usage(): string {
  return [
    L("e500: PC-E500 シリーズのプログラムを、書く、確かめる、動かす", "e500: write, check and run programs for the PC-E500 series"), "",
    ...Object.values(COMMANDS).map(c => `  e500 ${c.usage}`), "",
    L("  結果を JSON で: --json（lint、test、run、bin、help、check）、アセンブリ: --include フォルダ --define 名前=値", "  results as JSON: --json (lint, test, run, bin, help, check); assembly: --include FOLDER --define NAME=VALUE"),
    L("  エミュレータ: --emulator フォルダ --rom ファイルか名前の一部（8.5 など） --ram KB", "  emulator: --emulator FOLDER --rom FILE or part of its name (8.5) --ram KB"),
    L("  終了コード: 0 成功、1 間違い・テストの失敗、2 使い方・環境", "  exit code: 0 done, 1 mistakes or a failed test, 2 usage or setup")
  ].join("\n");
}

export async function main(args: readonly string[]): Promise<number> {
  const language = process.env.E500_LANG ?? Intl.DateTimeFormat().resolvedOptions().locale;
  setLanguage(/^ja/i.test(language) ? "ja" : "en");
  const [name, ...rest] = args;
  if (!name || name === "--help" || name === "-h") { print(usage()); return name ? 0 : 2; }
  if (name === "--version") { print((JSON.parse(fs.readFileSync(path.join(extensionRoot, "package.json"), "utf8")) as { version: string }).version); return 0; }
  const command = Object.hasOwn(COMMANDS, name) ? COMMANDS[name] : undefined;
  try {
    if (!command) throw new UsageError(L(`知らないコマンドです: ${name}`, `Unknown command: ${name}`));
    const a = parseArguments(rest, new Set(command.options));
    if (a.options.has("help")) { print(`e500 ${command.usage}`); return 0; }
    return await command.run(a);
  } catch (error) {
    note(error instanceof Error ? error.message : String(error));
    if (rest.includes("--json")) print(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }, undefined, 1));
    if (error instanceof UsageError && command) note(`e500 ${command.usage}`);
    return 2;
  }
}

// "e500 ... | head" closes the pipe early: that is no mistake.
process.stdout.on("error", (error: NodeJS.ErrnoException) => { if (error.code === "EPIPE") process.exit(0); else throw error; });

if (require.main === module) void main(process.argv.slice(2)).then(code => { process.exitCode = code; });
