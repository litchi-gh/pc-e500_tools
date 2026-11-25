// The debugger for PC-E500 assembly: a Debug Adapter Protocol implementation that
// runs inside the extension and drives e500dbg through EmulatorClient.
import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { AsmHost } from "../asm/assembler";
import { bitsOf, evaluateExpression, hexAndDecimal, hexValue, POINTERS, readTarget, REGISTER_BITS, Target, targetOf, writeLabel, writeTarget } from "../emu/asmValues";
import { EmulatorClient, Stopped } from "../emu/client";
import { assemblerOptions, machineConfig } from "../emu/config";
import { MachineHub } from "../emu/hub";
import { basicCall, loadProgram, startMachine } from "../emu/prepare";
import { hex5, parseNumber, Program } from "../emu/program";
import { L } from "../l10n";

export interface LaunchArguments {
  /** The assembly source to build and run. */
  program: string;
  /** Where to start: a label or an address (default: START, MAIN, or the first byte). */
  entry?: string;
  /** "basic": type CALL at BASIC's prompt (the routine returns with RETF). "direct": jump there with a return address pushed. */
  mode?: "basic" | "direct";
  /** How a "direct" routine returns: "far" (RETF, the default) or "near" (RET). */
  return?: "far" | "near";
  /** Registers set before a "direct" call. */
  registers?: Record<string, number | string>;
  /** Memory written before starting: address (label, expression or number) → bytes or text. */
  memory?: Record<string, number[] | string>;
  stopOnEntry?: boolean;
  /** Stop when a "direct" routine returns (otherwise it is reported and the machine goes on). */
  stopOnReturn?: boolean;
  rom?: string;
  ram?: number;
  /** A state file of the PC-E500 emulator (*.e500state) to start from. */
  state?: string;
  /** 1 = real time, 0 = as fast as it goes. */
  speed?: number;
  noDebug?: boolean;
}

type Message = { seq: number; type: string; command?: string; arguments?: any; event?: string; body?: unknown; request_seq?: number };

const THREAD = 1;
const REGISTERS = 1, SYMBOLS = 2, PORTS = 3;
const REGISTER_NAMES = ["A", "IL", "BA", "I", "X", "Y", "U", "S", "P", "F"];
const REGISTER_WIDTH: Record<string, number> = { A: 2, IL: 2, F: 2, BA: 4, I: 4, X: 5, Y: 5, U: 5, S: 5, P: 5 };
const PORT_NAMES: Array<[string, number]> = [
  ["BP", 0xec], ["PX", 0xed], ["PY", 0xee], ["AMC", 0xef], ["KOL", 0xf0], ["KOH", 0xf1], ["KI", 0xf2], ["EOL", 0xf3],
  ["EOH", 0xf4], ["EIL", 0xf5], ["EIH", 0xf6], ["UCR", 0xf7], ["USR", 0xf8], ["RXD", 0xf9], ["TXD", 0xfa], ["IMR", 0xfb],
  ["ISR", 0xfc], ["SCR", 0xfd], ["LCC", 0xfe], ["SSR", 0xff]
];

const fileHost: AsmHost = {
  readText: f => { try { return fs.readFileSync(f, "utf8"); } catch { return undefined; } },
  readBinary: f => { try { return fs.readFileSync(f); } catch { return undefined; } }
};

const hexWidth = (n: number, width: number): string => n.toString(16).toUpperCase().padStart(width, "0") + "h";
const reference = (address: number): string => "0x" + (address & 0xfffff).toString(16).toUpperCase().padStart(5, "0");

export class E500DebugAdapter implements vscode.DebugAdapter {
  private readonly sent = new vscode.EventEmitter<vscode.DebugProtocolMessage>();
  readonly onDidSendMessage = this.sent.event;
  private seq = 1;
  private client?: EmulatorClient;
  private program?: Program;
  private args?: LaunchArguments;
  private programReady: Promise<Program | undefined>;
  private setProgram!: (p: Program | undefined) => void;
  private configured: Promise<void>;
  private setConfigured!: () => void;
  private readonly sourceBreakpoints = new Map<string, number[]>();
  private instructionBreakpoints: number[] = [];
  private entryBreakpoint?: number;
  private lastFrames: number[] = [];
  private ended = false;

  constructor(private readonly session: vscode.DebugSession, private readonly hub: MachineHub, private readonly extensionPath: string, private readonly showPanel: () => void) {
    this.programReady = new Promise(resolve => { this.setProgram = resolve; });
    this.configured = new Promise(resolve => { this.setConfigured = resolve; });
  }

  // ---- Plumbing ----

  handleMessage(message: vscode.DebugProtocolMessage): void {
    const m = message as Message;
    if (m.type !== "request" || !m.command) return;
    void this.dispatch(m).catch(error => this.respond(m, false, undefined, error instanceof Error ? error.message : String(error)));
  }

  private send(message: Omit<Message, "seq">): void {
    this.sent.fire({ ...message, seq: this.seq++ } as vscode.DebugProtocolMessage);
  }
  private respond(request: Message, success = true, body?: unknown, message?: string): void {
    this.send({ type: "response", request_seq: request.seq, command: request.command, success, body, ...(message ? { message } : {}) } as Omit<Message, "seq">);
  }
  private event(event: string, body?: unknown): void {
    this.send({ type: "event", event, body });
  }
  private log(text: string, category: "console" | "stdout" | "stderr" | "important" = "console"): void {
    this.event("output", { category, output: text.endsWith("\n") ? text : text + "\n" });
  }

  private get machine(): EmulatorClient {
    if (!this.client?.alive) throw new Error(L("マシンが動いていません。", "The machine is not running."));
    return this.client;
  }

  // ---- Requests ----

  private async dispatch(request: Message): Promise<void> {
    const a = request.arguments ?? {};
    switch (request.command) {
      case "initialize":
        this.respond(request, true, {
          supportsConfigurationDoneRequest: true,
          supportsSetVariable: true,
          supportsSetExpression: true,
          supportsEvaluateForHovers: true,
          supportsReadMemoryRequest: true,
          supportsWriteMemoryRequest: true,
          supportsDisassembleRequest: true,
          supportsInstructionBreakpoints: true,
          supportsSteppingGranularity: true,
          supportsTerminateRequest: true,
          supportsValueFormattingOptions: false
        });
        this.event("initialized");
        return;
      case "launch": return this.launch(request, a as LaunchArguments);
      case "configurationDone": this.setConfigured(); this.respond(request); return;
      case "setBreakpoints": return this.setBreakpoints(request, a);
      case "setInstructionBreakpoints": {
        this.instructionBreakpoints = (a.breakpoints ?? []).map((b: { instructionReference: string; offset?: number }) => (Number(b.instructionReference) + (b.offset ?? 0)) & 0xfffff);
        await this.applyBreakpoints();
        this.respond(request, true, { breakpoints: this.instructionBreakpoints.map(() => ({ verified: true })) });
        return;
      }
      case "setExceptionBreakpoints": this.respond(request, true, { breakpoints: [] }); return;
      case "threads": this.respond(request, true, { threads: [{ id: THREAD, name: "SC62015" }] }); return;
      case "stackTrace": return this.stackTrace(request, a);
      case "scopes":
        this.respond(request, true, {
          scopes: [
            { name: L("レジスタ", "Registers"), variablesReference: REGISTERS, presentationHint: "registers", expensive: false },
            { name: L("シンボル", "Symbols"), variablesReference: SYMBOLS, expensive: false },
            { name: L("内部 RAM（I/O）", "Internal RAM (I/O)"), variablesReference: PORTS, expensive: false }
          ]
        });
        return;
      case "variables": return this.variables(request, a.variablesReference);
      case "setVariable": return this.setVariable(request, a);
      case "setExpression": {
        const value = await this.setTarget(String(a.expression ?? ""), String(a.value ?? ""));
        this.respond(request, true, { value });
        this.event("invalidated", { areas: ["variables"] });
        return;
      }
      case "evaluate": return this.evaluate(request, a.expression, a.context);
      case "readMemory": {
        const address = (Number(a.memoryReference) + (a.offset ?? 0)) & 0xfffff;
        const count = Math.max(0, Math.min(a.count ?? 0, 0x100000 - address, 0x10000));
        const data = await this.machine.read(address, count);
        this.respond(request, true, { address: reference(address), data: data.toString("base64"), unreadableBytes: (a.count ?? 0) - count });
        return;
      }
      case "writeMemory": {
        const address = (Number(a.memoryReference) + (a.offset ?? 0)) & 0xfffff;
        const data = Buffer.from(a.data ?? "", "base64");
        await this.machine.write(address, data);
        this.respond(request, true, { bytesWritten: data.length });
        this.event("invalidated", { areas: ["variables"] });
        return;
      }
      case "disassemble": return this.disassemble(request, a);
      case "continue":
        this.respond(request, true, { allThreadsContinued: true });
        await this.machine.continue(this.args?.speed);
        return;
      case "next": this.respond(request); await this.machine.stepOver(); return;
      case "stepIn": this.respond(request); await this.machine.step(); return;
      case "stepOut": this.respond(request); await this.machine.stepOut(); return;
      case "pause": this.respond(request); await this.machine.pause(); return;
      case "terminate":
        // VS Code waits for the event: without it the session stayed until stopped again.
        this.respond(request);
        this.end(true);
        return;
      case "disconnect":
        this.end(false);
        this.respond(request);
        return;
      default:
        this.respond(request, false, undefined, L(`${request.command} には対応していません。`, `${request.command} is not supported.`));
    }
  }

  private async launch(request: Message, args: LaunchArguments): Promise<void> {
    this.args = args;
    let program: Program | undefined;
    try {
      if (!args.program) throw new Error(L("launch.json の program にアセンブリのファイルを指定してください。", "Set program in launch.json to an assembly file."));
      const file = path.resolve(args.program);
      const uri = vscode.Uri.file(file);
      // The text as it is in the editor, saved or not.
      const document = await vscode.workspace.openTextDocument(uri);
      program = Program.build(file, document.getText(), { host: fileHost, ...assemblerOptions(uri) });
      if (program.errors.length > 0) {
        for (const e of program.errors) this.log(e, "stderr");
        throw new Error(L(`アセンブルでエラーが ${program.errors.length} 件ありました（デバッグコンソールを見てください）。`, `Assembly found ${program.errors.length} error(s) (see the Debug Console).`));
      }
      const entry = program.entry(args.entry);
      this.log(L(`${path.basename(file)}: ${hex5(program.origin)}〜${hex5(program.end - 1)}（${program.binary.length} バイト）、開始 ${hex5(entry)}${program.symbolFor(entry) ? " " + program.symbolFor(entry) : ""}`,
        `${path.basename(file)}: ${hex5(program.origin)}-${hex5(program.end - 1)} (${program.binary.length} bytes), start ${hex5(entry)}${program.symbolFor(entry) ? " " + program.symbolFor(entry) : ""}`));
      this.setProgram(program);
      this.program = program;

      const config = machineConfig(this.extensionPath, uri, { rom: args.rom, ram: args.ram, state: args.state });
      const client = await startMachine(config, text => this.log(text));
      // Ended while it was starting: nothing else will stop it.
      if (this.ended) { client.dispose(); return; }
      this.client = client;
      client.on("stopped", (stop: Stopped) => void this.onStopped(stop));
      client.on("continued", () => this.event("continued", { threadId: THREAD, allThreadsContinued: true }));
      client.on("exit", () => this.end(true));
      client.on("log", (text: string) => this.log(text, "stderr"));
      await loadProgram(client, program, text => this.log(text));
      for (const [where, data] of Object.entries(args.memory ?? {})) {
        const address = parseNumber(where) ?? program.resolve(where);
        await client.write(address, Uint8Array.from(typeof data === "string" ? [...data].map(c => c.charCodeAt(0) & 0xff) : data));
      }
      if (this.ended) return;
      this.hub.attach({ client, label: L(`デバッグ: ${path.basename(file)}`, `Debugging: ${path.basename(file)}`), debugging: true, program, changed: () => this.event("invalidated", { areas: ["variables"] }) });
      if (vscode.workspace.getConfiguration("pcE500").get<boolean>("openPanelOnDebug", true)) this.showPanel();

      await this.configured;
      if (args.stopOnEntry && !args.noDebug) this.entryBreakpoint = entry;
      await this.applyBreakpoints();
      this.respond(request);

      const speed = args.speed ?? vscode.workspace.getConfiguration("pcE500").get<number>("speed", 1);
      this.args.speed = speed;
      if ((args.mode ?? "basic") === "basic") {
        const mode = await client.mode();
        if (!mode.run) this.log(L("BASIC の RUN モードではないため CALL を打てません。パネルで BASIC キーを押してから CALL してください。", "BASIC is not in RUN mode, so CALL cannot be typed. Press the BASIC key in the panel, then CALL."), "important");
        else {
          await client.tap("C-CE");
          await client.type(basicCall(entry) + "\n");
          this.log(L(`BASIC で ${basicCall(entry)} を実行します（RETF で BASIC に戻ります）。`, `Running ${basicCall(entry)} in BASIC (RETF returns to BASIC).`));
        }
      } else {
        const registers: Record<string, number> = {};
        for (const [name, v] of Object.entries(args.registers ?? {})) registers[name.toUpperCase()] = typeof v === "number" ? v : parseNumber(v) ?? program.resolve(v);
        await client.call(entry, args.return !== "near", registers);
        this.log(L(`${hex5(entry)} を直接呼び出します（${args.return === "near" ? "RET" : "RETF"} で戻ると止まります）。`, `Calling ${hex5(entry)} directly (it stops when ${args.return === "near" ? "RET" : "RETF"} returns).`));
      }
      await client.continue(speed);
    } catch (error) {
      // Breakpoint requests waiting for the program get their answer (a second resolve does nothing).
      this.setProgram(this.program);
      this.respond(request, false, undefined, error instanceof Error ? error.message : String(error));
      this.end(true);
    }
  }

  private async onStopped(stop: Stopped): Promise<void> {
    if (stop.reason === "return") {
      const r = stop.registers!;
      this.log(L("ルーチンから戻りました", "The routine returned") + `: A=${hexWidth(r.A, 2)} IL=${hexWidth(r.IL, 2)} BA=${hexWidth(r.BA, 4)} X=${hexWidth(r.X, 5)} Y=${hexWidth(r.Y, 5)} C=${r.F & 1} Z=${(r.F >> 1) & 1}`, "important");
      if (!this.args?.stopOnReturn) { await this.machine.continue(this.args?.speed); return; }
      this.event("stopped", { reason: "step", description: L("ルーチンから戻りました", "The routine returned"), threadId: THREAD, allThreadsStopped: true });
      return;
    }
    let reason: string = stop.reason;
    if (stop.reason === "breakpoint" && this.entryBreakpoint === stop.pc) {
      reason = "entry";
      this.entryBreakpoint = undefined;
      await this.applyBreakpoints();
    }
    if (this.args?.noDebug && stop.reason === "breakpoint") { await this.machine.continue(this.args.speed); return; }
    const description = stop.reason === "exception" ? L(`未定義命令で停止しました（${hex5(stop.pc)}）`, `Stopped on an undefined instruction (${hex5(stop.pc)})`) : undefined;
    this.event("stopped", { reason, description, text: description, threadId: THREAD, allThreadsStopped: true });
  }

  private async applyBreakpoints(): Promise<void> {
    if (!this.client?.alive) return;
    const all = this.args?.noDebug ? [] : [...[...this.sourceBreakpoints.values()].flat(), ...this.instructionBreakpoints];
    if (this.entryBreakpoint !== undefined) all.push(this.entryBreakpoint);
    await this.client.breakpoints([...new Set(all)]);
  }

  private async setBreakpoints(request: Message, a: { source: { path?: string }; breakpoints?: Array<{ line: number }> }): Promise<void> {
    const program = await this.programReady;
    const file = a.source.path ?? "";
    const result: unknown[] = [];
    const addresses: number[] = [];
    for (const bp of a.breakpoints ?? []) {
      const line = program?.hasFile(file) ? program.codeAtOrAfter(file, bp.line - 1) : undefined;
      if (line) {
        addresses.push(line.address);
        result.push({ verified: true, line: line.line + 1, instructionReference: reference(line.address) });
      } else {
        result.push({ verified: false, line: bp.line, message: program?.hasFile(file) ? L("この行より後に命令がありません。", "No instruction at or after this line.") : L("デバッグ中のプログラムに含まれないファイルです。", "This file is not part of the program being debugged.") });
      }
    }
    this.sourceBreakpoints.set(path.resolve(file).toLowerCase(), addresses);
    await this.applyBreakpoints();
    this.respond(request, true, { breakpoints: result });
  }

  private frameName(address: number): string {
    const symbol = this.program?.symbolFor(address);
    if (symbol) return symbol;
    return address >= 0xc0000 || (address >= 0x20000 && address < 0x40000) ? `ROM ${hex5(address)}` : hex5(address);
  }

  private source(address: number): { source?: unknown; line: number; column: number } {
    const line = this.program?.lineAt(address);
    if (!line || !line.code) return { line: 0, column: 0 };
    return { source: { name: path.basename(line.file), path: line.file }, line: line.line + 1, column: 1 };
  }

  private async stackTrace(request: Message, a: { startFrame?: number; levels?: number }): Promise<void> {
    const registers = await this.machine.registers();
    const frames = await this.machine.callstack();
    // The innermost first: where the CPU is, then each call site going outwards.
    const addresses = [registers.P, ...frames.map(f => f.site).reverse()];
    this.lastFrames = addresses;
    const interrupts = [false, ...frames.map(f => f.interrupt).reverse()];
    const start = a.startFrame ?? 0;
    const count = a.levels ? Math.min(a.levels, addresses.length - start) : addresses.length - start;
    const stackFrames = addresses.slice(start, start + count).map((address, i) => {
      const index = start + i;
      const where = this.source(address);
      return {
        id: index + 1,
        name: this.frameName(address) + (interrupts[index] ? L("（割り込み）", " (interrupt)") : ""),
        ...where,
        instructionPointerReference: reference(address),
        presentationHint: where.source ? "normal" : "subtle"
      };
    });
    this.respond(request, true, { stackFrames, totalFrames: addresses.length });
  }

  private async variables(request: Message, ref: number): Promise<void> {
    const variables: unknown[] = [];
    if (ref === REGISTERS) {
      const r = await this.machine.registers();
      for (const name of REGISTER_NAMES) {
        const value = (r as unknown as Record<string, number>)[name];
        variables.push({
          name, value: L(`${hexWidth(value, REGISTER_WIDTH[name])}（${value}）`, `${hexWidth(value, REGISTER_WIDTH[name])} (${value})`), variablesReference: 0,
          ...(REGISTER_WIDTH[name] === 5 ? { memoryReference: reference(value) } : {})
        });
      }
      variables.push({ name: "C", value: String(r.F & 1), variablesReference: 0 });
      variables.push({ name: "Z", value: String((r.F >> 1) & 1), variablesReference: 0 });
      variables.push({ name: L("状態", "State"), value: [r.halt ? "HALT" : "", r.off ? L("電源 OFF", "power off") : "", r.fault ? L("未定義命令", "undefined instruction") : ""].filter(Boolean).join(L("・", ", ")) || L("実行可", "runnable"), variablesReference: 0, presentationHint: { attributes: ["readOnly"] } });
      variables.push({ name: L("サイクル", "Cycles"), value: String(r.cycles), variablesReference: 0, presentationHint: { attributes: ["readOnly"] } });
    } else if (ref === SYMBOLS && this.program) {
      const labels = new Set(this.program.labels.map(([name]) => name));
      for (const [name, address] of this.program.labels) {
        variables.push({ name, value: await this.labelBytes(address), variablesReference: 0, memoryReference: reference(address) });
      }
      for (const [name, value] of this.program.symbols) {
        if (labels.has(name)) continue;
        variables.push({ name, value: L(`${value}（${hexWidth(Number(value) & 0xfffff, 2)}）`, `${value} (${hexWidth(Number(value) & 0xfffff, 2)})`), variablesReference: 0, presentationHint: { kind: "property", attributes: ["constant", "readOnly"] } });
      }
    } else if (ref === PORTS) {
      const imem = await this.machine.internalMemory();
      for (const [name, at] of PORT_NAMES) variables.push({ name: L(`${name}（${at.toString(16).toUpperCase()}h）`, `${name} (${at.toString(16).toUpperCase()}h)`), value: hexWidth(imem[at], 2), variablesReference: 0, ...(name in POINTERS ? {} : { presentationHint: { attributes: ["readOnly"] } }) });
    }
    this.respond(request, true, { variables });
  }

  /** Sets a register, [..] or (..), and returns the value it then shows. */
  private async setTarget(name: string, typed: string): Promise<string> {
    const target = targetOf(name, await this.machine.registers(), this.program);
    if (!target) throw new Error(L(`${name} は書き換えられません。メモリは [${name}] と書きます。`, `${name} cannot be changed. Write [${name}] for the memory there.`));
    const value = await writeTarget(this.machine, target, typed, this.program);
    return bitsOf(target) === 1 ? String(value) : hexAndDecimal(value, bitsOf(target));
  }

  private async setVariable(request: Message, a: { variablesReference: number; name: string; value: string }): Promise<void> {
    let shown: string;
    if (a.variablesReference === REGISTERS && (a.name in REGISTER_BITS || a.name === "C" || a.name === "Z")) {
      const target: Target = { kind: "register", name: a.name };
      const value = await writeTarget(this.machine, target, a.value, this.program);
      shown = bitsOf(target) === 1 ? String(value) : hexAndDecimal(value, bitsOf(target));
    } else if (a.variablesReference === SYMBOLS && this.program?.labels.some(([name]) => name === a.name)) {
      await writeLabel(this.machine, this.program, a.name, a.value);
      shown = await this.labelBytes(this.program.labels.find(([name]) => name === a.name)![1]);
    } else {
      const pointer = /^(BP|PX|PY)\b/.exec(a.name)?.[1];
      if (a.variablesReference !== PORTS || !pointer) throw new Error(L(`${a.name} は書き換えられません。`, `${a.name} cannot be changed.`));
      shown = hexValue(await writeTarget(this.machine, { kind: "imem", address: POINTERS[pointer], size: 1 }, a.value, this.program), 8);
    }
    this.respond(request, true, { value: shown });
    this.event("invalidated", { areas: ["variables"] });
  }

  private async labelBytes(address: number): Promise<string> {
    const bytes = await this.machine.read(address, 4);
    return `${hex5(address)}h: ${[...bytes].map(b => hexWidth(b, 2).slice(0, 2)).join(" ")}`;
  }

  // A register, [expr] for memory, (expr) for internal RAM (src/emu/asmValues.ts), or an
  // expression of registers, symbols and numbers.
  private async evaluate(request: Message, expression: string, context?: string): Promise<void> {
    try {
      const registers = this.client?.alive ? await this.machine.registers() : undefined;
      const target = registers ? targetOf(expression, registers, this.program) : undefined;
      if (registers && target) {
        const value = await readTarget(this.machine, target, registers);
        const at = target.kind === "memory" ? target.address : target.kind === "register" && bitsOf(target) === 20 ? value : undefined;
        this.respond(request, true, {
          result: bitsOf(target) === 1 ? String(value) : hexAndDecimal(value, bitsOf(target)), variablesReference: 0,
          ...(at === undefined ? {} : { memoryReference: reference(at) })
        });
        return;
      }
      const value = evaluateExpression(expression, registers, this.program);
      const n = Number(value);
      const isAddress = this.program?.labels.some(([name]) => name === expression.trim().toUpperCase());
      this.respond(request, true, { result: L(`${hexWidth(n < 0 ? n >>> 0 : n, 2)}（${value}）`, `${hexWidth(n < 0 ? n >>> 0 : n, 2)} (${value})`), variablesReference: 0, ...(isAddress ? { memoryReference: reference(n) } : {}) });
    } catch (error) {
      // A hover over a word that is no symbol says nothing.
      if (context === "hover") { this.respond(request, false); return; }
      throw error;
    }
  }

  private async disassemble(request: Message, a: { memoryReference: string; offset?: number; instructionOffset?: number; instructionCount: number }): Promise<void> {
    const base = (Number(a.memoryReference) + (a.offset ?? 0)) & 0xfffff;
    const count = a.instructionCount;
    let offset = a.instructionOffset ?? 0;
    let lines;
    if (offset < 0) {
      const before = Math.min(-offset, 400);
      lines = await this.machine.disassemble(base, Math.max(1, count - before), before);
      // Fewer could be found going back: pad the front so the count is right.
      const found = lines.filter(l => l.address < base).length;
      offset = -found;
      const missing = before - found;
      const pad = Array.from({ length: missing }, (_, i) => ({ address: Math.max(0, base - (missing - i) - found), bytes: "", text: "??", target: null }));
      lines = [...pad, ...lines];
    } else {
      lines = (await this.machine.disassemble(base, count + offset)).slice(offset);
    }
    let lastFile: string | undefined;
    const instructions = lines.slice(0, count).map(l => {
      const line = this.program?.lineAt(l.address);
      const symbol = this.program?.labels.find(([, at]) => at === l.address)?.[0];
      const show = line && line.code && line.address === l.address;
      const location = show && line.file !== lastFile ? { location: { name: path.basename(line.file), path: line.file } } : {};
      if (show) lastFile = line.file;
      return {
        address: reference(l.address),
        instructionBytes: l.bytes.replace(/(..)(?!$)/g, "$1 "),
        instruction: l.text,
        ...(symbol ? { symbol } : {}),
        ...(show ? { ...location, line: line.line + 1 } : {}),
        ...(l.text === "??" ? { presentationHint: "invalid" } : {})
      };
    });
    while (instructions.length < count) instructions.push({ address: reference(base + instructions.length), instructionBytes: "", instruction: "??", presentationHint: "invalid" } as never);
    this.respond(request, true, { instructions });
  }

  private end(notify: boolean): void {
    if (this.ended) return;
    this.ended = true;
    if (this.client) {
      this.hub.detach(this.client);
      this.client.dispose();
    }
    if (notify) this.event("terminated");
  }

  dispose(): void {
    this.end(false);
    this.sent.dispose();
  }
}

/** Fills in a configuration for F5 on an assembly file with no launch.json. */
export class E500ConfigurationProvider implements vscode.DebugConfigurationProvider {
  /** @param ensure Whether a machine can be started for a file (asks for what is missing). */
  constructor(private readonly ensure: (scope: vscode.Uri | undefined, rom?: string) => Promise<boolean> = async () => true) {}

  async resolveDebugConfigurationWithSubstitutedVariables(_folder: vscode.WorkspaceFolder | undefined, config: vscode.DebugConfiguration): Promise<vscode.DebugConfiguration | undefined> {
    const scope = typeof config.program === "string" && config.program ? vscode.Uri.file(config.program) : undefined;
    return await this.ensure(scope, typeof config.rom === "string" ? config.rom : undefined) ? config : undefined;
  }

  provideDebugConfigurations(): vscode.DebugConfiguration[] {
    return [{ type: "pc-e500", request: "launch", name: L("PC-E500: アセンブルして実行", "PC-E500: Assemble and run"), program: "${file}", mode: "basic", stopOnEntry: false }];
  }

  resolveDebugConfiguration(_folder: vscode.WorkspaceFolder | undefined, config: vscode.DebugConfiguration): vscode.DebugConfiguration | undefined {
    if (!config.type && !config.request && !config.name) {
      const editor = vscode.window.activeTextEditor;
      if (editor?.document.languageId === "pc-e500-basic") return { type: "pc-e500", request: "launch", name: L("PC-E500: BASIC を実行", "PC-E500: Run BASIC"), program: editor.document.uri.fsPath, stopOnEntry: false };
      if (editor?.document.languageId !== "pc-e500-asm") return config;
      return { type: "pc-e500", request: "launch", name: L("PC-E500: アセンブルして実行", "PC-E500: Assemble and run"), program: editor.document.uri.fsPath, mode: "basic", stopOnEntry: false };
    }
    if (!config.program) {
      const editor = vscode.window.activeTextEditor;
      if (editor?.document.languageId === "pc-e500-asm" || editor?.document.languageId === "pc-e500-basic") config.program = editor.document.uri.fsPath;
    }
    return config;
  }
}
