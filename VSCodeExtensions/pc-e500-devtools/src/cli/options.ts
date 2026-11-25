// The command line's arguments, and where it finds the emulator: arguments, environment,
// the user's own VS Code settings, PATH and the installed places, and the emulator beside
// this repository. Settings of the folder being worked on are not read: they could name
// any program.
import * as fs from "node:fs";
import * as path from "node:path";
import { plainJson } from "../jsonc";
import { L } from "../l10n";
import { EmulatorFolder, coreName, emulatorInstalled, emulatorOnPath, hasDebugger, inEmulatorFolder, places } from "../setup/find";
import { MachineConfig } from "../emu/prepare";

/** A mistake in how the command was given, or something it needs is missing. */
export class UsageError extends Error {}

export interface Arguments {
  readonly words: string[];
  readonly options: Map<string, string[]>;
}

/** Options that stand alone; the others take a value ("--ram 64" or "--ram=64"). */
const ALONE = new Set(["json", "help", "force", "no-screen", "no-labels", "no-addresses", "no-bytes"]);
/** The short options, as e500asm and e500dasm have them. */
const SHORT: Readonly<Record<string, string>> = { h: "help", o: "out", f: "format", l: "listing", s: "symbols", I: "include", D: "define", output: "out" };

export function parseArguments(args: readonly string[], known: ReadonlySet<string>): Arguments {
  const words: string[] = [], options = new Map<string, string[]>();
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--") { words.push(...args.slice(i + 1)); break; }
    if (!/^--?[a-z]/i.test(a)) { words.push(a); continue; }
    const m = /^--?([^=]+)(?:=(.*))?$/s.exec(a)!;
    const name = SHORT[m[1]] ?? m[1];
    if (!known.has(name) && name !== "help") throw new UsageError(L(`知らないオプションです: ${a}`, `Unknown option: ${a}`));
    let value = m[2] ?? "";
    if (m[2] === undefined && !ALONE.has(name)) {
      if (i + 1 >= args.length) throw new UsageError(L(`${a} に値がありません。`, `${a} has no value.`));
      value = args[++i];
    }
    options.set(name, [...(options.get(name) ?? []), value]);
  }
  return { words, options };
}

export const last = (a: Arguments, name: string): string | undefined => a.options.get(name)?.at(-1);

export function numberOption(a: Arguments, name: string, or: number): number {
  const text = last(a, name);
  if (text === undefined) return or;
  const n = Number(text);
  if (text.trim() === "" || !Number.isFinite(n) || n < 0) throw new UsageError(L(`--${name} は 0 以上の数です: ${text}`, `--${name} takes a number: ${text}`));
  return n;
}

/** An address: always hexadecimal, as e500asm and e500dasm take them (B8000, $B8000, &HB8000, 0xB8000, 0B8000h). */
export function addressOption(a: Arguments, name: string): number | undefined {
  const text = last(a, name);
  if (text === undefined) return undefined;
  const m = /^(?:\$|&H?|0x)?([0-9A-F]{1,6})h?$/i.exec(text.trim());
  const n = m ? parseInt(m[1], 16) : NaN;
  if (!(n >= 0 && n <= 0xfffff)) throw new UsageError(L(`--${name} は 16 進のアドレス（00000〜FFFFF）です: ${text}`, `--${name} takes a hexadecimal address (00000-FFFFF): ${text}`));
  return n;
}

/** -D name=value, as e500asm has them. */
export function defines(a: Arguments): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of a.options.get("define") ?? []) {
    const m = /^([A-Za-z_.][A-Za-z_0-9.]*)(?:=(.+))?$/.exec(d);
    const n = m ? Number((m[2] ?? "1").replace(/^\$|^&H?/i, "0x")) : NaN;
    if (!m || !Number.isFinite(n)) throw new UsageError(L(`--define は 名前=値 です: ${d}`, `--define is name=value: ${d}`));
    out[m[1]] = n;
  }
  return out;
}

/** The extension's folder: this file is out/cli/options.js in it. */
export const extensionRoot = path.resolve(__dirname, "..", "..");

function userSettings(env: NodeJS.ProcessEnv): Record<string, unknown> {
  const base = process.platform === "win32" ? env.APPDATA : process.platform === "darwin" ? path.join(env.HOME ?? "", "Library", "Application Support") : path.join(env.HOME ?? "", ".config");
  if (!base) return {};
  try { return JSON.parse(plainJson(fs.readFileSync(path.join(base, "Code", "User", "settings.json"), "utf8"))) as Record<string, unknown>; } catch { return {}; }
}

export interface Found { server: string; emulator?: string; core?: string; rom?: string; ram: number; from: string }

export function find(a: Arguments, env: NodeJS.ProcessEnv = process.env): Found {
  const settings = userSettings(env);
  const set = (key: string): string | undefined => { const v = settings[`pcE500.${key}`]; return typeof v === "string" && v.trim() && !v.includes("${") ? v.trim() : undefined; };
  const beside = path.resolve(extensionRoot, "..", "..", "..", "Emulator");
  const where = places([], env);
  // What is said goes first; of the places looked in, one that has all that is needed.
  const said: Array<[string, string | undefined]> = [["--emulator", last(a, "emulator")], ["PCE500_EMULATOR", env.PCE500_EMULATOR], [L("VS Code の設定", "VS Code's settings"), set("emulatorPath")]];
  const looked: Array<[string, string | undefined]> = [["PATH", emulatorOnPath(where)], [L("インストール先", "installed"), emulatorInstalled(where)], [L("リポジトリの隣", "beside the repository"), fs.existsSync(beside) ? beside : undefined]];
  const whole = ([, f]: [string, string | undefined]): boolean => { const i = f ? inEmulatorFolder(f, where) : {}; return !!i.core && hasDebugger(i.core) && !!i.rom; };
  const [from, emulator] = said.find(([, f]) => f) ?? looked.find(whole) ?? looked.find(([, f]) => f) ?? ["", undefined];
  const inside: EmulatorFolder = emulator ? inEmulatorFolder(path.resolve(emulator), where) : {};
  const ram = last(a, "ram") !== undefined ? numberOption(a, "ram", 32) : typeof settings["pcE500.ramKB"] === "number" && !last(a, "rom") ? settings["pcE500.ramKB"] as number : undefined;
  const rom = romFile(last(a, "rom"), inside.rom) ?? env.PCE500_ROM ?? env.E500_ROM ?? set("romPath") ?? inside.rom;
  return {
    server: last(a, "server") ?? set("serverPath") ?? path.join(extensionRoot, "out", "server", process.platform === "win32" ? "e500dbg.exe" : "e500dbg.dll"),
    emulator, core: last(a, "core") ?? env.PCE500_CORE ?? env.E500_CORE ?? set("corePath") ?? inside.core, rom,
    // The models with 64 KB, by the names the ROM files have.
    ram: ram ?? (rom && /E550|E650|1490|U6000/i.test(path.basename(rom)) ? 64 : 32), from
  };
}

/** --rom takes a file, or a part of the name of one beside the usual ROM ("8.5", "E650"). */
function romFile(given: string | undefined, usual: string | undefined): string | undefined {
  if (!given || fs.existsSync(given) || !usual) return given;
  const folder = path.dirname(usual);
  const found = fs.readdirSync(folder).filter(f => /\.rom$/i.test(f) && f.toUpperCase().includes(given.toUpperCase())).sort();
  return found.length > 0 ? path.join(folder, found[0]) : given;
}

export function machine(a: Arguments): MachineConfig {
  const found = find(a);
  if (!["win32", "linux", "darwin"].includes(process.platform)) throw new UsageError(L("エミュレータとの連携は Windows、Linux、macOS で動きます（asm、dis、lint、bin、help、new は使えます）。", "The emulator works on Windows, Linux and macOS (asm, dis, lint, bin, help and new work)."));
  if (!fs.existsSync(found.server)) throw new UsageError(L(`デバッグサーバーがありません: ${found.server}`, `The debug server is missing: ${found.server}`));
  if (!found.core || !fs.existsSync(found.core)) throw new UsageError(L(`エミュレータ（${coreName(process.platform)}）が見つかりません。--emulator フォルダ、環境変数 PCE500_EMULATOR、VS Code の設定 pcE500.emulatorPath のどれかで指定してください。`, `The emulator (${coreName(process.platform)}) was not found. Give --emulator FOLDER, PCE500_EMULATOR in the environment, or the VS Code setting pcE500.emulatorPath.`));
  if (!found.rom || !fs.existsSync(found.rom)) throw new UsageError(found.rom
    ? L(`ROM が見つかりません: ${found.rom}`, `The ROM was not found: ${found.rom}`)
    : L(`${found.emulator ?? found.core} に ROM（*.ROM）がありません。ROM のあるエミュレータのフォルダを --emulator、環境変数 PCE500_EMULATOR、VS Code のユーザー設定 pcE500.emulatorPath のどれかで指定するか、--rom で ROM を指定してください。`, `${found.emulator ?? found.core} has no ROM (*.ROM). Name the folder of an emulator with ROMs by --emulator, PCE500_EMULATOR in the environment or the VS Code user setting pcE500.emulatorPath, or the ROM by --rom.`));
  return { server: found.server, core: found.core, rom: found.rom, ram: found.ram };
}
