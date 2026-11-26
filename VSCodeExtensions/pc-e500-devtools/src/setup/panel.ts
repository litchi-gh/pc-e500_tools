// The page that shows the check of the surroundings, with buttons to put them right.
import { execFile } from "node:child_process";
import * as path from "node:path";
import * as vscode from "vscode";
import { newNonce } from "../lcd/shared";
import { assemblerInvocation } from "../asm/invocation";
import { EmulatorClient } from "../emu/client";
import { setupSettings, workspacePlaces } from "../emu/config";
import { isEnglish, L } from "../l10n";
import { Check, checkSetup, Fix, summary, Tools } from "./check";

function run(file: string, args: readonly string[], verbatim = false): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(file, [...args], { windowsHide: true, timeout: 15000, windowsVerbatimArguments: verbatim }, (error, stdout, stderr) => {
      if (error && !stdout) reject(new Error(stderr.trim() || error.message));
      else resolve(stdout);
    });
  });
}

const tools: Tools = {
  async assemblerVersion(file) {
    const i = assemblerInvocation(file, ["--version"]);
    return (await run(i.file, i.args, i.verbatim)).trim().split(/\r?\n/)[0];
  },
  async runtimes() {
    try { return await run("dotnet", ["--list-runtimes"]); } catch {
      return run(path.join(process.env.ProgramFiles ?? "C:\\Program Files", "dotnet", "dotnet.exe"), ["--list-runtimes"]);
    }
  },
  async start(server, core, rom, ram) {
    const began = Date.now();
    const client = new EmulatorClient({ server, core });
    try {
      const info = await Promise.race([client.open(rom, ram), new Promise<never>((_, reject) => setTimeout(() => reject(new Error(L("応答がありません。", "It does not answer."))), 15000))]);
      return { ...info, ms: Date.now() - began };
    } finally {
      client.dispose();
    }
  }
};

export class SetupPanel {
  private static current: SetupPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private checks: Check[] = [];
  private busy = false;
  private again = false;

  static show(context: vscode.ExtensionContext): void {
    if (SetupPanel.current) { SetupPanel.current.panel.reveal(); void SetupPanel.current.check(); }
    else SetupPanel.current = new SetupPanel(context);
  }

  private constructor(private readonly context: vscode.ExtensionContext) {
    const media = vscode.Uri.joinPath(context.extensionUri, "media");
    this.panel = vscode.window.createWebviewPanel("pcE500.setup", L("PC-E500 の環境", "PC-E500 Setup"), vscode.ViewColumn.Active, { enableScripts: true, localResourceRoots: [media], retainContextWhenHidden: true });
    this.panel.iconPath = vscode.Uri.joinPath(media, "icon.png");
    const webview = this.panel.webview;
    const nonce = newNonce();
    webview.html = setupPage(name => webview.asWebviewUri(vscode.Uri.joinPath(media, name)).toString(), webview.cspSource, nonce);
    const listeners = [
      webview.onDidReceiveMessage(async (m: { type: "ready" | "check" | "settings" | "fix"; id?: string; index?: number }) => {
        if (m.type === "ready" || m.type === "check") await this.check();
        else if (m.type === "settings") await vscode.commands.executeCommand("workbench.action.openSettings", "@ext:" + this.context.extension.id);
        else {
          const fix = this.checks.find(c => c.id === m.id)?.fixes[m.index ?? 0];
          if (fix) await this.fix(fix);
        }
      }),
      vscode.workspace.onDidChangeConfiguration(e => { if (e.affectsConfiguration("pcE500")) void this.check(); })
    ];
    this.panel.onDidDispose(() => { SetupPanel.current = undefined; listeners.forEach(l => l.dispose()); });
  }

  private async check(): Promise<void> {
    // One at a time; what changed meanwhile is looked at after.
    if (this.busy) { this.again = true; return; }
    this.busy = true;
    try {
      do {
        this.again = false;
        void this.panel.webview.postMessage({ type: "busy" });
        this.checks = await checkSetup(setupSettings(this.context.extensionPath), workspacePlaces(), tools);
        void this.panel.webview.postMessage({ type: "checks", checks: this.checks, summary: summary(this.checks) });
      } while (this.again);
    } catch (error) {
      void this.panel.webview.postMessage({ type: "checks", checks: [], summary: { state: "error", text: error instanceof Error ? error.message : String(error) } });
    } finally {
      this.busy = false;
    }
  }

  private async fix(fix: Fix): Promise<void> {
    if (fix.kind === "open") { await vscode.commands.executeCommand("workbench.action.openSettings", fix.setting); return; }
    if (fix.kind === "link") { await vscode.env.openExternal(vscode.Uri.parse(fix.url)); return; }
    if (fix.kind === "use") { await setSetting(fix.setting, fix.value); await this.check(); return; }
    const folder = fix.what === "emulator" || fix.what === "disk";
    const picked = (await vscode.window.showOpenDialog({
      canSelectFolders: folder, canSelectFiles: !folder, openLabel: L("これを使う", "Use This"),
      title: fix.what === "assembler" ? L("e500asm のファイル", "The e500asm file") : fix.what === "rom" ? L("ROM ファイル", "The ROM file")
        : fix.what === "disk" ? L("CE-140F の X: フォルダ", "The CE-140F's X: folder") : L("PC-E500 エミュレータのフォルダ（e500core.dll と rom がある場所）", "The PC-E500 emulator's folder (with e500core.dll and rom)"),
      ...(fix.what === "rom" ? { filters: { ROM: ["rom", "bin"], [L("すべて", "All")]: ["*"] } } : fix.what === "assembler" && process.platform === "win32" ? { filters: { e500asm: ["exe", "cmd", "bat"] } } : {})
    }))?.[0]?.fsPath;
    if (!picked) return;
    await setSetting({ assembler: "pcE500.asm.assemblerPath", emulator: "pcE500.emulatorPath", rom: "pcE500.romPath", disk: "pcE500.diskFolder" }[fix.what], picked);
    await this.check();
  }
}

/** Writes a setting where it has its value now (the workspace's if it is set there), else for the user. */
async function setSetting(name: string, value: string): Promise<void> {
  const config = vscode.workspace.getConfiguration();
  const now = config.inspect(name);
  const target = now?.workspaceFolderValue !== undefined && vscode.workspace.workspaceFolders?.length === 1 ? vscode.ConfigurationTarget.Workspace
    : now?.workspaceValue !== undefined ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
  try { await config.update(name, value, target); } catch (error) { void vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error)); }
}

export function setupPage(resource: (name: string) => string, cspSource: string, nonce: string): string {
  return `<!DOCTYPE html>
<html lang="${isEnglish() ? "en" : "ja"}"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource}; style-src ${cspSource}; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link href="${resource("setup.css")}" rel="stylesheet"><title>PC-E500</title></head>
<body>
<header><img src="${resource("icon.png")}" alt=""><div><h1>${L("PC-E500 の環境", "PC-E500 Setup")}</h1><p id="summary" role="status">${L("確認中…", "Checking…")}</p></div>
<span class="buttons"><button id="check" class="main">${L("再確認", "Check Again")}</button><button id="settings">${L("設定を開く", "Open Settings")}</button></span></header>
<main>
<section><h2>${L("アセンブラ", "Assembler")}</h2><div id="assembler" class="list"></div></section>
<section><h2>${L("エミュレータ", "Emulator")}</h2><div id="emulator" class="list"></div></section>
</main>
<script nonce="${nonce}" src="${resource("setup.js")}"></script>
</body></html>`;
}
