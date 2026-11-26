import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { AsmHost, lintAsm } from "./asm/assembler";
import { assemblerInvocation, Invocation } from "./asm/invocation";
import { LintIssue } from "./core";
import { pcE500Dialect } from "./dialects/pcE500";
import { lint } from "./linter/parser";
import { L, setLanguage } from "./l10n";
import { E500ConfigurationProvider, E500DebugAdapter } from "./debug/adapter";
import { BasicDebugAdapter, isBasicProgram } from "./debug/basicAdapter";
import { AsmHoverProvider } from "./asmHover";
import { BasicCompletionProvider, BasicHoverProvider } from "./basic/providers";
import { AsmCompletionProvider } from "./completionProvider";
import { IncbinLinkProvider, LcdEditorProvider } from "./lcd/lcdEditor";
import { SprEditorProvider } from "./lcd/sprEditor";
import { AsmDefinitionProvider, AsmNames } from "./definitionProvider";
import { assemblerFile, assemblerOptions, ensureSetup, machineConfig, setIncludeFolder, showSetupError } from "./emu/config";
import { MachineHub } from "./emu/hub";
import { DebugPanel } from "./emu/debugPanel";
import { EmulatorPanel } from "./emu/panel";
import { startMachine } from "./emu/prepare";
import { registerTests } from "./emu/testController";
import { copyIncludes, makeBin, newPicture, newProgram, placeSkill } from "./project/commands";
import { migrateSettings } from "./setup/migrate";
import { SetupPanel } from "./setup/panel";

const basicSource = "pc-e500-basic";
const asmSource = "pc-e500-asm";

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

function lintAsmDocument(document: vscode.TextDocument): LintIssue[] {
  const isFile = document.uri.scheme === "file";
  return lintAsm(document.getText(), {
    filePath: isFile ? document.uri.fsPath : undefined,
    host: isFile ? fileHost : undefined,
    ...assemblerOptions(document.uri)
  });
}

async function openAs(languageId: string, displayName: string, resource: vscode.Uri | undefined, refresh: (document: vscode.TextDocument) => void): Promise<void> {
  const uri = resource ?? vscode.window.activeTextEditor?.document.uri;
  if (!uri) {
    void vscode.window.showInformationMessage(L(`${displayName} として開くファイルを選択してください。`, `Select a file to open as ${displayName}.`));
    return;
  }
  try {
    const document = await vscode.workspace.openTextDocument(uri);
    const target = document.languageId === languageId ? document : await vscode.languages.setTextDocumentLanguage(document, languageId);
    await vscode.window.showTextDocument(target);
    refresh(target);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    void vscode.window.showErrorMessage(L(`ファイルを ${displayName} として開けませんでした: ${message}`, `Could not open the file as ${displayName}: ${message}`));
  }
}

export function activate(context: vscode.ExtensionContext): void {
  setLanguage(vscode.env.language);
  setIncludeFolder(path.join(context.extensionPath, "inc"));
  const basicDiagnostics = vscode.languages.createDiagnosticCollection(basicSource);
  const asmDiagnostics = vscode.languages.createDiagnosticCollection(asmSource);
  const output = vscode.window.createOutputChannel("PC-E500");
  context.subscriptions.push(basicDiagnostics, asmDiagnostics, output);

  const refresh = (document: vscode.TextDocument): void => {
    if (document.languageId === "pc-e500-basic") {
      const config = vscode.workspace.getConfiguration("pcE500.basic", document.uri);
      const results = lint(document.getText(), pcE500Dialect, {
        requireLineNumbers: config.get<boolean>("requireLineNumbers", true),
        checkMissingTargets: config.get<boolean>("checkMissingTargets", true)
      });
      basicDiagnostics.set(document.uri, results.map(result => toDiagnostic(result, basicSource)));
    } else if (document.languageId === "pc-e500-asm") {
      asmDiagnostics.set(document.uri, lintAsmDocument(document).map(result => toDiagnostic(result, asmSource)));
    }
  };

  const refreshAsmDocuments = (): void => {
    vscode.workspace.textDocuments.filter(document => document.languageId === "pc-e500-asm").forEach(refresh);
  };

  const assemble = async (): Promise<void> => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== "pc-e500-asm") {
      void vscode.window.showInformationMessage(L("PC-E500 アセンブリのファイルを開いてから実行してください。", "Open a PC-E500 assembly file first."));
      return;
    }
    const document = editor.document;
    if (document.uri.scheme !== "file") {
      void vscode.window.showInformationMessage(L("アセンブルするにはファイルを保存してください。", "Save the file to assemble it."));
      return;
    }
    const config = vscode.workspace.getConfiguration("pcE500.asm", document.uri);
    const command = assemblerFile(document.uri);
    if (!command) {
      const choice = await vscode.window.showWarningMessage(L("e500asm が見つかりません（設定にも PATH にもありません）。", "e500asm was not found (neither in the settings nor on PATH)."), L("環境を確認", "Check the Setup"));
      if (choice) void vscode.commands.executeCommand("pcE500.checkSetup");
      return;
    }
    if (document.isDirty) await document.save();
    const source = document.uri.fsPath;
    const args = [source];
    for (const dir of assemblerOptions(document.uri).includeDirectories) args.push("-I", dir);
    for (const [name, value] of Object.entries(config.get<Record<string, number>>("defines", {}))) if (/^[A-Za-z_.][\w.]*$/.test(name) && Number.isFinite(value)) args.push("-D", `${name}=${value}`);
    output.clear();
    output.show(true);
    output.appendLine(`> ${command} ${args.join(" ")}`);
    let invocation: Invocation;
    try {
      invocation = assemblerInvocation(command, args);
    } catch (error) {
      void vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
      return;
    }
    execFile(invocation.file, [...invocation.args], { cwd: path.dirname(source), windowsHide: true, windowsVerbatimArguments: invocation.verbatim }, (error, stdout, stderr) => {
      if (stdout) output.append(stdout);
      if (stderr) output.append(stderr);
      if (error && !stdout && !stderr) output.appendLine(error.message);
      if (error) {
        void vscode.window.showErrorMessage(L("アセンブルに失敗しました。出力パネル「PC-E500」を確認してください。", "Assembly failed. See the \"PC-E500\" output panel."));
      } else {
        void vscode.window.showInformationMessage(L(`アセンブルしました: ${path.basename(source, path.extname(source))}.bin`, `Assembled: ${path.basename(source, path.extname(source))}.bin`));
      }
    });
  };

  const names = new AsmNames(fileHost, resource => ({ includeDirectories: assemblerOptions(resource).includeDirectories }));
  context.subscriptions.push(
    vscode.commands.registerCommand("pcE500.openAsBasic", (resource?: vscode.Uri) => openAs("pc-e500-basic", "PC-E500 BASIC", resource, refresh)),
    vscode.commands.registerCommand("pcE500.openAsAsm", (resource?: vscode.Uri) => openAs("pc-e500-asm", L("PC-E500 アセンブリ", "PC-E500 assembly"), resource, refresh)),
    vscode.commands.registerCommand("pcE500.assemble", assemble),
    vscode.commands.registerCommand("pcE500.makeBin", (resource?: vscode.Uri) => makeBin(resource, fileHost, output)),
    vscode.commands.registerCommand("pcE500.checkSetup", () => SetupPanel.show(context)),
    vscode.commands.registerCommand("pcE500.newPicture", (resource?: vscode.Uri) => newPicture(resource)),
    vscode.commands.registerCommand("pcE500.copyIncludes", (resource?: vscode.Uri) => copyIncludes(resource)),
    vscode.commands.registerCommand("pcE500.placeSkill", (resource?: vscode.Uri) => placeSkill(context.extensionPath, resource)),
    vscode.commands.registerCommand("pcE500.newProgram", (resource?: vscode.Uri) => newProgram(resource)),
    vscode.languages.registerDefinitionProvider("pc-e500-asm", new AsmDefinitionProvider(names)),
    vscode.languages.registerDocumentLinkProvider("pc-e500-asm", new IncbinLinkProvider(document => names.options(document))),
    vscode.window.registerCustomEditorProvider(LcdEditorProvider.viewType, new LcdEditorProvider(context), { webviewOptions: { retainContextWhenHidden: true }, supportsMultipleEditorsPerDocument: true }),
    vscode.window.registerCustomEditorProvider(SprEditorProvider.viewType, new SprEditorProvider(context), { webviewOptions: { retainContextWhenHidden: true }, supportsMultipleEditorsPerDocument: true }),
    vscode.languages.registerCompletionItemProvider("pc-e500-asm", new AsmCompletionProvider(names), ...AsmCompletionProvider.triggers),
    vscode.languages.registerHoverProvider("pc-e500-asm", new AsmHoverProvider(names)),
    vscode.languages.registerCompletionItemProvider("pc-e500-basic", new BasicCompletionProvider(), ...BasicCompletionProvider.triggers),
    vscode.languages.registerHoverProvider("pc-e500-basic", new BasicHoverProvider()),
    vscode.languages.registerEvaluatableExpressionProvider("pc-e500-basic", {
      // P(1) and D#, and not only P and D.
      provideEvaluatableExpression: (document, position) => {
        const range = document.getWordRangeAtPosition(position, /[A-Za-z][A-Za-z0-9]*[#$]?(?:\s*\([0-9, ]+\))?/);
        return range && new vscode.EvaluatableExpression(range);
      }
    }),
    vscode.workspace.onDidOpenTextDocument(refresh),
    vscode.workspace.onDidChangeTextDocument(event => refresh(event.document)),
    // INCLUDE / INCBIN contents are read from disk, so re-lint the open ASM files whenever a file is saved.
    vscode.workspace.onDidSaveTextDocument(refreshAsmDocuments),
    vscode.workspace.onDidCloseTextDocument(document => {
      basicDiagnostics.delete(document.uri);
      asmDiagnostics.delete(document.uri);
    }),
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration("pcE500.basic") || event.affectsConfiguration("pcE500.asm")) {
        vscode.workspace.textDocuments.forEach(refresh);
      }
    })
  );
  vscode.workspace.textDocuments.forEach(refresh);
  registerEmulator(context);
  // The command e500 in VS Code's terminal.
  const bin = path.join(context.extensionPath, "bin"), variables = context.environmentVariableCollection;
  variables.clear();
  variables.description = L("コマンド e500 を使えるようにします。", "Makes the command e500 available.");
  variables.append("PATH", path.delimiter + bin);
  if (process.platform !== "win32") { try { fs.chmodSync(path.join(bin, "e500"), 0o755); } catch { /* not ours to change */ } }
  void migrateSettings(context);
  context.subscriptions.push(vscode.workspace.onDidGrantWorkspaceTrust(() => void migrateSettings(context)));
}

// ---- The emulator: panel, debugger, tests ----

function registerEmulator(context: vscode.ExtensionContext): void {
  const hub = new MachineHub();
  const log = vscode.window.createOutputChannel(L("PC-E500 エミュレータ", "PC-E500 Emulator"));
  context.subscriptions.push(hub, log);

  // A machine of its own for the panel (when no debug session has one): BASIC's prompt, running.
  const startFree = async (): Promise<void> => {
    if (hub.current?.client.alive) return;
    const scope = vscode.window.activeTextEditor?.document.uri;
    const client = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: L("PC-E500 を起動しています…", "Starting the PC-E500…") }, () =>
      startMachine(machineConfig(context.extensionPath, scope), text => log.appendLine(text)));
    client.on("exit", () => hub.detach(client));
    hub.attach({ client, label: L("エミュレータ", "Emulator"), debugging: false });
    if (hub.current?.client !== client) return;
    await client.continue(vscode.workspace.getConfiguration("pcE500").get<number>("speed", 1));
  };
  const showPanel = (focus = false): void => { EmulatorPanel.show(context, hub, startFree, focus); };

  context.subscriptions.push(
    vscode.commands.registerCommand("pcE500.openEmulator", async () => {
      showPanel(true);
      for (;;) {
        try { await startFree(); return; } catch (error) { if (!await showSetupError(error)) return; }
      }
    }),
    vscode.commands.registerCommand("pcE500.openDebugger", () => DebugPanel.show(context, hub)),
    vscode.commands.registerCommand("pcE500.debugFile", (resource?: vscode.Uri) => launchFile(resource, false)),
    vscode.commands.registerCommand("pcE500.runFile", (resource?: vscode.Uri) => launchFile(resource, true)),
    vscode.debug.registerDebugConfigurationProvider("pc-e500", new E500ConfigurationProvider((scope, rom) => ensureSetup(context.extensionPath, scope, { rom }))),
    vscode.debug.registerDebugAdapterDescriptorFactory("pc-e500", {
      createDebugAdapterDescriptor: session => new vscode.DebugAdapterInlineImplementation(isBasicProgram(session.configuration.program)
        ? new BasicDebugAdapter(hub, context.extensionPath, () => showPanel(false))
        : new E500DebugAdapter(session, hub, context.extensionPath, () => showPanel(false)))
    })
  );
  registerTests(context);
}

async function launchFile(resource: vscode.Uri | undefined, noDebug: boolean): Promise<void> {
  const uri = resource ?? vscode.window.activeTextEditor?.document.uri;
  if (!uri || uri.scheme !== "file") {
    void vscode.window.showInformationMessage(L("PC-E500 のアセンブリか BASIC のファイルを開いてから実行してください。", "Open a PC-E500 assembly or BASIC file first."));
    return;
  }
  await vscode.debug.startDebugging(vscode.workspace.getWorkspaceFolder(uri), {
    type: "pc-e500", request: "launch", name: `PC-E500: ${path.basename(uri.fsPath)}`, program: uri.fsPath, mode: "basic", stopOnEntry: false
  }, { noDebug });
}

export function deactivate(): void {}
