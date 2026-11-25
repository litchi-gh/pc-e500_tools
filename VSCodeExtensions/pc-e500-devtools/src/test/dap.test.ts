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

describe("debug adapter (DAP)", { skip: available ? false : "e500dbg, e500core.dll or the ROM not found" }, () => {
  const program = path.join(extensionRoot, "examples", "hello.asm");
  const lines = fs.readFileSync(program, "utf8").split(/\r?\n/);
  const lineOf = (text: string): number => lines.findIndex(l => l.includes(text)) + 1;
  let adapter: { handleMessage(m: unknown): void; onDidSendMessage: (l: (m: unknown) => void) => unknown; dispose(): void };
  const received: Msg[] = [];
  let seq = 1;
  const waiters: Array<{ match: (m: Msg) => boolean; resolve: (m: Msg) => void }> = [];

  const waitFor = (match: (m: Msg) => boolean, timeout = 20000): Promise<Msg> => {
    const index = received.findIndex(match);
    if (index >= 0) return Promise.resolve(received.splice(index, 1)[0]);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timed out waiting")), timeout);
      waiters.push({ match, resolve: m => { clearTimeout(timer); resolve(m); } });
    });
  };
  const request = async (command: string, args: unknown = {}): Promise<Msg> => {
    const id = seq++;
    adapter.handleMessage({ seq: id, type: "request", command, arguments: args });
    const response = await waitFor(m => m.type === "response" && m.request_seq === id);
    assert.ok(response.success, `${command}: ${response.message}`);
    return response;
  };
  const stopped = () => waitFor(m => m.type === "event" && m.event === "stopped");

  before(async () => {
    // Loaded only now, after the stand-in for vscode is in place.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { E500DebugAdapter } = require("../debug/adapter") as typeof import("../debug/adapter.js");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { MachineHub } = require("../emu/hub") as typeof import("../emu/hub.js");
    adapter = new E500DebugAdapter({} as never, new MachineHub() as never, extensionRoot, () => undefined) as never;
    adapter.onDidSendMessage(m => {
      const msg = m as Msg;
      const w = waiters.findIndex(x => x.match(msg));
      if (w >= 0) waiters.splice(w, 1)[0].resolve(msg); else received.push(msg);
    });
  });
  after(() => adapter?.dispose());

  it("launches, stops on entry, steps, breaks on a line and shows the machine", async () => {
    await request("initialize", { adapterID: "pc-e500", linesStartAt1: true });
    await waitFor(m => m.event === "initialized");
    const launched = (async () => {
      adapter.handleMessage({ seq: seq++, type: "request", command: "launch", arguments: { program, mode: "basic", stopOnEntry: true } });
    })();
    // As VS Code does: breakpoints and configurationDone while the launch is going on.
    const bp = await request("setBreakpoints", { source: { path: program }, breakpoints: [{ line: lineOf("CALLF IOCS") }, { line: lineOf("msg:") + 1 }] });
    assert.equal(bp.body.breakpoints[0].verified, true);
    assert.equal(bp.body.breakpoints[0].line, lineOf("CALLF IOCS"));
    assert.equal(bp.body.breakpoints[1].verified, false);
    await request("configurationDone");
    await launched;
    await waitFor(m => m.type === "response" && m.command === "launch");

    const entry = await stopped();
    assert.equal(entry.body.reason, "entry");
    let trace = await request("stackTrace", { threadId: 1 });
    assert.equal(trace.body.stackFrames[0].name, "START");
    assert.equal(trace.body.stackFrames[0].line, lineOf("start:"));
    assert.ok(trace.body.stackFrames.length > 2, "the ROM's frames under the program");

    await request("next", { threadId: 1 });
    await stopped();
    trace = await request("stackTrace", { threadId: 1 });
    assert.equal(trace.body.stackFrames[0].line, lineOf("MV    (CL),0"));

    await request("continue", { threadId: 1 });
    const hit = await stopped();
    assert.equal(hit.body.reason, "breakpoint");
    trace = await request("stackTrace", { threadId: 1 });
    assert.equal(trace.body.stackFrames[0].line, lineOf("CALLF IOCS"));

    const scopes = await request("scopes", { frameId: 1 });
    const registers = await request("variables", { variablesReference: scopes.body.scopes[0].variablesReference });
    const il = registers.body.variables.find((v: { name: string }) => v.name === "IL");
    assert.match(il.value, /^42h/);
    const symbols = await request("variables", { variablesReference: scopes.body.scopes[1].variablesReference });
    assert.ok(symbols.body.variables.some((v: { name: string }) => v.name === "ADD2"));

    await request("setVariable", { variablesReference: 1, name: "A", value: "&H5A" });
    const a = await request("evaluate", { expression: "A", context: "watch" });
    assert.match(a.body.result, /^5Ah/);
    const y = await request("evaluate", { expression: "msg_end-msg", context: "watch" });
    assert.match(y.body.result, /（15）/);
    const byte = await request("evaluate", { expression: "[msg]", context: "watch" });
    assert.match(byte.body.result, /^48h/);
    const memory = await request("readMemory", { memoryReference: "0xBEC00", count: 4 });
    // PUSHU IMR is 2Fh.
    assert.equal(Buffer.from(memory.body.data, "base64")[0], 0x2f);
    // Every register, the flags, and RAM can be changed while stopped; ROM cannot.
    const value = async (name: string): Promise<string> => (await request("variables", { variablesReference: 1 })).body.variables.find((v: { name: string }) => v.name === name).value;
    const before = new Map<string, string>();
    for (const name of ["A", "IL", "BA", "I", "X", "Y", "U", "S", "F"]) before.set(name, (await value(name)).replace(/h.*/, "h"));
    for (const [name, typed, want] of [["BA", "&H1234", "1234h"], ["I", "0A0Bh", "0A0Bh"], ["X", "msg+1", "BEC"], ["Y", "0x12345", "12345h"], ["U", "$BE123", "BE123h"], ["S", "780000", "BE6E0h"], ["IL", "7", "07h"], ["C", "1", "1"], ["Z", "0", "0"]]) {
      await request("setVariable", { variablesReference: 1, name, value: typed });
      assert.ok((await value(name)).startsWith(want), `${name}: ${await value(name)}`);
    }
    for (const [name, v] of before) await request("setVariable", { variablesReference: 1, name, value: "0" + v });
    // Typed over as the list shows it, and what does not fit or is not there.
    const refuse = async (command: string, args: unknown): Promise<string> => {
      const id = seq++;
      adapter.handleMessage({ seq: id, type: "request", command, arguments: args });
      const response = await waitFor(m => m.type === "response" && m.request_seq === id);
      assert.equal(response.success, false, `${command} ${JSON.stringify(args)}`);
      return response.message ?? "";
    };
    await request("setVariable", { variablesReference: 1, name: "A", value: "FFh（64）" });
    assert.match(await value("A"), /^FFh/);
    await request("setVariable", { variablesReference: 1, name: "A", value: "-1" });
    assert.match(await value("A"), /^FFh/);
    assert.match(await refuse("setVariable", { variablesReference: 1, name: "A", value: "256" }), /8 ビット/);
    await refuse("setVariable", { variablesReference: 1, name: "C", value: "2" });
    await refuse("setVariable", { variablesReference: 1, name: "X", value: "nosuch" });
    const pc = await value("P");
    await request("setVariable", { variablesReference: 1, name: "P", value: "add2" });
    assert.equal((await request("stackTrace", { threadId: 1 })).body.stackFrames[0].name, "ADD2");
    await request("setVariable", { variablesReference: 1, name: "P", value: pc });
    // Labels (bytes or text), [memory], (internal RAM), BP.
    const label = async (name: string): Promise<string> => (await request("variables", { variablesReference: 2 })).body.variables.find((v: { name: string }) => v.name === name).value;
    const msg = await label("MSG");
    assert.match((await request("setVariable", { variablesReference: 2, name: "MSG", value: "\"JELL\"" })).body.value, /: 4A 45 4C 4C$/);
    await request("setVariable", { variablesReference: 2, name: "MSG", value: msg });
    assert.equal(await label("MSG"), msg, "the shown text can be put back");
    await refuse("setVariable", { variablesReference: 2, name: "MSG", value: "123" });
    await refuse("setVariable", { variablesReference: 2, name: "WORK", value: "1" });
    assert.match((await request("setExpression", { expression: "[WORK]:2", value: "&H1234" })).body.value, /^1234h/);
    assert.equal(Buffer.from((await request("readMemory", { memoryReference: "0xBED00", count: 2 })).body.data, "base64").toString("hex"), "3412");
    assert.match((await request("setExpression", { expression: "(BL)", value: "5" })).body.value, /^05h/);
    assert.match((await request("evaluate", { expression: "($D4):2", context: "watch" })).body.result, /^0305h/, "BL=5, BH=3");
    await request("setExpression", { expression: "(BL)", value: "0" });
    assert.match(await refuse("setExpression", { expression: "($F0)", value: "0" }), /00h〜EEh/);
    await refuse("setExpression", { expression: "[$C0000]", value: "0" });
    await refuse("setExpression", { expression: "WORK", value: "0" });
    assert.match((await request("evaluate", { expression: "(1+2)*3", context: "watch" })).body.result, /（9）/);
    const ports = (await request("variables", { variablesReference: 3 })).body.variables;
    const pointer = ports.find((v: { name: string }) => v.name.startsWith("BP"));
    assert.equal(pointer.presentationHint, undefined);
    assert.equal((await request("setVariable", { variablesReference: 3, name: pointer.name, value: "7Ah" })).body.value, "7Ah");
    await request("setVariable", { variablesReference: 3, name: pointer.name, value: pointer.value });
    await refuse("setVariable", { variablesReference: 3, name: ports.find((v: { name: string }) => v.name.startsWith("IMR")).name, value: "0" });
    await request("writeMemory", { memoryReference: "0xBED00", data: Buffer.from([1, 2, 0xfe]).toString("base64") });
    assert.equal(Buffer.from((await request("readMemory", { memoryReference: "0xBED00", count: 3 })).body.data, "base64").toString("hex"), "0102fe");
    const refused = seq++;
    adapter.handleMessage({ seq: refused, type: "request", command: "writeMemory", arguments: { memoryReference: "0xC0000", data: "AA==" } });
    assert.equal((await waitFor(m => m.type === "response" && m.request_seq === refused)).success, false);
    const dis = await request("disassemble", { memoryReference: "0xBEC00", instructionOffset: -2, instructionCount: 6 });
    assert.equal(dis.body.instructions.length, 6);
    assert.ok(dis.body.instructions.some((i: { symbol?: string }) => i.symbol === "START"));

    // Step over the IOCS call: the text appears on the LCD.
    await request("next", { threadId: 1 });
    await stopped();
    trace = await request("stackTrace", { threadId: 1 });
    assert.equal(trace.body.stackFrames[0].line, lineOf("POPU  IMR"));

    await request("setBreakpoints", { source: { path: program }, breakpoints: [] });
    await request("stepOut", { threadId: 1 });
    const out = await stopped();
    assert.equal(out.body.reason, "step");
    trace = await request("stackTrace", { threadId: 1 });
    assert.match(trace.body.stackFrames[0].name, /^ROM /);

    // Stopped once: the session ends by itself.
    await request("terminate", {});
    await waitFor(m => m.type === "event" && m.event === "terminated");
  });

  it("fails the launch on an assembly error and still answers the breakpoints", async () => {
    const { E500DebugAdapter } = require("../debug/adapter") as typeof import("../debug/adapter.js");
    const { MachineHub } = require("../emu/hub") as typeof import("../emu/hub.js");
    const bad = path.join(require("node:os").tmpdir(), `e500-bad-${process.pid}.asm`);
    fs.writeFileSync(bad, "        ORG &BEC00\nstart:  NOSUCH A\n");
    const messages: Msg[] = [];
    const second = new E500DebugAdapter({} as never, new MachineHub() as never, extensionRoot, () => undefined);
    second.onDidSendMessage(m => messages.push(m as Msg));
    const until = async (match: (m: Msg) => boolean): Promise<Msg> => {
      for (let i = 0; i < 200; i++) { const m = messages.find(match); if (m) return m; await new Promise(r => setTimeout(r, 25)); }
      throw new Error("no answer");
    };
    second.handleMessage({ seq: 1, type: "request", command: "initialize", arguments: {} });
    second.handleMessage({ seq: 2, type: "request", command: "launch", arguments: { program: bad } });
    second.handleMessage({ seq: 3, type: "request", command: "setBreakpoints", arguments: { source: { path: bad }, breakpoints: [{ line: 2 }] } });
    const launch = await until(m => m.request_seq === 2);
    assert.equal(launch.success, false);
    assert.match(launch.message ?? "", /アセンブルでエラー/);
    const bps = await until(m => m.request_seq === 3);
    assert.equal(bps.success, true);
    second.dispose();
    fs.rmSync(bad, { force: true });
  });
});
