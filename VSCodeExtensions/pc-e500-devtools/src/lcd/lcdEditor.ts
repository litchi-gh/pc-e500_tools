// Opens .lcd and .pixels files as the picture on the LCD, to look at and to draw, and
// links the file names of INCBIN to what they name.
import * as path from "node:path";
import * as vscode from "vscode";
import { AsmOptions, findFile } from "../asm/assembler";
import { fileNameAt } from "../asm/definition";
import { L } from "../l10n";
import { LcdFiles, LcdPicture } from "./lcdDocument";
import { encode, formatOf, HEIGHT, partnerPath, WIDTH } from "./lcdFile";
import { lcdPage } from "./lcdPage";
import { commonMessage, joinEditors, mayOverwrite, newNonce, PageMessage, readFile, sendClip } from "./shared";

class LcdDocument implements vscode.CustomDocument {
  readonly picture: LcdPicture;
  readonly panels = new Set<vscode.Webview>();
  readonly disposables: vscode.Disposable[] = [];
  /** Saving is writing the file: the watcher has nothing new to tell. */
  saving = false;

  constructor(readonly uri: vscode.Uri) { this.picture = new LcdPicture(uri.path); }

  dispose(): void { this.disposables.forEach(d => d.dispose()); }
}

export class LcdEditorProvider implements vscode.CustomEditorProvider<LcdDocument> {
  static readonly viewType = "pcE500.lcd";
  private readonly changed = new vscode.EventEmitter<vscode.CustomDocumentEditEvent<LcdDocument>>();
  readonly onDidChangeCustomDocument = this.changed.event;

  constructor(private readonly context: vscode.ExtensionContext) {}

  async openCustomDocument(uri: vscode.Uri, open: vscode.CustomDocumentOpenContext): Promise<LcdDocument> {
    const document = new LcdDocument(uri);
    document.picture.load(await vscode.workspace.fs.readFile(uri));
    if (open.backupId) {
      const backup = await readFile(vscode.Uri.parse(open.backupId));
      if (backup?.length === WIDTH * HEIGHT) document.picture.dots = Uint8Array.from(backup);
    }
    // Made again by a build: shown again, unless it is being edited (saving asks then).
    const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.joinPath(uri, ".."), path.basename(uri.path)));
    const reload = async (): Promise<void> => {
      if (document.saving) return;
      const bytes = await readFile(uri);
      if (document.saving || bytes === undefined || document.picture.isDisk(bytes) || document.picture.dirty) return;
      document.picture.load(bytes);
      this.show(document);
    };
    document.disposables.push(watcher, watcher.onDidChange(reload), watcher.onDidCreate(reload));
    return document;
  }

  resolveCustomEditor(document: LcdDocument, panel: vscode.WebviewPanel): void {
    const webview = panel.webview;
    const media = vscode.Uri.joinPath(this.context.extensionUri, "media");
    webview.options = { enableScripts: true, localResourceRoots: [media] };
    webview.html = lcdPage("lcd", name => webview.asWebviewUri(vscode.Uri.joinPath(media, name)).toString(), webview.cspSource, newNonce());
    document.panels.add(webview);
    const joined = joinEditors(webview);
    const messages = webview.onDidReceiveMessage(async (m: PageMessage) => {
      if (m.type === "ready") { this.show(document, webview); sendClip(webview); }
      else if (m.type === "edit" && m.data) this.edit(document, Buffer.from(m.data, "base64"), m.label ?? "", webview);
      else await commonMessage(m, document.uri, webview);
    });
    panel.onDidDispose(() => { document.panels.delete(webview); joined.dispose(); messages.dispose(); });
  }

  /** Shows the picture in an editor of the document, or in all of them. */
  private show(document: LcdDocument, only?: vscode.Webview, except?: vscode.Webview): void {
    const p = document.picture;
    const bytes = p.format === "lcd" ? 1024 : WIDTH * HEIGHT;
    const about = p.wrongSize !== undefined
      ? L(`LCD の画面ではありません（${p.wrongSize} バイト。.lcd は 1024、.pixels は 7680 バイト）。`, `Not an LCD picture (${p.wrongSize} bytes; .lcd has 1024, .pixels 7680).`)
      : p.format === "lcd" ? L(`240×32 ドット、表示 RAM の並び（${bytes} バイト）`, `240 x 32 dots, as in display RAM (${bytes} bytes)`)
        : L(`240×32 ドット、1 ドット 1 バイト（${bytes} バイト）`, `240 x 32 dots, a byte a dot (${bytes} bytes)`);
    const message = { type: "picture", dots: p.wrongSize === undefined ? Buffer.from(p.dots).toString("base64") : undefined, about, format: p.format };
    for (const w of only ? [only] : document.panels) if (w !== except) void w.postMessage(message);
  }

  private edit(document: LcdDocument, data: Uint8Array, label: string, from: vscode.Webview): void {
    const picture = document.picture;
    if (picture.wrongSize !== undefined || data.length !== picture.dots.length) return;
    const before = picture.dots, after = Uint8Array.from(data, d => (d ? 1 : 0));
    if (before.every((d, i) => d === after[i])) return;
    const set = (dots: Uint8Array): void => { picture.dots = Uint8Array.from(dots); this.show(document); };
    picture.dots = after;
    this.show(document, undefined, from);
    this.changed.fire({ document, label, undo: () => set(before), redo: () => set(after) });
  }

  async saveCustomDocument(document: LcdDocument): Promise<void> {
    const picture = document.picture;
    if (picture.wrongSize !== undefined) return;
    const now = await readFile(document.uri);
    if (now !== undefined && !picture.isDisk(now)) await mayOverwrite(document.uri);
    const at = (p: string): vscode.Uri => document.uri.with({ path: p });
    const files: LcdFiles = { read: p => readFile(at(p)), write: async (p, bytes) => vscode.workspace.fs.writeFile(at(p), bytes) };
    document.saving = true;
    try {
      const result = await picture.save(files);
      const other = path.basename(partnerPath(document.uri.path)?.path ?? "");
      if (result === "written") void vscode.window.setStatusBarMessage(L(`${other} も同じ絵にしました。`, `${other} has the same picture now.`), 5000);
      else if (result === "different") void vscode.window.showInformationMessage(L(`${other} は元の絵が違うので、書き換えませんでした。`, `${other} had another picture and was left alone.`));
    } finally {
      document.saving = false;
    }
  }

  async saveCustomDocumentAs(document: LcdDocument, destination: vscode.Uri): Promise<void> {
    const p = document.picture;
    const format = formatOf(destination.path);
    await vscode.workspace.fs.writeFile(destination, p.wrongSize !== undefined ? await vscode.workspace.fs.readFile(document.uri) : format === p.format ? p.bytes() : encode(format, p.dots));
  }

  async revertCustomDocument(document: LcdDocument): Promise<void> {
    document.picture.load(await vscode.workspace.fs.readFile(document.uri));
    this.show(document);
  }

  async backupCustomDocument(document: LcdDocument, context: vscode.CustomDocumentBackupContext): Promise<vscode.CustomDocumentBackup> {
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(context.destination, ".."));
    await vscode.workspace.fs.writeFile(context.destination, document.picture.dots);
    return { id: context.destination.toString(), delete: () => { void vscode.workspace.fs.delete(context.destination).then(undefined, () => undefined); } };
  }
}

/** Ctrl+click on the file name of an INCBIN opens the file, an .lcd as its picture. */
export class IncbinLinkProvider implements vscode.DocumentLinkProvider {
  constructor(private readonly options: (document: vscode.TextDocument) => AsmOptions) {}

  provideDocumentLinks(document: vscode.TextDocument): vscode.DocumentLink[] {
    const links: vscode.DocumentLink[] = [];
    if (document.uri.scheme !== "file") return links;
    const options = this.options(document);
    for (let line = 0; line < document.lineCount; line++) {
      const name = fileNameAt(document.lineAt(line).text, "INCBIN");
      const file = name && findFile(name.name, document.uri.fsPath, options);
      if (name && file) links.push(new vscode.DocumentLink(new vscode.Range(line, name.start, line, name.end), vscode.Uri.file(file)));
    }
    return links;
  }
}
