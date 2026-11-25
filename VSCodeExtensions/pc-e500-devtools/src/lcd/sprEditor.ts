// Opens .spr files in the dot editor, a frame at a time.
import * as path from "node:path";
import * as vscode from "vscode";
import { L } from "../l10n";
import { lcdPage } from "./lcdPage";
import { commonMessage, joinEditors, mayOverwrite, newNonce, PageMessage, readFile, sendClip } from "./shared";
import { decodeSpr, emptySprite, encodeSpr, isSprite, sameSprite, Sprite, withoutOff } from "./sprFile";

interface SentSprite { width: number; height: number; mask: boolean; frames: string[] }
interface SpriteMessage extends PageMessage { readonly sprite?: SentSprite }

const toMessage = (s: Sprite): SentSprite => ({ width: s.width, height: s.height, mask: s.mask, frames: s.frames.map(f => Buffer.from(f).toString("base64")) });
const fromMessage = (s: SentSprite): Sprite => ({ width: s.width, height: s.height, mask: s.mask, frames: s.frames.map(f => Uint8Array.from(Buffer.from(f, "base64"), d => Math.min(2, d))) });

class SprDocument implements vscode.CustomDocument {
  sprite: Sprite = emptySprite();
  /** The file's size when it is not a sprite; it cannot be edited then. */
  wrongSize: number | undefined;
  /** The file as read or written last, and the sprite in it. */
  disk: Uint8Array = new Uint8Array(0);
  saved: Sprite = this.sprite;
  readonly panels = new Set<vscode.Webview>();
  readonly disposables: vscode.Disposable[] = [];
  saving = false;

  constructor(readonly uri: vscode.Uri) {}

  load(bytes: Uint8Array): void {
    const sprite = decodeSpr(bytes);
    this.disk = Uint8Array.from(bytes);
    this.wrongSize = sprite ? undefined : bytes.length;
    if (sprite) this.sprite = this.saved = sprite;
  }

  get dirty(): boolean { return !sameSprite(this.sprite, this.saved); }
  isDisk(bytes: Uint8Array): boolean { return bytes.length === this.disk.length && bytes.every((b, i) => b === this.disk[i]); }
  dispose(): void { this.disposables.forEach(d => d.dispose()); }
}

export class SprEditorProvider implements vscode.CustomEditorProvider<SprDocument> {
  static readonly viewType = "pcE500.spr";
  private readonly changed = new vscode.EventEmitter<vscode.CustomDocumentEditEvent<SprDocument>>();
  readonly onDidChangeCustomDocument = this.changed.event;

  constructor(private readonly context: vscode.ExtensionContext) {}

  async openCustomDocument(uri: vscode.Uri, open: vscode.CustomDocumentOpenContext): Promise<SprDocument> {
    const document = new SprDocument(uri);
    document.load(await vscode.workspace.fs.readFile(uri));
    if (open.backupId) {
      const backup = await readFile(vscode.Uri.parse(open.backupId));
      try {
        const kept = fromMessage(JSON.parse(Buffer.from(backup ?? []).toString("utf8")) as SentSprite);
        if (isSprite(kept)) document.sprite = kept;
      } catch { /* the file as it is */ }
    }
    const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.joinPath(uri, ".."), path.basename(uri.path)));
    const reload = async (): Promise<void> => {
      if (document.saving) return;
      const bytes = await readFile(uri);
      if (document.saving || bytes === undefined || document.isDisk(bytes) || document.dirty) return;
      document.load(bytes);
      this.show(document);
    };
    document.disposables.push(watcher, watcher.onDidChange(reload), watcher.onDidCreate(reload));
    return document;
  }

  resolveCustomEditor(document: SprDocument, panel: vscode.WebviewPanel): void {
    const webview = panel.webview;
    const media = vscode.Uri.joinPath(this.context.extensionUri, "media");
    webview.options = { enableScripts: true, localResourceRoots: [media] };
    webview.html = lcdPage("spr", name => webview.asWebviewUri(vscode.Uri.joinPath(media, name)).toString(), webview.cspSource, newNonce());
    document.panels.add(webview);
    const joined = joinEditors(webview);
    const messages = webview.onDidReceiveMessage(async (m: SpriteMessage) => {
      if (m.type === "ready") { this.show(document, webview); sendClip(webview); }
      else if (m.type === "editSprite" && m.sprite) this.edit(document, m.sprite, m.label ?? "", webview);
      else await commonMessage(m, document.uri, webview);
    });
    panel.onDidDispose(() => { document.panels.delete(webview); joined.dispose(); messages.dispose(); });
  }

  private show(document: SprDocument, only?: vscode.Webview, except?: vscode.Webview): void {
    const s = document.sprite;
    const message = document.wrongSize !== undefined
      ? { type: "sprite", about: L(`キャラクタ（.spr）ではありません（${document.wrongSize} バイト）。`, `Not a sprite (.spr) (${document.wrongSize} bytes).`) }
      : { type: "sprite", about: path.basename(document.uri.path), sprite: toMessage(s) };
    for (const w of only ? [only] : document.panels) if (w !== except) void w.postMessage(message);
  }

  private edit(document: SprDocument, sent: SentSprite, label: string, from: vscode.Webview): void {
    const got = fromMessage(sent);
    if (document.wrongSize !== undefined || !isSprite(got)) return;
    // Without a mask the file has no dots that are off: they are clear, and the page shows it.
    const after = withoutOff(got);
    const before = document.sprite;
    if (sameSprite(before, after)) {
      if (!sameSprite(got, after)) this.show(document, from);
      return;
    }
    const set = (s: Sprite): void => { document.sprite = s; this.show(document); };
    document.sprite = after;
    this.show(document, undefined, sameSprite(got, after) ? from : undefined);
    this.changed.fire({ document, label, undo: () => set(before), redo: () => set(after) });
  }

  async saveCustomDocument(document: SprDocument): Promise<void> {
    if (document.wrongSize !== undefined) return;
    const now = await readFile(document.uri);
    if (now !== undefined && !document.isDisk(now)) await mayOverwrite(document.uri);
    const sprite = document.sprite, bytes = encodeSpr(sprite);
    document.saving = true;
    try {
      await vscode.workspace.fs.writeFile(document.uri, bytes);
      document.disk = bytes;
      document.saved = sprite;
    } finally {
      document.saving = false;
    }
  }

  async saveCustomDocumentAs(document: SprDocument, destination: vscode.Uri): Promise<void> {
    await vscode.workspace.fs.writeFile(destination, document.wrongSize !== undefined ? document.disk : encodeSpr(document.sprite));
  }

  async revertCustomDocument(document: SprDocument): Promise<void> {
    document.load(await vscode.workspace.fs.readFile(document.uri));
    this.show(document);
  }

  async backupCustomDocument(document: SprDocument, context: vscode.CustomDocumentBackupContext): Promise<vscode.CustomDocumentBackup> {
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(context.destination, ".."));
    await vscode.workspace.fs.writeFile(context.destination, Buffer.from(JSON.stringify(toMessage(document.sprite)), "utf8"));
    return { id: context.destination.toString(), delete: () => { void vscode.workspace.fs.delete(context.destination).then(undefined, () => undefined); } };
  }
}
