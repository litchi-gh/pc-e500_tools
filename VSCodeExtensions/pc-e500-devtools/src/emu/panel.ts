// The emulator in a VS Code panel: the LCD, the keys, run/pause/reset and the speed.
import * as vscode from "vscode";
import { newNonce } from "../lcd/shared";
import { EmulatorClient, MachineInfo, Screen, Stopped } from "./client";
import { Attached, MachineHub } from "./hub";
import { EditKind, Inspector } from "./inspector";
import { isEnglish, L } from "../l10n";

type FromView =
  | { type: "ready" }
  | { type: "key"; name: string; down: boolean }
  | { type: "type"; text: string }
  | { type: "inspect"; watches: string[] }
  | { type: "watches"; list: string[] }
  | { type: "set"; kind: EditKind; target: string; text: string }
  | { type: "control"; action: "continue" | "pause" | "reset" | "speed" | "copy" | "start" | "debugger"; value?: number };

export class EmulatorPanel implements vscode.Disposable {
  private static instance?: EmulatorPanel;
  private readonly disposables: vscode.Disposable[] = [];
  private unbind: () => void = () => undefined;

  /** Opens the panel (or brings it forward). `start` makes a machine when none is attached. */
  static show(context: vscode.ExtensionContext, hub: MachineHub, start: () => Promise<void>, focus = false): EmulatorPanel {
    if (EmulatorPanel.instance) {
      EmulatorPanel.instance.panel.reveal(undefined, !focus);
      return EmulatorPanel.instance;
    }
    const panel = vscode.window.createWebviewPanel("pcE500.emulator", "PC-E500", { viewColumn: vscode.ViewColumn.Beside, preserveFocus: !focus }, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")]
    });
    EmulatorPanel.instance = new EmulatorPanel(panel, context, hub, start);
    return EmulatorPanel.instance;
  }

  static get isOpen(): boolean { return EmulatorPanel.instance !== undefined; }

  private inspecting = false;

  private constructor(private readonly panel: vscode.WebviewPanel, private readonly context: vscode.ExtensionContext, private readonly hub: MachineHub, private readonly start: () => Promise<void>) {
    panel.iconPath = vscode.Uri.joinPath(context.extensionUri, "media", "icon.svg");
    panel.webview.html = this.html(context);
    this.disposables.push(
      panel.onDidDispose(() => this.dispose()),
      panel.webview.onDidReceiveMessage((message: FromView) => void this.received(message)),
      hub.onDidChange(attached => this.bind(attached))
    );
  }

  private post(message: unknown): void {
    void this.panel.webview.postMessage(message);
  }

  private bind(attached: Attached | undefined): void {
    this.unbind();
    this.unbind = () => undefined;
    if (!attached) {
      this.post({ type: "state", attached: false, title: L("マシンなし", "No machine"), running: false });
      return;
    }
    const client = attached.client;
    const onFrame = (screen: Screen): void => this.post({ type: "frame", pixels: screen.pixels, symbols: screen.symbols });
    const model = appearance(client.info);
    const onStopped = (stop: Stopped): void => this.post({ type: "state", attached: true, title: attached.label, running: false, model, speed: client.currentSpeed, message: stopText(stop) });
    const onContinued = (): void => this.post({ type: "state", attached: true, title: attached.label, running: true, model, speed: client.currentSpeed });
    const onExit = (): void => this.post({ type: "state", attached: false, title: L("終了しました", "Ended"), running: false });
    client.on("frame", onFrame).on("stopped", onStopped).on("continued", onContinued).on("exit", onExit);
    this.unbind = () => { client.off("frame", onFrame).off("stopped", onStopped).off("continued", onContinued).off("exit", onExit); };
    this.post({ type: "state", attached: true, title: attached.label, running: client.running, model, speed: client.currentSpeed });
    void client.screen().then(onFrame, () => undefined);
  }

  private async received(message: FromView): Promise<void> {
    if (message.type === "ready") {
      this.bind(this.hub.current);
      this.post({ type: "watches", list: this.context.workspaceState.get<string[]>("pcE500.watches", []) });
      return;
    }
    if (message.type === "watches") { await this.context.workspaceState.update("pcE500.watches", message.list); return; }
    if (message.type === "set") { await this.setValue(message.kind, message.target, message.text); return; }
    if (message.type === "inspect") { await this.inspect(message.watches); return; }
    if (message.type === "control" && message.action === "debugger") { void vscode.commands.executeCommand("pcE500.openDebugger"); return; }
    if (message.type === "control" && message.action === "start") {
      try { await this.start(); } catch (error) { void vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error)); }
      return;
    }
    const client: EmulatorClient | undefined = this.hub.current?.client;
    if (!client?.alive) return;
    try {
      switch (message.type) {
        case "key": await client.key(message.name, message.down); break;
        case "type": {
          const result = await client.type(message.text);
          if (result.skipped) void vscode.window.showWarningMessage(L(`キーで入力できない文字を省きました: ${result.skipped}`, `Left out characters that have no key: ${result.skipped}`));
          break;
        }
        case "control":
          switch (message.action) {
            case "continue": await client.continue(); break;
            case "pause": {
              const attached = this.hub.current!;
              if (!attached.pause) { await client.pause(); break; }
              await attached.pause();
              if (client.running) this.post({ type: "state", attached: true, title: attached.label, running: true, model: appearance(client.info), pausing: true });
              break;
            }
            case "reset": await client.reset(false); if (!client.running) await client.continue(); break;
            case "speed": await client.speed(message.value ?? 1); break;
            case "copy": {
              const text = (await client.screen()).text ?? "";
              await vscode.env.clipboard.writeText(text);
              void vscode.window.showInformationMessage(L("LCD の文字をコピーしました。", "Copied the LCD text."));
              break;
            }
          }
          break;
      }
    } catch (error) {
      void vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  // What can be changed now, by kind (see EditKind).
  private can(attached: Attached): Record<EditKind, boolean> {
    const stopped = attached.client.alive && !attached.client.running;
    return { basic: attached.editor?.canEdit() ?? false, asm: stopped && !attached.editor, memory: stopped };
  }

  private async setValue(kind: EditKind, target: string, text: string): Promise<void> {
    const attached = this.hub.current;
    let error = "";
    try {
      if (!attached || !this.can(attached)[kind]) throw new Error(L("いまは書き換えられません。", "It cannot be changed now."));
      if (kind === "basic") await attached.editor!.set(target, text);
      else {
        await new Inspector(attached.client, attached.program).set(target, text);
        attached.changed?.();
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    this.post({ type: "edited", error });
  }

  // The variables and the watches, read from the machine as it runs; one at a time.
  private async inspect(watches: string[]): Promise<void> {
    const attached = this.hub.current;
    if (!attached?.client.alive || this.inspecting) return;
    this.inspecting = true;
    try {
      const inspector = new Inspector(attached.client, attached.program);
      const groups = await inspector.groups();
      const values = [];
      for (const expression of watches) {
        try { values.push({ expression, ...await inspector.watch(expression) }); }
        catch (error) { values.push({ expression, error: error instanceof Error ? error.message : String(error) }); }
      }
      this.post({ type: "inspection", groups, watches: values, can: this.can(attached) });
    } catch {
      // The machine went away between the question and the answer.
    } finally {
      this.inspecting = false;
    }
  }

  private html(context: vscode.ExtensionContext): string {
    const webview = this.panel.webview;
    const nonce = newNonce();
    const script = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, "media", "emulator.js"));
    const style = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, "media", "emulator.css"));
    return `<!DOCTYPE html>
<html lang="${isEnglish() ? "en" : "ja"}">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link href="${style}" rel="stylesheet">
<title>PC-E500</title>
</head>
<body>
<header class="bar">
  <span id="title" class="title">PC-E500</span>
  <span id="status" class="status"></span>
  <button id="run" title="${L("実行 / 一時停止", "Run / pause")}">${L("▶ 実行", "▶ Run")}</button>
  <button id="reset" title="${L("RESET（RAM は残ります）", "RESET (RAM is kept)")}">${L("リセット", "Reset")}</button>
  <select id="speed" title="${L("速度", "Speed")}">
    <option value="1">${L("1倍", "1x")}</option><option value="2">${L("2倍", "2x")}</option><option value="4">${L("4倍", "4x")}</option><option value="0">${L("最高速", "Fastest")}</option>
  </select>
  <select id="view" title="${L("表示（エミュレータの「本体」「画面だけ」と同じ）", "View (as the emulator's Body / Screen only)")}"><option value="body">${L("本体", "Body")}</option><option value="screen">${L("画面だけ", "Screen only")}</option></select>
  <label class="check" title="${L("ドットの間をあけて、実機の液晶のように表示する", "Space the dots apart, like the real LCD")}"><input type="checkbox" id="real">${L("リアル表示", "Real LCD")}</label>
  <label class="check" title="${L("パネルの下に変数とウォッチを出す（実行中も更新）", "Show variables and watches under the panel (updated while running)")}"><input type="checkbox" id="showInspect">${L("変数・ウォッチ", "Variables & watch")}</label>
  <button id="copy" title="${L("LCD の文字をクリップボードへ", "Copy the LCD text to the clipboard")}">${L("文字をコピー", "Copy text")}</button>
  <button id="debugger" title="${L("レジスタ・内部 RAM・メモリマップ・メモリ（エミュレータのデバッグ画面と同じ）", "Registers, internal RAM, memory map and memory (as the emulator's debug window)")}">${L("デバッグ画面", "Debug window")}</button>
</header>
<main>
  <section class="stage">
    <canvas id="device" tabindex="0" title="${L("クリックすると PC のキーボードで入力できます", "Click to type with the PC keyboard")}"></canvas>
    <div id="empty" class="empty" hidden>
      <p>${L("マシンが動いていません。", "No machine is running.")}</p>
      <button id="start">${L("エミュレータを起動", "Start the emulator")}</button>
    </div>
  </section>
  <section class="inspect" id="inspect">
    <div class="pane">
      <h2>${L("変数", "Variables")}</h2>
      <div id="vars" class="tree"></div>
      <div id="varsNote" class="varsnote"></div>
    </div>
    <div class="pane">
      <h2>${L("ウォッチ", "Watch")}</h2>
      <div id="watchList" class="tree"></div>
      <input id="watchInput" spellcheck="false" placeholder="${L("式を追加して Enter（A、B$、P(1)、X、[WORK]:2、(BP) など）", "Add an expression and press Enter (A, B$, P(1), X, [WORK]:2, (BP) ...)")}">
    </div>
  </section>
  <section class="paste">
    <textarea id="text" rows="2" placeholder="${L("BASIC の行などを入力して「送る」（改行は ENTER、Ctrl+Enter でも送る）", "Type BASIC lines etc. and press Send (a new line is ENTER; Ctrl+Enter also sends)")}"></textarea>
    <button id="send">${L("送る", "Send")}</button>
  </section>
  <p class="hint">${L("本体をクリックすると PC のキーボードで入力できます: Enter / BS / Del / Ins / 矢印 / Esc=ON/BRK / F1〜F5 / F6=MENU / F7=BASIC / F8=2ndF。SHIFT・CTRL はクリックすると次のキーまで押したままになります。", "Click the body to type with the PC keyboard: Enter / BS / Del / Ins / arrows / Esc=ON/BRK / F1-F5 / F6=MENU / F7=BASIC / F8=2ndF. A clicked SHIFT or CTRL stays down for the next key.")}</p>
</main>
<script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
  }

  dispose(): void {
    if (EmulatorPanel.instance === this) EmulatorPanel.instance = undefined;
    this.unbind();
    this.disposables.forEach(d => d.dispose());
    this.panel.dispose();
  }
}

// The case drawn for a ROM: the PC-E650 and PC-U6000 (384KB ROMs, model code 5 and 4)
// have the wide case with their own name; the rest (the PC-E500S too) the PC-E500's.
function appearance(info: MachineInfo | undefined): string {
  if (!info || info.romKB !== 384) return "PC-E500";
  const minor = Number(info.romVersion.split(".")[1]);
  return minor === 5 ? "PC-E650" : minor === 4 ? "PC-U6000" : "PC-E500";
}

function stopText(stop: Stopped): string {
  const pc = stop.pc.toString(16).toUpperCase().padStart(5, "0");
  switch (stop.reason) {
    case "breakpoint": return L(`ブレークポイント（${pc}）`, `Breakpoint (${pc})`);
    case "step": return L(`ステップ（${pc}）`, `Step (${pc})`);
    case "pause": return L(`一時停止（${pc}）`, `Paused (${pc})`);
    case "exception": return L(`未定義命令で停止（${pc}）`, `Stopped on an undefined instruction (${pc})`);
    case "return": return L("ルーチンから戻りました", "Returned from the routine");
    case "read": return L("BASIC の行で停止", "Stopped at a BASIC line");
  }
}
