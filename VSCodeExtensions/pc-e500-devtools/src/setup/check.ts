// Looks over everything the extension uses, and says what is there and what to do.
import { L } from "../l10n";
import { assemblerInWorkspace, assemblerOnPath, EmulatorFolder, emulatorInstalled, emulatorInWorkspace, emulatorOnPath, hasDebugger, hasRuntime, inEmulatorFolder, Places } from "./find";
import * as fs from "node:fs";
import * as path from "node:path";

export type State = "ok" | "warn" | "error" | "info";
/** What a button does: pick a file or folder, put a path in the settings, or open the settings. */
export type Fix =
  | { readonly kind: "pick"; readonly what: "assembler" | "emulator" | "rom" | "disk"; readonly label: string }
  | { readonly kind: "use"; readonly setting: string; readonly value: string; readonly label: string }
  | { readonly kind: "open"; readonly setting: string; readonly label: string }
  | { readonly kind: "link"; readonly url: string; readonly label: string };

export interface Check {
  readonly id: string;
  readonly group: "assembler" | "emulator";
  readonly title: string;
  readonly state: State;
  /** What was found, a line each. */
  readonly lines: readonly string[];
  readonly fixes: readonly Fix[];
}

/** The settings, with their variables filled in ("" when not set). */
export interface Settings {
  readonly assembler: string;
  readonly emulator: string;
  readonly core: string;
  readonly rom: string;
  readonly server: string;
  readonly disk: string;
  readonly ram: number;
  /** The server that comes with the extension. */
  readonly ownServer: string;
}

/** What the check runs (stand-ins in the tests). */
export interface Tools {
  /** The first line "e500asm --version" says. */
  assemblerVersion(file: string): Promise<string>;
  runtimes(): Promise<string>;
  /** Starts a machine and gives its ROM version, internal RAM and how long it took. */
  start(server: string, core: string, rom: string, ram: number): Promise<{ romVersion: string; romKB: number; internalKB: number; ms: number }>;
}

const isFile = (f: string): boolean => { try { return fs.statSync(f).isFile(); } catch { return false; } };
const isFolder = (f: string): boolean => { try { return fs.statSync(f).isDirectory(); } catch { return false; } };
const same = (a: string, b: string): boolean => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
const message = (e: unknown): string => (e instanceof Error ? e.message : String(e)).trim().split(/\r?\n/)[0];

export async function checkSetup(settings: Settings, where: Places, tools: Tools): Promise<Check[]> {
  const checks: Check[] = [];
  const open = (setting: string): Fix => ({ kind: "open", setting, label: L("設定を開く", "Open Settings") });
  const use = (setting: string, value: string): Fix => ({ kind: "use", setting, value, label: L("これを設定に入れる", "Put This in the Settings") });
  const fromPath = (found: string | undefined): string => found ? `PATH: ${found}` : L("PATH: ありません", "PATH: not there");

  // ---- The assembler ----
  checks.push({ id: "builtin", group: "assembler", title: L("内蔵アセンブラ", "Built-in assembler"), state: "ok", lines: [L("診断、F5、テスト、「BIN を作成」に使います（設定は不要）", "Used for the checks, F5, tests and Make BIN (nothing to set)")], fixes: [] });
  {
    const onPath = assemblerOnPath(where), near = assemblerInWorkspace(where);
    const file = settings.assembler || onPath;
    const lines = [settings.assembler ? L(`設定: ${settings.assembler}`, `Setting: ${settings.assembler}`) : L("設定: 空（PATH から探します）", "Setting: empty (looked for on PATH)"), fromPath(onPath)];
    const fixes: Fix[] = [];
    let state: State = "ok";
    if (!file) {
      state = "info";
      lines.push(L("「e500asm でアセンブル」を使うときだけ必要です。", "Only needed for “Assemble with e500asm”."));
      if (near) { lines.push(L(`ワークスペース: ${near}`, `Workspace: ${near}`)); fixes.push(use("pcE500.asm.assemblerPath", near)); }
    } else if (!isFile(file)) {
      state = "error";
      lines.push(L("設定のファイルがありません。", "The file of the setting does not exist."));
      const other = onPath ?? near;
      if (other) { if (other === near) lines.push(L(`ワークスペース: ${near}`, `Workspace: ${near}`)); fixes.push(use("pcE500.asm.assemblerPath", other)); }
    } else {
      try { lines.push(await tools.assemblerVersion(file)); } catch (e) { state = "error"; lines.push(L(`実行できません: ${message(e)}`, `Cannot be run: ${message(e)}`)); }
    }
    fixes.push({ kind: "pick", what: "assembler", label: L("ファイルを選択", "Pick the File") });
    if (state === "error") fixes.push(open("pcE500.asm.assemblerPath"));
    checks.push({ id: "assembler", group: "assembler", title: "e500asm", state, lines, fixes });
  }

  // ---- The emulator ----
  const onPath = emulatorOnPath(where), installed = emulatorInstalled(where), near = emulatorInWorkspace(where);
  const folder = settings.emulator || onPath || installed || "";
  const found: EmulatorFolder = folder ? inEmulatorFolder(folder, where) : {};
  {
    const lines = [settings.emulator ? L(`設定: ${settings.emulator}`, `Setting: ${settings.emulator}`) : L("設定: 空（PATH とインストール先から探します）", "Setting: empty (looked for on PATH and where it is installed)"), fromPath(onPath)];
    if (installed) lines.push(L(`インストール先: ${installed}`, `Installed: ${installed}`));
    const fixes: Fix[] = [];
    let state: State = "ok";
    if (!folder) {
      state = settings.core && settings.rom ? "info" : "error";
      if (state === "error") lines.push(L("エミュレータのフォルダが見つかりません。", "The emulator's folder was not found."));
    } else if (!isFolder(folder)) {
      state = "error";
      lines.push(L("設定のフォルダがありません。", "The folder of the setting does not exist."));
    } else if (!found.core && !settings.core) {
      state = "error";
      lines.push(L("このフォルダに e500core.dll がありません。", "This folder has no e500core.dll."));
    } else if (!settings.emulator) lines.push(L(`使うフォルダ: ${folder}`, `Used: ${folder}`));
    const suggestion = [near, onPath, installed].find(f => !!f && (!folder || !same(f, folder)) && hasDebugger(inEmulatorFolder(f, where).core ?? ""));
    if (suggestion && (state === "error" || !hasDebugger(settings.core || found.core || ""))) {
      lines.push(L(`使えるフォルダ: ${suggestion}`, `One that would do: ${suggestion}`));
      fixes.push(use("pcE500.emulatorPath", suggestion));
    }
    fixes.push({ kind: "pick", what: "emulator", label: L("フォルダを選択", "Pick the Folder") });
    if (state === "error") fixes.push(open("pcE500.emulatorPath"));
    checks.push({ id: "folder", group: "emulator", title: L("エミュレータのフォルダ", "Emulator folder"), state, lines, fixes });
  }
  const core = settings.core || found.core;
  {
    const lines: string[] = [];
    let state: State = "ok";
    if (!core || !isFile(core)) { state = "error"; lines.push(core ? L(`ありません: ${core}`, `Not there: ${core}`) : L("見つかりません。", "Not found.")); }
    else {
      lines.push(core);
      if (!hasDebugger(core)) { state = "error"; lines.push(L("デバッグ用の関数がない古いものです。新しいエミュレータの e500core.dll が必要です。", "An old one without the debugger functions: a newer emulator's e500core.dll is needed.")); }
    }
    checks.push({ id: "core", group: "emulator", title: "e500core.dll", state, lines, fixes: state === "ok" ? [] : [open("pcE500.corePath")] });
  }
  const rom = settings.rom || found.rom;
  {
    const lines: string[] = [];
    let state: State = "ok";
    if (!rom || !isFile(rom)) { state = "error"; lines.push(rom ? L(`ありません: ${rom}`, `Not there: ${rom}`) : L("ROM が見つかりません（rom フォルダの *.ROM）。", "No ROM was found (*.ROM in the rom folder).")); }
    else {
      const kb = fs.statSync(rom).size / 1024;
      lines.push(rom);
      if (kb !== 256 && kb !== 384) { state = "error"; lines.push(L(`大きさが違います（${kb} KB。256 か 384 KB）。`, `The size is wrong (${kb} KB; 256 or 384 KB).`)); }
    }
    checks.push({ id: "rom", group: "emulator", title: "ROM", state, lines, fixes: [{ kind: "pick", what: "rom", label: L("ファイルを選択", "Pick the File") }] });
  }
  const server = settings.server || settings.ownServer;
  if (where.platform !== "win32") {
    checks.push({ id: "platform", group: "emulator", title: L("動作環境", "System"), state: "error", lines: [L("エミュレータとの連携は Windows だけで動きます。", "The emulator only works on Windows.")], fixes: [] });
    return checks;
  }
  const serverOk = isFile(server);
  checks.push({
    id: "server", group: "emulator", title: L("デバッグサーバー", "Debug server"), state: serverOk ? "ok" : "error",
    lines: serverOk ? [server] : [L(`ありません: ${server}`, `Not there: ${server}`)], fixes: serverOk ? [] : [open("pcE500.serverPath")]
  });
  {
    let state: State = "ok", line = "";
    try {
      const list = await tools.runtimes();
      if (hasRuntime(list)) line = (/^Microsoft\.NETCore\.App 10\.\S+/m.exec(list) ?? [""])[0];
      else { state = "error"; line = L(".NET 10 のランタイムが入っていません。", "The .NET 10 runtime is not installed."); }
    } catch { state = "error"; line = L("dotnet が見つかりません（.NET 10 のランタイムが必要です）。", "dotnet was not found (the .NET 10 runtime is needed)."); }
    checks.push({ id: "runtime", group: "emulator", title: L(".NET ランタイム", ".NET runtime"), state, lines: [line], fixes: state === "ok" ? [] : [{ kind: "link", url: "https://dotnet.microsoft.com/download/dotnet/10.0", label: L("ダウンロード ページを開く", "Open the Download Page") }] });
  }
  {
    const disk = settings.disk || found.disk;
    const ok = !!disk && isFolder(disk);
    checks.push({
      id: "disk", group: "emulator", title: L("X: フォルダ（CE-140F）", "X: folder (CE-140F)"), state: ok ? "ok" : settings.disk ? "error" : "info",
      lines: ok ? [disk] : settings.disk ? [L(`ありません: ${settings.disk}`, `Not there: ${settings.disk}`)] : [L("「BIN を作成」でコピーするときに選べます。", "Can be picked when Make BIN copies there.")],
      fixes: [{ kind: "pick", what: "disk", label: L("フォルダを選択", "Pick the Folder") }]
    });
  }
  // All of it together: the one that counts.
  if (core && isFile(core) && rom && isFile(rom) && serverOk) {
    try {
      const m = await tools.start(server, core, rom, settings.ram);
      checks.push({ id: "start", group: "emulator", title: L("起動の確認", "Starting it"), state: "ok", lines: [L(`起動しました: ROM Ver.${m.romVersion}（${m.romKB}KB）、内蔵 RAM ${m.internalKB}KB（${m.ms} ms）`, `It started: ROM Ver.${m.romVersion} (${m.romKB}KB), internal RAM ${m.internalKB}KB (${m.ms} ms)`)], fixes: [] });
    } catch (e) {
      checks.push({ id: "start", group: "emulator", title: L("起動の確認", "Starting it"), state: "error", lines: [message(e)], fixes: [] });
    }
  } else checks.push({ id: "start", group: "emulator", title: L("起動の確認", "Starting it"), state: "info", lines: [L("足りないものがあるので、試していません。", "Not tried, as something is missing.")], fixes: [] });
  return checks;
}

/** In a line: whether everything can be used. */
export function summary(checks: readonly Check[]): { state: State; text: string } {
  const bad = checks.filter(c => c.state === "error");
  return bad.length === 0 ? { state: "ok", text: L("すべて使えます", "Everything can be used") }
    : { state: "error", text: L(`直すところがあります: ${bad.map(c => c.title).join("、")}`, `To be fixed: ${bad.map(c => c.title).join(", ")}`) };
}
