import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { AsmHost, lintAsm } from "./asm/assembler";
import { LintIssue } from "./core";
import { getDialect } from "./dialects";
import { lint } from "./linter/parser";

const basicSource = "pocket-basic";
const asmSource = "pocket-asm";

const fileHost: AsmHost = {
  readText(filePath: string): string | undefined {
    try {
      return fs.readFileSync(filePath, "utf8");
    } catch {
      return undefined;
    }
  },
  readBinary(filePath: string): Uint8Array | undefined {
    try {
      return fs.readFileSync(filePath);
    } catch {
      return undefined;
    }
  }
};

function toDiagnostic(result: LintIssue, source: string): vscode.Diagnostic {
  const severity = result.severity === "error"
    ? vscode.DiagnosticSeverity.Error
    : result.severity === "warning"
      ? vscode.DiagnosticSeverity.Warning
      : vscode.DiagnosticSeverity.Information;
  const diagnostic = new vscode.Diagnostic(
    new vscode.Range(result.range.line, result.range.start, result.range.line, result.range.end),
    result.message,
    severity
  );
  diagnostic.code = result.code;
  diagnostic.source = source;
  return diagnostic;
}

function workspaceRelative(directory: string, resource: vscode.Uri): string {
  if (path.isAbsolute(directory)) return directory;
  const folder = vscode.workspace.getWorkspaceFolder(resource) ?? vscode.workspace.workspaceFolders?.[0];
  return folder ? path.join(folder.uri.fsPath, directory) : directory;
}

function lintAsmDocument(document: vscode.TextDocument): LintIssue[] {
  const config = vscode.workspace.getConfiguration("pocketAsm", document.uri);
  const isFile = document.uri.scheme === "file";
  return lintAsm(document.getText(), {
    filePath: isFile ? document.uri.fsPath : undefined,
    host: isFile ? fileHost : undefined,
    includeDirectories: config.get<string[]>("includeDirectories", []).map(dir => workspaceRelative(dir, document.uri)),
    defines: config.get<Record<string, number>>("defines", {})
  });
}

async function openAs(languageId: string, displayName: string, resource: vscode.Uri | undefined, refresh: (document: vscode.TextDocument) => void): Promise<void> {
  const uri = resource ?? vscode.window.activeTextEditor?.document.uri;
  if (!uri) {
    void vscode.window.showInformationMessage(`${displayName} として開くファイルを選択してください。`);
    return;
  }
  try {
    const document = await vscode.workspace.openTextDocument(uri);
    const target = document.languageId === languageId ? document : await vscode.languages.setTextDocumentLanguage(document, languageId);
    await vscode.window.showTextDocument(target);
    refresh(target);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    void vscode.window.showErrorMessage(`ファイルを ${displayName} として開けませんでした: ${message}`);
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const basicDiagnostics = vscode.languages.createDiagnosticCollection(basicSource);
  const asmDiagnostics = vscode.languages.createDiagnosticCollection(asmSource);
  const output = vscode.window.createOutputChannel("Pocket ASM");
  context.subscriptions.push(basicDiagnostics, asmDiagnostics, output);

  const refresh = (document: vscode.TextDocument): void => {
    if (document.languageId === "pocket-basic") {
      const config = vscode.workspace.getConfiguration("pocketBasic", document.uri);
      const dialect = getDialect(config.get<string>("dialect", "pc-e500"));
      const results = lint(document.getText(), dialect, {
        requireLineNumbers: config.get<boolean>("requireLineNumbers", true),
        checkMissingTargets: config.get<boolean>("checkMissingTargets", true)
      });
      basicDiagnostics.set(document.uri, results.map(result => toDiagnostic(result, basicSource)));
    } else if (document.languageId === "pocket-asm") {
      asmDiagnostics.set(document.uri, lintAsmDocument(document).map(result => toDiagnostic(result, asmSource)));
    }
  };

  const refreshAsmDocuments = (): void => {
    vscode.workspace.textDocuments.filter(document => document.languageId === "pocket-asm").forEach(refresh);
  };

  const assemble = async (): Promise<void> => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== "pocket-asm") {
      void vscode.window.showInformationMessage("PC-E500 アセンブリのファイルを開いてから実行してください。");
      return;
    }
    const document = editor.document;
    if (document.uri.scheme !== "file") {
      void vscode.window.showInformationMessage("アセンブルするにはファイルを保存してください。");
      return;
    }
    const config = vscode.workspace.getConfiguration("pocketAsm", document.uri);
    const assembler = config.get<string>("assemblerPath", "").trim();
    if (!assembler) {
      const choice = await vscode.window.showWarningMessage("設定 pocketAsm.assemblerPath に e500asm.exe のパスを指定してください。", "設定を開く");
      if (choice) void vscode.commands.executeCommand("workbench.action.openSettings", "pocketAsm.assemblerPath");
      return;
    }
    if (document.isDirty) await document.save();
    const source = document.uri.fsPath;
    const args = [source];
    for (const dir of config.get<string[]>("includeDirectories", [])) args.push("-I", workspaceRelative(dir, document.uri));
    for (const [name, value] of Object.entries(config.get<Record<string, number>>("defines", {}))) args.push("-D", `${name}=${value}`);
    const command = workspaceRelative(assembler, document.uri);
    output.clear();
    output.show(true);
    output.appendLine(`> ${command} ${args.join(" ")}`);
    const isCmd = /\.(?:cmd|bat)$/i.test(command);
    execFile(isCmd ? "cmd.exe" : command, isCmd ? ["/c", command, ...args] : args, { cwd: path.dirname(source), windowsHide: true }, (error, stdout, stderr) => {
      if (stdout) output.append(stdout);
      if (stderr) output.append(stderr);
      if (error && !stdout && !stderr) output.appendLine(error.message);
      if (error) {
        void vscode.window.showErrorMessage("アセンブルに失敗しました。出力パネル「Pocket ASM」を確認してください。");
      } else {
        void vscode.window.showInformationMessage(`アセンブルしました: ${path.basename(source, path.extname(source))}.bin`);
      }
    });
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("pocketBasic.openAsPocketBasic", (resource?: vscode.Uri) => openAs("pocket-basic", "Pocket BASIC", resource, refresh)),
    vscode.commands.registerCommand("pocketAsm.openAsPocketAsm", (resource?: vscode.Uri) => openAs("pocket-asm", "PC-E500 アセンブリ", resource, refresh)),
    vscode.commands.registerCommand("pocketAsm.assemble", assemble),
    vscode.workspace.onDidOpenTextDocument(refresh),
    vscode.workspace.onDidChangeTextDocument(event => refresh(event.document)),
    // INCLUDE / INCBIN contents are read from disk, so re-lint the open ASM files whenever a file is saved.
    vscode.workspace.onDidSaveTextDocument(refreshAsmDocuments),
    vscode.workspace.onDidCloseTextDocument(document => {
      basicDiagnostics.delete(document.uri);
      asmDiagnostics.delete(document.uri);
    }),
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration("pocketBasic") || event.affectsConfiguration("pocketAsm")) {
        vscode.workspace.textDocuments.forEach(refresh);
      }
    })
  );
  vscode.workspace.textDocuments.forEach(refresh);
}

export function deactivate(): void {}
