// "New program" and "Make BIN".
import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { AsmHost } from "../asm/assembler";
import { assemblerOptions, diskFolder, ownIncludeFolder } from "../emu/config";
import { hex5, Program } from "../emu/program";
import { L } from "../l10n";
import { encodeLcd, HEIGHT, WIDTH } from "../lcd/lcdFile";
import { emptySprite, encodeSpr } from "../lcd/sprFile";
import { basicLines, binName, isProgramName, loadMFile, loadMOrigin } from "./loadM";
import { templates } from "./templates";

async function exists(uri: vscode.Uri): Promise<boolean> {
  try { await vscode.workspace.fs.stat(uri); return true; } catch { return false; }
}

/** The folder a new program goes in: the one clicked in the Explorer, or one the user picks. */
async function newProgramFolder(resource: vscode.Uri | undefined): Promise<vscode.Uri | undefined> {
  if (resource?.scheme === "file") {
    const stat = await vscode.workspace.fs.stat(resource);
    return stat.type & vscode.FileType.Directory ? resource : vscode.Uri.joinPath(resource, "..");
  }
  const active = vscode.window.activeTextEditor?.document.uri;
  const start = vscode.workspace.workspaceFolders?.[0]?.uri ?? (active?.scheme === "file" ? vscode.Uri.joinPath(active, "..") : undefined);
  const picked = await vscode.window.showOpenDialog({
    canSelectFolders: true, canSelectFiles: false, defaultUri: start,
    title: L("作成先のフォルダ", "Folder for the new files"), openLabel: L("ここに作成", "Make It Here")
  });
  return picked?.[0];
}

export async function newProgram(resource?: vscode.Uri): Promise<void> {
  const kind = await vscode.window.showQuickPick(templates().map(t => ({ label: `$(${t.icon}) ${t.label}`, detail: t.detail, template: t })), {
    title: L("新しいプログラム: テンプレート", "New program: template")
  });
  if (!kind) return;
  const folder = await newProgramFolder(resource);
  if (!folder) return;
  const name = await vscode.window.showInputBox({
    title: L("新しいプログラム: 名前", "New program: name"),
    prompt: L("英字で始まる 8 文字までの英数字と _（X: のファイル名にも使います）", "Up to 8 letters, digits and _, a letter first (also used for the file on X:)"),
    value: "game",
    validateInput: async value => {
      if (!isProgramName(value)) return L("英字で始まる 8 文字までの英数字と _ にしてください。", "Use up to 8 letters, digits and _, a letter first.");
      for (const f of kind.template.files(value)) if (await exists(vscode.Uri.joinPath(folder, f.name))) return L(`${f.name} は既に存在します。`, `${f.name} already exists.`);
      return undefined;
    }
  });
  if (!name) return;
  const files = kind.template.files(name);
  try {
    for (const f of files) await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(folder, f.name), typeof f.content === "string" ? Buffer.from(f.content, "utf8") : f.content);
    const source = vscode.Uri.joinPath(folder, files[0].name);
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(source));
  } catch (error) {
    void vscode.window.showErrorMessage(L(`プログラムを作成できませんでした: ${error instanceof Error ? error.message : String(error)}`, `Could not make the program: ${error instanceof Error ? error.message : String(error)}`));
    return;
  }
  const run = L("実行", "Run"), where = vscode.Uri.joinPath(folder, files[0].name);
  const choice = await vscode.window.showInformationMessage(L(`${files.map(f => f.name).join("、")} を作成しました。F5 でデバッグできます。`, `Made ${files.map(f => f.name).join(", ")}. F5 debugs it.`), run);
  if (choice === run) await vscode.commands.executeCommand("pcE500.runFile", where);
}

/** Makes an empty sprite or picture, and opens it in the dot editor. */
export async function newPicture(resource?: vscode.Uri): Promise<void> {
  const sizes: Array<[number, number]> = [[8, 8], [12, 8], [16, 8], [16, 16], [24, 16], [24, 24], [32, 32]];
  const kind = await vscode.window.showQuickPick([
    ...sizes.map(([w, h]) => ({ label: `$(person) ${L("キャラクタ", "Sprite")} ${w}×${h}`, description: ".spr", extension: "spr", bytes: encodeSpr(emptySprite(w, h)) })),
    { label: `$(device-mobile) ${L("画面の絵", "Screen picture")} 240×32`, description: ".lcd", extension: "lcd", bytes: encodeLcd(new Uint8Array(WIDTH * HEIGHT)) }
  ], { title: L("新しいドット絵（大きさは後で変えられます）", "New dot picture (a sprite's size can be changed later)") });
  if (!kind) return;
  const folder = await newProgramFolder(resource);
  if (!folder) return;
  const name = await vscode.window.showInputBox({
    title: L("新しいドット絵: 名前", "New dot picture: name"), value: kind.extension === "spr" ? "player" : "title",
    validateInput: async value => {
      if (!/^[A-Za-z0-9_-]+$/.test(value)) return L("英数字と _ - にしてください。", "Use letters, digits, _ and -.");
      return await exists(vscode.Uri.joinPath(folder, `${value}.${kind.extension}`)) ? L(`${value}.${kind.extension} は既に存在します。`, `${value}.${kind.extension} already exists.`) : undefined;
    }
  });
  if (!name) return;
  const uri = vscode.Uri.joinPath(folder, `${name}.${kind.extension}`);
  await vscode.workspace.fs.writeFile(uri, kind.bytes);
  await vscode.commands.executeCommand("vscode.open", uri);
}

/** Copies the extension's include files next to a source, for e500asm and to change them. */
export async function copyIncludes(resource?: vscode.Uri): Promise<void> {
  const from = ownIncludeFolder();
  const names = (await fs.promises.readdir(from)).filter(f => f.endsWith(".inc")).sort();
  const text = new Map<string, string>();
  for (const n of names) text.set(n, (await fs.promises.readFile(path.join(from, n), "utf8")).split(/\r?\n/, 1)[0].replace(/^;\s*[\w.]+:\s*/, ""));
  const picked = await vscode.window.showQuickPick(names.map(n => ({ label: n, description: text.get(n), picked: false })), {
    canPickMany: true, title: L("コピーする INCLUDE ファイル（コピーしなくても INCLUDE できます）", "Include files to copy (they can be included without copying)")
  });
  if (!picked || picked.length === 0) return;
  const folder = await newProgramFolder(resource ?? (vscode.window.activeTextEditor?.document.uri.scheme === "file" ? vscode.window.activeTextEditor.document.uri : undefined));
  if (!folder) return;
  const done: string[] = [], kept: string[] = [];
  for (const { label } of picked) {
    const target = vscode.Uri.joinPath(folder, label);
    if (await exists(target)) { kept.push(label); continue; }
    await vscode.workspace.fs.writeFile(target, await fs.promises.readFile(path.join(from, label)));
    done.push(label);
  }
  if (done.length > 0) void vscode.window.showInformationMessage(L(`コピーしました: ${done.join("、")}`, `Copied: ${done.join(", ")}`));
  if (kept.length > 0) void vscode.window.showWarningMessage(L(`既に存在するためコピーしませんでした: ${kept.join("、")}`, `Not copied, as they are there already: ${kept.join(", ")}`));
}

/** Writes the LOAD M file of a source next to it, and says what to type. */
export async function makeBin(resource: vscode.Uri | undefined, host: AsmHost, output: vscode.OutputChannel): Promise<void> {
  const uri = resource ?? vscode.window.activeTextEditor?.document.uri;
  if (!uri || uri.scheme !== "file") {
    void vscode.window.showInformationMessage(L("保存した PC-E500 アセンブリのファイルを開いてから実行してください。", "Open a saved PC-E500 assembly file first."));
    return;
  }
  const document = await vscode.workspace.openTextDocument(uri);
  if (document.isDirty) await document.save();
  const program = Program.build(uri.fsPath, document.getText(), { ...assemblerOptions(uri), host });
  if (program.errors.length > 0) {
    const show = L("問題を開く", "Open Problems");
    if (await vscode.window.showErrorMessage(L(`アセンブルに失敗しました。${program.errors[0]}`, `Assembly failed. ${program.errors[0]}`), show)) {
      await vscode.window.showTextDocument(document);
      await vscode.commands.executeCommand("workbench.actions.view.problems");
    }
    return;
  }
  if (program.binary.length === 0) {
    void vscode.window.showErrorMessage(L("プログラムが空です（出力されるバイトがありません）。", "The program is empty (it puts out no bytes)."));
    return;
  }
  const name = binName(uri.fsPath);
  const target = path.join(path.dirname(uri.fsPath), name);
  try {
    const bytes = loadMFile(program.origin, program.binary);
    if (!await mayReplace(target, program.origin)) return;
    await fs.promises.writeFile(target, bytes);
    const internalKB = vscode.workspace.getConfiguration("pcE500", uri).get<number>("ramKB", 32);
    const lines = basicLines(program, name, internalKB);
    const size = program.areaSize(internalKB);
    output.clear();
    output.appendLine(target);
    output.appendLine(L(`${bytes.length} バイト（ヘッダー 16 ＋ 本体 ${program.binary.length}）、${hex5(program.origin)}〜${hex5(program.end - 1)}、開始 ${hex5(program.entry())}`,
      `${bytes.length} bytes (16 of header, ${program.binary.length} of program), ${hex5(program.origin)}-${hex5(program.end - 1)}, starts at ${hex5(program.entry())}`));
    output.appendLine("");
    if (lines.reserve) {
      output.appendLine(L(`機械語エリアの確保（${size!.toString(16).toUpperCase()}h バイト。最初に 1 回だけ。メインメニューに戻るので BASIC に入り直す）`, `Reserve the machine-code area (${size!.toString(16).toUpperCase()}h bytes, once; it goes to the main menu, so enter BASIC again)`));
      output.appendLine(`  ${lines.reserve}`);
    } else {
      output.appendLine(L("内蔵 RAM の機械語エリア（BFBFF まで）に収まらないアドレスなので、確保の行はありません。", "It does not lie in the machine-code area of internal RAM (up to BFBFF), so there is no line to reserve it."));
    }
    output.appendLine(L("読み込みと実行（RUN モードで）", "Load and run (in RUN mode)"));
    output.appendLine(`  ${lines.load}`);
    output.appendLine(`  ${lines.call}`);
    output.show(true);
  } catch (error) {
    void vscode.window.showErrorMessage(L(`${name} を書き込めませんでした: ${error instanceof Error ? error.message : String(error)}`, `Could not write ${name}: ${error instanceof Error ? error.message : String(error)}`));
    return;
  }
  const toDisk = L("X: フォルダにコピー", "Copy to the X: Folder"), reveal = L("エクスプローラーで表示", "Show in Explorer");
  const choice = await vscode.window.showInformationMessage(L(`${name} を作成しました。`, `Made ${name}.`), toDisk, reveal);
  if (choice === reveal) await vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(target));
  else if (choice === toDisk) await copyToDisk(target, name, program.origin, uri);
}

/** Whether a file may be written over: one of ours for the same place is, others are asked about. */
async function mayReplace(target: string, origin: number): Promise<boolean> {
  let old: Buffer;
  try { old = await fs.promises.readFile(target); } catch { return true; }
  if (loadMOrigin(old) === origin) return true;
  const replace = L("上書き", "Replace");
  return await vscode.window.showWarningMessage(L(`${target} は、別の形式か別のアドレスのファイルです。上書きしますか？`, `${target} is in another format or for another address. Replace it?`), { modal: true }, replace) === replace;
}

async function copyToDisk(file: string, name: string, origin: number, scope: vscode.Uri): Promise<void> {
  let folder = diskFolder(scope);
  if (!folder) {
    const picked = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, title: L("CE-140F の X: フォルダ（drive-x）", "The CE-140F's X: folder (drive-x)"), openLabel: L("選ぶ", "Select") });
    if (!picked?.[0]) return;
    folder = picked[0].fsPath;
    await vscode.workspace.getConfiguration("pcE500").update("diskFolder", folder, vscode.ConfigurationTarget.Global);
  }
  const target = path.join(folder, name);
  try {
    if (!await mayReplace(target, origin)) return;
    await fs.promises.copyFile(file, target);
    void vscode.window.showInformationMessage(L(`コピーしました: ${target}`, `Copied: ${target}`));
  } catch (error) {
    void vscode.window.showErrorMessage(L(`コピーできませんでした: ${error instanceof Error ? error.message : String(error)}`, `Could not copy: ${error instanceof Error ? error.message : String(error)}`));
  }
}
