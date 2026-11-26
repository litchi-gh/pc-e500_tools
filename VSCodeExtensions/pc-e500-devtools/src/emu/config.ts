// Where e500dbg, the emulator core and the ROM are, from the settings (pcE500.*).
import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { MachineConfig } from "./prepare";
import { Settings } from "../setup/check";
import { assemblerOnPath, emulatorByItself, EmulatorFolder, inEmulatorFolder, Places, places } from "../setup/find";
import { L } from "../l10n";

export class SetupError extends Error {
  constructor(message: string, readonly setting: string, readonly pickFolder = false) { super(message); }
}

function expand(value: string, scope?: vscode.Uri): string {
  if (!value) return value;
  const folder = (scope && vscode.workspace.getWorkspaceFolder(scope)) ?? vscode.workspace.workspaceFolders?.[0];
  let v = value.replace(/\$\{workspaceFolder\}/g, folder?.uri.fsPath ?? "");
  if (v.startsWith("~")) v = path.join(process.env.USERPROFILE ?? process.env.HOME ?? "", v.slice(1));
  if (!path.isAbsolute(v) && folder) v = path.join(folder.uri.fsPath, v);
  return v;
}

/** Where things are looked for: PATH, the installed places, the workspace. */
export function workspacePlaces(): Places {
  // Nothing of a folder that is not trusted is offered: it would be run at once.
  return places(vscode.workspace.isTrusted === false ? [] : (vscode.workspace.workspaceFolders ?? []).map(f => f.uri.fsPath));
}

/** The emulator's folder: the setting, or one on PATH or installed. */
function emulatorFolder(scope?: vscode.Uri): string | undefined {
  return expand(vscode.workspace.getConfiguration("pcE500", scope).get<string>("emulatorPath", ""), scope) || emulatorByItself(workspacePlaces());
}

/** The folder of the CE-140F's X: drive: the setting, or the emulator's own. */
export function diskFolder(scope?: vscode.Uri): string | undefined {
  const set = expand(vscode.workspace.getConfiguration("pcE500", scope).get<string>("diskFolder", ""), scope);
  if (set) return set;
  const emulator = emulatorFolder(scope);
  return emulator ? inEmulatorFolder(emulator, workspacePlaces()).disk : undefined;
}

/** The e500asm to run: the setting, or the one on PATH. */
export function assemblerFile(scope?: vscode.Uri): string | undefined {
  return expand(vscode.workspace.getConfiguration("pcE500.asm", scope).get<string>("assemblerPath", "").trim(), scope) || assemblerOnPath(workspacePlaces());
}

const ownServer = (extensionPath: string): string => path.join(extensionPath, "out", "server", "e500dbg.exe");

/** The settings as the check of the setup takes them. */
export function setupSettings(extensionPath: string): Settings {
  const scope = vscode.window.activeTextEditor?.document.uri;
  const config = vscode.workspace.getConfiguration("pcE500", scope);
  const get = (key: string): string => expand(config.get<string>(key, "").trim(), scope);
  return {
    assembler: get("asm.assemblerPath"), emulator: get("emulatorPath"), core: get("corePath"), rom: get("romPath"), server: get("serverPath"), disk: get("diskFolder"),
    ram: config.get<number>("ramKB", 32), ownServer: ownServer(extensionPath)
  };
}

export interface Overrides {
  readonly rom?: string;
  readonly ram?: number;
  readonly state?: string;
}

/** Everything needed to start a machine, or a SetupError naming the setting to fix. */
export function machineConfig(extensionPath: string, scope?: vscode.Uri, overrides: Overrides = {}): MachineConfig {
  const config = vscode.workspace.getConfiguration("pcE500", scope);
  const emulator = emulatorFolder(scope);
  const server = expand(config.get<string>("serverPath", ""), scope) || ownServer(extensionPath);
  if (process.platform !== "win32") throw new SetupError(L("エミュレータとの連携は今のところ Windows だけで動きます。", "The emulator only works on Windows for now."), "pcE500.emulatorPath");
  if (!fs.existsSync(server)) throw new SetupError(L(`デバッグサーバー e500dbg.exe が見つかりません: ${server}（拡張のフォルダで npm run build:server を実行してください）`, `The debug server e500dbg.exe was not found: ${server} (run npm run build:server in the extension's folder)`), "pcE500.serverPath");

  const coreSetting = expand(config.get<string>("corePath", ""), scope);
  const found: EmulatorFolder = emulator ? inEmulatorFolder(emulator, workspacePlaces()) : {};
  const core = coreSetting || found.core;
  if (!core || !fs.existsSync(core)) {
    throw new SetupError(emulator
      ? L(`e500core.dll が見つかりません（${emulator}）。設定 pcE500.corePath で指定してください。`, `e500core.dll was not found (${emulator}). Set it in the setting pcE500.corePath.`)
      : L("PC-E500 エミュレータのフォルダを設定 pcE500.emulatorPath に指定してください（e500core.dll と rom フォルダがある場所）。", "Set the PC-E500 emulator's folder (the one with e500core.dll and the rom folder) in the setting pcE500.emulatorPath."), emulator ? "pcE500.corePath" : "pcE500.emulatorPath", !coreSetting);
  }

  const romSetting = overrides.rom ? expand(overrides.rom, scope) : expand(config.get<string>("romPath", ""), scope);
  const rom = romSetting || found.rom;
  if (!rom || !fs.existsSync(rom)) throw new SetupError(romSetting ? L(`ROM が見つかりません: ${romSetting}`, `The ROM was not found: ${romSetting}`) : L("ROM ファイルを設定 pcE500.romPath に指定してください。", "Set the ROM file in the setting pcE500.romPath."), "pcE500.romPath", !romSetting);

  const state = overrides.state ? expand(overrides.state, scope) : undefined;
  if (state && !fs.existsSync(state)) throw new SetupError(L(`状態ファイルが見つかりません: ${state}`, `The state file was not found: ${state}`), "pcE500.emulatorPath");
  return { server, core, rom, ram: overrides.ram ?? config.get<number>("ramKB", 32), state };
}

/**
 * Shows a SetupError with a button to its setting (for the emulator's folder, one to pick
 * it, kept in the user's settings); other errors plainly. Whether to try again.
 */
export async function showSetupError(error: unknown): Promise<boolean> {
  const message = error instanceof Error ? error.message : String(error);
  if (!(error instanceof SetupError)) {
    void vscode.window.showErrorMessage(message);
    return false;
  }
  const check = L("環境を確認", "Check the Setup"), pick = L("フォルダを選択", "Pick the Folder");
  const choice = error.pickFolder ? await vscode.window.showErrorMessage(message, pick, check) : await vscode.window.showErrorMessage(message, check);
  if (choice === check) void vscode.commands.executeCommand("pcE500.checkSetup");
  return choice === pick && await pickEmulatorFolder();
}

async function pickEmulatorFolder(): Promise<boolean> {
  const picked = (await vscode.window.showOpenDialog({
    canSelectFolders: true, canSelectFiles: false,
    title: L("PC-E500 エミュレータのフォルダ（e500core.dll と rom がある場所）", "The PC-E500 emulator's folder (with e500core.dll and rom)"), openLabel: L("このフォルダを使う", "Use This Folder")
  }))?.[0]?.fsPath;
  if (!picked) return false;
  const found = inEmulatorFolder(picked, workspacePlaces());
  const missing = [found.core ? "" : "e500core.dll", found.rom ? "" : L("ROM（rom フォルダの *.ROM）", "a ROM (*.ROM in the rom folder)")].filter(m => m);
  if (missing.length > 0) {
    void vscode.window.showErrorMessage(L(`${picked} に ${missing.join(" と ")} が見つかりません。`, `${picked} does not have ${missing.join(" and ")}.`));
    return false;
  }
  await vscode.workspace.getConfiguration("pcE500").update("emulatorPath", picked, vscode.ConfigurationTarget.Global);
  return true;
}

/** Whether everything to start a machine is set, letting the user pick the emulator's folder if not. */
export async function ensureSetup(extensionPath: string, scope: vscode.Uri | undefined, overrides: Overrides = {}): Promise<boolean> {
  for (;;) {
    try { machineConfig(extensionPath, scope, overrides); return true; } catch (error) {
      // Other mistakes are told by whatever starts the machine.
      if (!(error instanceof SetupError) || !error.pickFolder) return true;
      if (!await showSetupError(error)) return false;
    }
  }
}

let includeFolder = "";
/** The extension's own include files (inc/), looked in last. */
export function setIncludeFolder(folder: string): void { includeFolder = folder; }
export function ownIncludeFolder(): string { return includeFolder; }

/** Assembler settings (pcE500.asm.*) for a file, with the extension's include files. */
export function assemblerOptions(resource: vscode.Uri): { includeDirectories: string[]; defines: Record<string, number> } {
  const config = vscode.workspace.getConfiguration("pcE500.asm", resource);
  return {
    includeDirectories: [...config.get<string[]>("includeDirectories", []).map(dir => expand(dir, resource)), ...(includeFolder ? [includeFolder] : [])],
    defines: config.get<Record<string, number>>("defines", {})
  };
}
