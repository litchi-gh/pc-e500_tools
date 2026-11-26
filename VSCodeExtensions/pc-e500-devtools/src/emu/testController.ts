// Test Explorer: *.e500test.json files, each test a routine call (or a BASIC line) checked in the emulator.
import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { AsmHost } from "../asm/assembler";
import { assemblerOptions, machineConfig, showSetupError } from "./config";
import { startMachine } from "./prepare";
import { Program } from "./program";
import { parseTestFile, runTests, TestFile, testLine, TestTarget, testTarget } from "./testfile";
import { L } from "../l10n";

const PATTERN = "**/*.e500test.json";

const fileHost: AsmHost = {
  readText: f => { try { return fs.readFileSync(f, "utf8"); } catch { return undefined; } },
  readBinary: f => { try { return fs.readFileSync(f); } catch { return undefined; } }
};

export function registerTests(context: vscode.ExtensionContext): void {
  const controller = vscode.tests.createTestController("pcE500.tests", "PC-E500");
  context.subscriptions.push(controller);

  const read = async (uri: vscode.Uri): Promise<{ text: string; spec?: TestFile; error?: string }> => {
    const text = new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
    try { return { text, spec: parseTestFile(text) }; } catch (error) { return { text, error: error instanceof Error ? error.message : String(error) }; }
  };

  const refreshFile = async (uri: vscode.Uri): Promise<vscode.TestItem | undefined> => {
    const id = uri.toString();
    let file = controller.items.get(id);
    if (!file) {
      file = controller.createTestItem(id, path.basename(uri.fsPath), uri);
      controller.items.add(file);
    }
    const { text, spec, error } = await read(uri);
    file.error = error;
    const children: vscode.TestItem[] = [];
    for (const test of spec?.tests ?? []) {
      const item = controller.createTestItem(`${id}#${test.name}`, test.name, uri);
      const line = testLine(text, test.name);
      item.range = new vscode.Range(line, 0, line, 0);
      item.description = test.basic !== undefined ? "BASIC" : String(test.call ?? "");
      children.push(item);
    }
    file.children.replace(children);
    return file;
  };

  const discover = async (): Promise<void> => {
    for (const uri of await vscode.workspace.findFiles(PATTERN, "**/node_modules/**")) await refreshFile(uri);
  };
  controller.resolveHandler = async item => { if (!item) await discover(); else if (item.uri) await refreshFile(item.uri); };
  controller.refreshHandler = async () => { controller.items.replace([]); await discover(); };

  const watcher = vscode.workspace.createFileSystemWatcher(PATTERN);
  watcher.onDidCreate(uri => void refreshFile(uri));
  watcher.onDidChange(uri => void refreshFile(uri));
  watcher.onDidDelete(uri => controller.items.delete(uri.toString()));
  context.subscriptions.push(watcher);

  const run = async (request: vscode.TestRunRequest, token: vscode.CancellationToken): Promise<void> => {
    const testRun = controller.createTestRun(request);
    // Which tests of which files: everything, or what was picked.
    const wanted = new Map<vscode.TestItem, Set<string> | undefined>();
    const roots: vscode.TestItem[] = [];
    if (request.include) roots.push(...request.include); else controller.items.forEach(i => roots.push(i));
    for (const item of roots) {
      if (item.parent) {
        // The file as a whole may be there already.
        if (wanted.has(item.parent) && wanted.get(item.parent) === undefined) continue;
        const set = wanted.get(item.parent) ?? new Set<string>();
        set.add(item.label);
        wanted.set(item.parent, set);
      } else wanted.set(item, undefined);
    }
    for (const [file, only] of wanted) {
      if (token.isCancellationRequested) break;
      if (!file.uri) continue;
      await refreshFile(file.uri);
      const items = new Map<string, vscode.TestItem>();
      file.children.forEach(c => { if (!only || only.has(c.label)) { items.set(c.label, c); testRun.enqueued(c); } });
      if (request.exclude) for (const ex of request.exclude) { if (ex === file) items.clear(); else if (ex.parent === file) items.delete(ex.label); }
      const failAll = (message: string): void => { for (const item of items.values()) testRun.errored(item, new vscode.TestMessage(message)); };
      const { spec, error } = await read(file.uri);
      if (!spec) { failAll(error ?? L("テストファイルを読めません。", "Cannot read the test file.")); continue; }
      const programPath = path.resolve(path.dirname(file.uri.fsPath), spec.program);
      let program: TestTarget;
      try {
        const programUri = vscode.Uri.file(programPath);
        const document = await vscode.workspace.openTextDocument(programUri);
        program = testTarget(programPath, document.getText(), () => ({ host: fileHost, ...assemblerOptions(programUri) }));
        if (program.errors.length) { failAll(L("プログラムの間違い:", "Mistakes in the program:") + `\n${program.errors.join("\n")}`); continue; }
      } catch (e) {
        const why = e instanceof Error ? e.message : String(e);
        failAll(L(`プログラム ${spec.program} を読めません: ${why}`, `Cannot read the program ${spec.program}: ${why}`));
        continue;
      }
      let client;
      try {
        client = await startMachine(machineConfig(context.extensionPath, file.uri), text => testRun.appendOutput(text + "\r\n"));
      } catch (e) {
        failAll(e instanceof Error ? e.message : String(e));
        void showSetupError(e);
        continue;
      }
      try {
        for (const item of items.values()) testRun.started(item);
        await runTests(client, program, spec, {
          folder: path.dirname(file.uri.fsPath),
          only: new Set(items.keys()),
          cancelled: () => token.isCancellationRequested,
          log: text => testRun.appendOutput(text + "\r\n"),
          onResult: result => {
            const item = items.get(result.name);
            if (!item) return;
            if (result.passed) testRun.passed(item, result.durationMs);
            else {
              const message = new vscode.TestMessage(result.messages.join("\n"));
              if (item.uri && item.range) message.location = new vscode.Location(item.uri, item.range);
              testRun.failed(item, message, result.durationMs);
            }
          }
        });
      } catch (e) {
        failAll(e instanceof Error ? e.message : String(e));
      } finally {
        client.dispose();
      }
    }
    testRun.end();
  };

  // Debugging a test starts the debugger at its routine, with its registers and memory set.
  const debug = async (request: vscode.TestRunRequest): Promise<void> => {
    const item = request.include?.find(i => i.parent);
    if (!item?.uri || !item.parent) { void vscode.window.showInformationMessage(L("デバッグするテストを1つ選んでください。", "Pick one test to debug.")); return; }
    const { spec } = await read(item.uri);
    const test = spec?.tests.find(t => t.name === item.label);
    if (!spec || !test) return;
    if (test.basic !== undefined || !/\.asm$|\.s$|\.e500asm$/i.test(spec.program)) { void vscode.window.showInformationMessage(L("BASIC のテストはデバッグできません。ブレークポイントを置いて通常のデバッグで CALL してください。", "A BASIC test cannot be debugged. Set a breakpoint and CALL it in a normal debug session.")); return; }
    await vscode.debug.startDebugging(vscode.workspace.getWorkspaceFolder(item.uri), {
      type: "pc-e500", request: "launch", name: L(`テスト: ${test.name}`, `Test: ${test.name}`),
      program: path.resolve(path.dirname(item.uri.fsPath), spec.program),
      mode: "direct", entry: test.call, return: test.return ?? "far", registers: test.registers, memory: test.memory,
      stopOnEntry: true, stopOnReturn: true
    });
  };

  controller.createRunProfile(L("実行", "Run"), vscode.TestRunProfileKind.Run, (request, token) => run(request, token), true);
  controller.createRunProfile(L("デバッグ", "Debug"), vscode.TestRunProfileKind.Debug, request => debug(request), true);
}
