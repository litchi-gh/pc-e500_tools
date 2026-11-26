// The debug adapter driven by Debug Adapter Protocol messages, as VS Code sends them,
// with a stand-in for the few parts of the vscode module it uses. Needs the same
// server, core and ROM as emulator.test.ts (skipped without them).
import assert from "node:assert/strict";
import * as fs from "node:fs";
import Module from "node:module";
import * as path from "node:path";
import { after, before, describe, it } from "node:test";

const extensionRoot = path.resolve(__dirname, "..", "..");
const repo = path.resolve(extensionRoot, "..", "..");
// The emulator is a repository of its own, beside this one.
const workspace = path.dirname(repo);
const server = path.join(extensionRoot, "out", "server", process.platform === "win32" ? "e500dbg.exe" : "e500dbg.dll");
const core = process.env.E500_CORE ?? path.join(workspace, "Emulator", "bin", "e500core.dll");
const rom = process.env.E500_ROM ?? path.join(workspace, "Emulator", "app", "rom", "PC-E500(7.2).ROM");
const available = process.platform === "win32" && [server, core, rom].every(f => fs.existsSync(f));

class Emitter<T> {
  private listeners: Array<(value: T) => void> = [];
  readonly event = (listener: (value: T) => void) => { this.listeners.push(listener); return { dispose: () => undefined }; };
  fire(value: T): void { this.listeners.forEach(l => l(value)); }
  dispose(): void { this.listeners = []; }
}
const settings: Record<string, unknown> = { "pcE500.corePath": core, "pcE500.romPath": rom, "pcE500.serverPath": server, "pcE500.openPanelOnDebug": false, "pcE500.speed": 0 };
const fakeVscode = {
  EventEmitter: Emitter,
  Uri: { file: (p: string) => ({ fsPath: p, scheme: "file", toString: () => p }) },
  workspace: {
    openTextDocument: async (uri: { fsPath: string }) => ({ getText: () => fs.readFileSync(uri.fsPath, "utf8") }),
    getConfiguration: (section: string) => ({ get: (key: string, fallback?: unknown) => settings[`${section}.${key}`] ?? fallback }),
    getWorkspaceFolder: () => undefined,
    workspaceFolders: undefined
  },
  window: {}
};
// The adapter's `import * as vscode from "vscode"` gets the stand-in.
const load = (Module as unknown as { _load: (request: string, ...rest: unknown[]) => unknown });
const realLoad = load._load;
load._load = (request: string, ...rest: unknown[]) => request === "vscode" ? fakeVscode : realLoad(request, ...rest);

type Msg = { type: string; command?: string; event?: string; body?: any; success?: boolean; message?: string; request_seq?: number };

describe("BASIC debug adapter (DAP), at the first line", { skip: available ? false : "e500dbg, e500core.dll or the ROM not found" }, () => {
  it("stops at a breakpoint there, and shows a large array in parts", async () => {
    const { BasicDebugAdapter } = require("../debug/basicAdapter") as typeof import("../debug/basicAdapter.js");
    const { MachineHub } = require("../emu/hub") as typeof import("../emu/hub.js");
    const file = path.join(require("node:os").tmpdir(), `e500-dap1-${process.pid}.bas`);
    fs.writeFileSync(file, "10 DIM P(150)\r\n20 P(120)=7\r\n30 GOTO 30\r\n");
    const messages: Msg[] = [];
    const adapter = new BasicDebugAdapter(new MachineHub() as never, extensionRoot, () => undefined);
    adapter.onDidSendMessage(m => messages.push(m as Msg));
    let seq = 1;
    const until = async (match: (m: Msg) => boolean): Promise<Msg> => {
      for (let i = 0; i < 800; i++) { const k = messages.findIndex(match); if (k >= 0) return messages.splice(k, 1)[0]; await new Promise(r => setTimeout(r, 25)); }
      throw new Error("no answer");
    };
    const request = async (command: string, args: unknown = {}): Promise<Msg> => {
      const id = seq++;
      adapter.handleMessage({ seq: id, type: "request", command, arguments: args });
      return until(m => m.type === "response" && m.request_seq === id);
    };
    const line = async (): Promise<string> => { await until(m => m.event === "stopped"); return (await request("stackTrace", { threadId: 1 })).body.stackFrames[0].name; };
    try {
      await request("initialize");
      adapter.handleMessage({ seq: seq++, type: "request", command: "launch", arguments: { program: file, speed: 0 } });
      await request("setBreakpoints", { source: { path: file }, breakpoints: [{ line: 1 }, { line: 3 }] });
      await request("configurationDone");
      assert.equal(await line(), "10 行");
      await request("continue", { threadId: 1 });
      assert.equal(await line(), "30 行");
      const array = (await request("variables", { variablesReference: 1 })).body.variables.find((v: { name: string }) => v.name.startsWith("P"));
      const part = (await request("variables", { variablesReference: array.variablesReference, filter: "indexed", start: 100, count: 51 })).body.variables;
      assert.deepEqual([part.length, part[0].name, part[20].value], [51, "P(100)", "7"]);
    } finally { adapter.dispose(); fs.rmSync(file, { force: true }); }
  });
});

describe("BASIC debug adapter (DAP)", { skip: available ? false : "e500dbg, e500core.dll or the ROM not found" }, () => {
  it("runs a .bas file, stops on entry, steps, breaks on a line and shows the variables", async () => {
    const { BasicDebugAdapter } = require("../debug/basicAdapter") as typeof import("../debug/basicAdapter.js");
    const { MachineHub } = require("../emu/hub") as typeof import("../emu/hub.js");
    const file = path.join(require("node:os").tmpdir(), `e500-dap-${process.pid}.bas`);
    fs.writeFileSync(file, ["10 A=0:B$=\"HI\"", "20 FOR I=1 TO 3", "", "30 A=A+I", "40 NEXT I", "50 DIM P(2):P(1)=A", "60 GOTO 60"].join("\r\n"));
    const messages: Msg[] = [];
    const adapter = new BasicDebugAdapter(new MachineHub() as never, extensionRoot, () => undefined);
    adapter.onDidSendMessage(m => messages.push(m as Msg));
    let seq = 1;
    const until = async (match: (m: Msg) => boolean): Promise<Msg> => {
      for (let i = 0; i < 800; i++) { const k = messages.findIndex(match); if (k >= 0) return messages.splice(k, 1)[0]; await new Promise(r => setTimeout(r, 25)); }
      throw new Error("no answer");
    };
    const request = async (command: string, args: unknown = {}): Promise<Msg> => {
      const id = seq++;
      adapter.handleMessage({ seq: id, type: "request", command, arguments: args });
      const response = await until(m => m.type === "response" && m.request_seq === id);
      assert.ok(response.success, `${command}: ${response.message}`);
      return response;
    };
    const stopped = () => until(m => m.type === "event" && m.event === "stopped");
    try {
      await request("initialize", {});
      adapter.handleMessage({ seq: seq++, type: "request", command: "launch", arguments: { program: file, speed: 0, stopOnEntry: true } });
      // A breakpoint on the blank line 3 goes to line 30 (the 4th editor line).
      const bp = await request("setBreakpoints", { source: { path: file }, breakpoints: [{ line: 3 }] });
      assert.deepEqual(bp.body.breakpoints.map((b: { verified: boolean; line: number }) => [b.verified, b.line]), [[true, 4]], JSON.stringify(bp.body) + JSON.stringify(messages));
      await request("configurationDone");
      assert.equal((await stopped()).body.reason, "entry");
      let trace = await request("stackTrace", { threadId: 1 });
      assert.equal(trace.body.stackFrames[0].name, "10 行");
      assert.equal(trace.body.stackFrames[0].line, 1);
      await request("next", { threadId: 1 });
      assert.equal((await stopped()).body.reason, "step");
      trace = await request("stackTrace", { threadId: 1 });
      assert.equal(trace.body.stackFrames[0].name, "20 行");
      await request("continue", { threadId: 1 });
      assert.equal((await stopped()).body.reason, "breakpoint");
      trace = await request("stackTrace", { threadId: 1 });
      assert.equal(trace.body.stackFrames[0].line, 4);
      await request("continue", { threadId: 1 });
      await stopped();
      await request("continue", { threadId: 1 });
      await stopped();
      const vars = await request("variables", { variablesReference: 1 });
      const by = new Map(vars.body.variables.map((v: { name: string; value: string }) => [v.name, v.value]));
      assert.equal(by.get("B$"), "\"HI\"");
      assert.equal(by.has("Z"), false, "a letter the program does not use is not listed");
      assert.equal(by.get("A"), "3");
      const set = await request("setVariable", { variablesReference: 1, name: "A", value: "10" });
      assert.equal(set.body.value, "10");
      assert.equal((await request("evaluate", { expression: "A", context: "watch" })).body.result, "10");
      assert.equal((await request("setExpression", { expression: "b$", value: "AB" })).body.value, "\"AB\"");
      await request("setVariable", { variablesReference: 1, name: "A", value: "3" });
      await request("setBreakpoints", { source: { path: file }, breakpoints: [] });
      await request("continue", { threadId: 1 });
      await new Promise(r => setTimeout(r, 400));
      // Running: no changing then.
      const id = seq++;
      adapter.handleMessage({ seq: id, type: "request", command: "setVariable", arguments: { variablesReference: 1, name: "A", value: "1" } });
      assert.equal((await until(m => m.type === "response" && m.request_seq === id)).success, false);
      await request("pause", { threadId: 1 });
      assert.equal((await stopped()).body.reason, "pause");
      trace = await request("stackTrace", { threadId: 1 });
      assert.equal(trace.body.stackFrames[0].name, "60 行");
      const p1 = await request("evaluate", { expression: "p(1)", context: "watch" });
      assert.equal(p1.body.result, "6");
      await request("terminate", {});
      await until(m => m.type === "event" && m.event === "terminated");
    } finally {
      adapter.dispose();
      fs.rmSync(file, { force: true });
    }
  });
});
