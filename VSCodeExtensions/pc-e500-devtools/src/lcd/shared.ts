// What the editors of pictures (.lcd) and of sprites (.spr) share.
import { randomBytes } from "node:crypto";
import * as path from "node:path";
import * as vscode from "vscode";
import { L } from "../l10n";

const IMAGE_TYPES: Readonly<Record<string, string>> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", bmp: "image/bmp", webp: "image/webp" };

/** A message from an editor's page. */
export interface PageMessage {
  readonly type: string;
  readonly data?: string;
  readonly label?: string;
  readonly w?: number;
  readonly h?: number;
  readonly text?: string;
}

/** Every editor open: they share what was copied. */
const webviews = new Set<vscode.Webview>();
let clip: { type: "clip"; w: number; h: number; data: string } | undefined;

export function joinEditors(webview: vscode.Webview): vscode.Disposable {
  webviews.add(webview);
  return { dispose: () => { webviews.delete(webview); } };
}

export function newNonce(): string {
  return randomBytes(24).toString("hex");
}

export const readFile = async (uri: vscode.Uri): Promise<Uint8Array | undefined> => {
  try { return await vscode.workspace.fs.readFile(uri); } catch { return undefined; }
};

/** Does what both pages ask for; false for a message of their own. */
export async function commonMessage(m: PageMessage, uri: vscode.Uri, webview: vscode.Webview): Promise<boolean> {
  if (m.type === "undo" || m.type === "redo") await vscode.commands.executeCommand(m.type);
  else if (m.type === "other") await vscode.commands.executeCommand("workbench.action.reopenWithEditor");
  else if (m.type === "text" && m.text) await vscode.env.clipboard.writeText(m.text);
  else if (m.type === "clip" && m.data && m.w && m.h) {
    clip = { type: "clip", w: m.w, h: m.h, data: m.data };
    for (const w of webviews) if (w !== webview) void w.postMessage(clip);
  } else if (m.type === "png" && m.data) {
    const target = await vscode.window.showSaveDialog({ defaultUri: uri.with({ path: uri.path.replace(/\.[^./]*$/, "") + ".png" }), filters: { PNG: ["png"] } });
    if (target) await vscode.workspace.fs.writeFile(target, Buffer.from(m.data, "base64"));
  } else if (m.type === "import") await importImage(uri, webview);
  else return false;
  return true;
}

/** Sends what was copied in another editor. */
export function sendClip(webview: vscode.Webview): void {
  if (clip) void webview.postMessage(clip);
}

/** Sends the image the user picks to an editor, which places it. */
async function importImage(near: vscode.Uri, webview: vscode.Webview): Promise<void> {
  const picked = (await vscode.window.showOpenDialog({ defaultUri: vscode.Uri.joinPath(near, ".."), filters: { [L("画像", "Images")]: Object.keys(IMAGE_TYPES) }, openLabel: L("読み込む", "Import") }))?.[0];
  if (!picked) return;
  const bytes = await vscode.workspace.fs.readFile(picked);
  const type = IMAGE_TYPES[path.extname(picked.path).slice(1).toLowerCase()] ?? "image/png";
  void webview.postMessage({ type: "image", data: `data:${type};base64,${Buffer.from(bytes).toString("base64")}` });
}

/** Asks before a file that something else changed is written over. Throws when the user will not. */
export async function mayOverwrite(uri: vscode.Uri): Promise<void> {
  const overwrite = L("上書き", "Overwrite");
  const choice = await vscode.window.showWarningMessage(L(`${path.basename(uri.path)} は、開いた後にほかで書き換えられています。上書きしますか？`, `${path.basename(uri.path)} was changed by something else since it was opened. Overwrite it?`), { modal: true }, overwrite);
  if (choice !== overwrite) throw new vscode.CancellationError();
}
