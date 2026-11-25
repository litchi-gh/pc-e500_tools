// The debug window of the PC-E500 emulator, in a VS Code panel: registers, internal
// RAM, the memory map, a hex view of the whole 1MB that edits RAM in place, and BIN
// load and save (Emulator/src/desktop/Debugger.cs, MemoryMapView.cs, HexView.cs).
import * as fs from "node:fs";
import * as vscode from "vscode";
import { newNonce } from "../lcd/shared";
import { Inspector } from "./inspector";
import { EmulatorClient } from "./client";
import { MachineHub } from "./hub";
import { hex5 } from "./program";
import { cardLayout, internalLayout } from "./ramLayout";
import { isEnglish, L } from "../l10n";

type FromView =
  | { type: "ready" }
  | { type: "refresh"; address: number; length: number; layout: boolean }
  | { type: "write"; address: number; value: number }
  | { type: "register"; name: string; text: string }
  | { type: "imem"; address: number; value: number }
  | { type: "bin"; save: boolean; address: number };

export class DebugPanel implements vscode.Disposable {
  private static instance?: DebugPanel;
  private readonly disposables: vscode.Disposable[] = [];
  private busy = false;

  static show(context: vscode.ExtensionContext, hub: MachineHub): void {
    if (DebugPanel.instance) { DebugPanel.instance.panel.reveal(); return; }
    const panel = vscode.window.createWebviewPanel("pcE500.debug", L("PC-E500 デバッグ", "PC-E500 Debug"), vscode.ViewColumn.Beside, {
      enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")]
    });
    DebugPanel.instance = new DebugPanel(panel, context, hub);
  }

  private constructor(private readonly panel: vscode.WebviewPanel, context: vscode.ExtensionContext, private readonly hub: MachineHub) {
    panel.iconPath = vscode.Uri.joinPath(context.extensionUri, "media", "icon.svg");
    const webview = panel.webview;
    const nonce = newNonce();
    const script = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, "media", "debug.js"));
    const style = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, "media", "debug.css"));
    webview.html = `<!DOCTYPE html>
<html lang="${isEnglish() ? "en" : "ja"}"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link href="${style}" rel="stylesheet"><title>${L("PC-E500 デバッグ", "PC-E500 Debug")}</title></head>
<body>
<header class="bar">
  <label>${L("アドレス", "Address")} <input id="address" value="B0000" spellcheck="false"></label>
  <button data-jump="P">PC</button><button data-jump="S">S</button><button data-jump="X">X</button><button data-jump="Y">Y</button><button data-jump="U">U</button>
  <button data-jump="internal">${L("内蔵RAM", "Internal RAM")}</button><button data-jump="card">${L("カード", "Card")}</button><button data-jump="rom">ROM</button>
  <button id="refresh" class="gap">${L("更新", "Refresh")}</button><label class="check"><input type="checkbox" id="live" checked>${L("自動更新", "Auto refresh")}</label>
  <button id="load" class="gap">${L("BIN書込み", "Load BIN")}</button><button id="save">${L("BIN書出し", "Save BIN")}</button>
  <select id="columns" class="gap"><option value="16">${L("16 バイト/行", "16 bytes/row")}</option><option value="8">${L("8 バイト/行", "8 bytes/row")}</option></select>
</header>
<section class="card">
  <h2>${L("メモリマップ（押すとその区画へ）", "Memory map (click to go there)")}</h2>
  <div class="map" id="internalMap"></div>
  <div class="map" id="cardMap" hidden></div>
</section>
<div class="panes">
  <section class="card cpu">
    <h2>CPU</h2>
    <div class="state"><span id="badge" class="badge">—</span><span id="cycles" class="sub"></span></div>
    <div class="registers" id="registers"></div>
    <div class="flags"><span id="flagC" class="lamp">${L("C（キャリー）", "C (carry)")}</span><span id="flagZ" class="lamp">${L("Z（ゼロ）", "Z (zero)")}</span></div>
    <h3>${L("内部 RAM のポインタ・I/O と 256 バイト", "Internal RAM pointers, I/O and its 256 bytes")}</h3>
    <pre id="imem" class="imem" tabindex="0"></pre>
  </section>
  <section class="card memory">
    <h2>${L("メモリ", "Memory")}</h2>
    <div class="hex" id="hex" tabindex="0"><div id="hexSpacer"></div><pre id="hexRows"></pre></div>
  </section>
</div>
<footer>
  <div id="note" class="note">${L("メモリ欄をクリックして16進を入力すると、その場で書き換えます（内蔵RAM・RAMカードのみ）。灰色は未定義、青はROM、「:」の右は8バイトのチェックサムです。", "Click a byte and type hex digits to edit it in place (internal RAM and RAM card only). Grey is unmapped, blue is ROM; after each \":\" is the checksum of eight bytes.")}</div>
  <div id="region" class="sub"></div>
</footer>
<script nonce="${nonce}" src="${script}"></script>
</body></html>`;
    this.disposables.push(
      panel.onDidDispose(() => this.dispose()),
      webview.onDidReceiveMessage((m: FromView) => void this.received(m).catch(error => this.note(error instanceof Error ? error.message : String(error)))),
      hub.onDidChange(() => void this.post({ type: "machine", attached: !!hub.current }))
    );
  }

  private post(message: unknown): Thenable<boolean> { return this.panel.webview.postMessage(message); }
  private note(text: string): void { void this.post({ type: "note", text }); }
  private get client(): EmulatorClient | undefined { const c = this.hub.current?.client; return c?.alive ? c : undefined; }

  private async received(message: FromView): Promise<void> {
    const client = this.client;
    if (message.type === "ready") { void this.post({ type: "machine", attached: !!client }); return; }
    if (!client) { void this.post({ type: "machine", attached: false }); return; }
    switch (message.type) {
      case "refresh": {
        // One snapshot at a time: a slow one is not queued behind by the timer.
        if (this.busy) return;
        this.busy = true;
        try {
          const info = client.info!;
          const [registers, imem, data] = await Promise.all([client.registers(), client.internalMemory(), client.read(message.address, message.length)]);
          const read = (a: number, n: number) => client.read(a, n);
          const layout = message.layout ? {
            internal: await internalLayout(read, info.internalKB),
            card: info.cardKB > 0 ? await cardLayout(read, info.cardKB) : []
          } : undefined;
          void this.post({
            type: "snapshot", running: client.running, registers, imem: imem.toString("base64"),
            memory: { address: message.address, data: data.toString("base64") },
            info: { internalKB: info.internalKB, cardKB: info.cardKB, e650: info.romKB === 384 }, layout
          });
        } finally {
          this.busy = false;
        }
        return;
      }
      case "write": {
        const a = message.address;
        const internalBottom = 0xc0000 - client.info!.internalKB * 1024;
        const ram = (a >= internalBottom && a < 0xc0000) || (client.info!.cardKB > 0 && a >= 0x40000 && a < 0x80000) || (a >= 0x80000 && a < 0xc0000);
        if (!ram) { this.note(L(`${hex5(a)} は RAM ではないため書き換えられません。`, `${hex5(a)} is not RAM and cannot be changed.`)); return; }
        await client.write(a, Uint8Array.of(message.value & 0xff));
        const value = (message.value & 0xff).toString(16).toUpperCase().padStart(2, "0");
        this.note(L(`${hex5(a)} を ${value} にしました。`, `Set ${hex5(a)} to ${value}.`));
        this.hub.current?.changed?.();
        return;
      }
      case "register": {
        await this.setRegister(client, message.name, message.text);
        this.note(L(`${message.name} を書き換えました。`, `Changed ${message.name}.`));
        this.hub.current?.changed?.();
        void this.post({ type: "changed" });
        return;
      }
      case "imem": {
        if (client.running) throw new Error(L("内部 RAM は、止めているときに書き換えられます。", "Internal RAM can be changed while stopped."));
        await client.writeInternalMemory(message.address, Uint8Array.of(message.value & 0xff));
        const at = message.address.toString(16).toUpperCase().padStart(2, "0"), value = (message.value & 0xff).toString(16).toUpperCase().padStart(2, "0");
        this.note(L(`内部 RAM (${at}) を ${value} にしました。`, `Set internal RAM (${at}) to ${value}.`));
        this.hub.current?.changed?.();
        void this.post({ type: "changed" });
        return;
      }
      case "bin": return message.save ? this.saveBin(client, message.address) : this.loadBin(client, message.address);
    }
  }

  // The tiles' names: PC is the register P; B and IH are the high bytes of BA and I.
  private async setRegister(client: EmulatorClient, name: string, text: string): Promise<void> {
    const inspector = new Inspector(client, this.hub.current?.program);
    const whole = name === "B" ? "BA" : name === "IH" ? "I" : undefined;
    if (!whole) { await inspector.set(name === "PC" ? "P" : name, text); return; }
    const bytes = /^\s*(?:\$|&H?|0x)?([0-9A-F]{1,2})h?\s*$/i.exec(text);
    if (!bytes) throw new Error(L(`${name} は 2 桁の 16 進で書きます。`, `Write ${name} as two hexadecimal digits.`));
    const r = await client.registers();
    await inspector.set(whole, String(parseInt(bytes[1], 16) << 8 | ((whole === "BA" ? r.BA : r.I) & 0xff)));
  }

  // A BIN: with the CE-140F SAVE M header (FF 00 06 01 10, length, address) it goes where the header says.
  private async loadBin(client: EmulatorClient, caret: number): Promise<void> {
    const picked = await vscode.window.showOpenDialog({ canSelectMany: false, filters: { "BIN": ["bin", "BIN"], [L("すべて", "All files")]: ["*"] }, title: L("メモリに書き込む BIN", "BIN to write into memory") });
    if (!picked?.length) return;
    const file = fs.readFileSync(picked[0].fsPath);
    let address: number, data: Uint8Array;
    if (file.length >= 16 && file[0] === 0xff && file[1] === 0 && file[2] === 6 && file[3] === 1 && file[4] === 0x10) {
      address = file[8] | file[9] << 8 | file[10] << 16;
      data = file.subarray(16);
    } else {
      const text = await vscode.window.showInputBox({ title: L("書き込む先頭アドレス（16進）", "Address to write at (hex)"), value: hex5(caret), validateInput: v => /^(&H|0x|\$)?[0-9A-F]{1,5}$/i.test(v.trim()) ? undefined : L("16進で入力してください", "Enter a hex address") });
      if (text === undefined) return;
      address = parseInt(text.trim().replace(/^(&H|0x|\$)/i, ""), 16);
      data = file;
    }
    await client.write(address, data);
    this.note(L(`${hex5(address)} へ ${data.length} バイト書き込みました。`, `Wrote ${data.length} bytes at ${hex5(address)}.`));
    void this.post({ type: "jump", address });
  }

  private async saveBin(client: EmulatorClient, caret: number): Promise<void> {
    const text = await vscode.window.showInputBox({ title: L("書き出す範囲（16進、開始-終了）", "Range to save (hex, start-end)"), value: `${hex5(caret)}-${hex5(Math.min(0xfffff, caret + 0xff))}`,
      validateInput: v => /^[0-9A-F]{1,5}\s*-\s*[0-9A-F]{1,5}$/i.test(v.trim()) ? undefined : L("例: B8000-B80FF", "For example B8000-B80FF") });
    if (text === undefined) return;
    const [start, end] = text.split("-").map(s => parseInt(s.trim(), 16));
    if (end < start) { this.note(L("終了が開始より前です。", "The end is before the start.")); return; }
    const target = await vscode.window.showSaveDialog({ filters: { "BIN": ["bin"] }, title: L("BIN の保存先", "Save the BIN as") });
    if (!target) return;
    fs.writeFileSync(target.fsPath, await client.read(start, end - start + 1));
    this.note(L(`${hex5(start)}〜${hex5(end)} を書き出しました。`, `Saved ${hex5(start)}-${hex5(end)}.`));
  }

  dispose(): void {
    if (DebugPanel.instance === this) DebugPanel.instance = undefined;
    this.disposables.forEach(d => d.dispose());
    this.panel.dispose();
  }
}
