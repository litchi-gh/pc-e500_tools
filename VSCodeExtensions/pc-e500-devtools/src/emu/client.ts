// The connection to e500dbg (server/): one JSON object a line each way.
import { ChildProcess, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import * as readline from "node:readline";
import { isEnglish, L } from "../l10n";

export interface Registers {
  A: number; IL: number; BA: number; I: number; X: number; Y: number; U: number; S: number; P: number; F: number;
  off: boolean; halt: boolean; fault: boolean; cycles: number;
}

export interface Frame { site: number; target: number; sp: number; interrupt: boolean }
export interface Screen { pixels: string; symbols: number[]; text?: string }
/** "read": an instruction read a watched byte (address); the instruction has run, pc is after it. */
export interface Stopped { reason: "breakpoint" | "step" | "pause" | "exception" | "return" | "read"; pc: number; registers?: Registers; address?: number }
export interface RunResult { reason: "return" | "breakpoint" | "exception" | "timeout" | "idle" | "read"; cycles: number; pc: number; registers?: Registers; address?: number }
export interface Instruction { address: number; bytes: string; text: string; target?: number | null }
export interface MachineInfo { romVersion: string; romKB: number; internalKB: number; cardKB: number; cpuHz: number }

export interface ClientOptions {
  /** e500dbg.exe, or e500dbg.dll to be run by dotnet. */
  readonly server: string;
  /** e500core.dll (libe500core.so, libe500core.dylib) of the PC-E500 emulator (with the debugger API). */
  readonly core: string;
}

type Pending = { resolve: (body: unknown) => void; reject: (error: Error) => void; cmd: string };

/**
 * Events: "frame" (Screen), "stopped" (Stopped), "continued", "exit" (code), "log" (text).
 */
export class EmulatorClient extends EventEmitter {
  private readonly process: ChildProcess;
  private readonly pending = new Map<number, Pending>();
  private nextId = 1;
  private exited = false;
  private readonly ready: Promise<void>;
  info?: MachineInfo;
  running = false;

  constructor(options: ClientOptions) {
    super();
    const managed = /\.dll$/i.test(options.server);
    this.process = spawn(managed ? "dotnet" : options.server, [...(managed ? [options.server] : []), "--core", options.core, "--lang", isEnglish() ? "en" : "ja"], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let readyResolve!: () => void, readyReject!: (e: Error) => void;
    this.ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
    // An unhandled rejection is not wanted when nobody awaited readiness.
    this.ready.catch(() => undefined);
    const lines = readline.createInterface({ input: this.process.stdout! });
    lines.on("line", line => {
      let message: { id?: number; ok?: boolean; body?: unknown; error?: string; event?: string };
      try { message = JSON.parse(line); } catch { this.emit("log", line); return; }
      if (message.event) {
        if (message.event === "ready") readyResolve();
        else if (message.event === "fatal") readyReject(new Error((message.body as { message: string }).message));
        else {
          if (message.event === "stopped") this.running = false;
          if (message.event === "continued") this.running = true;
          this.emit(message.event, message.body);
        }
        return;
      }
      const waiting = message.id === undefined ? undefined : this.pending.get(message.id);
      if (!waiting) return;
      this.pending.delete(message.id!);
      if (message.ok) waiting.resolve(message.body);
      else waiting.reject(new Error(message.error ?? L(`${waiting.cmd} に失敗しました。`, `${waiting.cmd} failed.`)));
    });
    this.process.stderr!.on("data", (data: Buffer) => this.emit("log", data.toString("utf8")));
    this.process.on("error", error => { readyReject(error); this.fail(error); });
    this.process.on("exit", code => {
      readyReject(new Error(L(`e500dbg が終了しました（${code}）。`, `e500dbg exited (${code}).`)));
      this.fail(new Error(L(`e500dbg が終了しました（${code}）。`, `e500dbg exited (${code}).`)));
      this.emit("exit", code);
    });
  }

  private fail(error: Error): void {
    this.exited = true;
    for (const p of this.pending.values()) p.reject(error);
    this.pending.clear();
  }

  get alive(): boolean { return !this.exited; }

  async request<T = unknown>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
    await this.ready;
    if (this.exited) throw new Error(L("e500dbg は終了しています。", "e500dbg has exited."));
    return new Promise<T>((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve: body => resolve(body as T), reject, cmd });
      this.process.stdin!.write(JSON.stringify({ id, cmd, args }) + "\n");
    });
  }

  async open(rom: string, ram: number, card = 0): Promise<MachineInfo> {
    this.info = await this.request<MachineInfo>("open", { rom, ram, card });
    return this.info;
  }
  boot(): Promise<{ screen: string }> { return this.request("boot"); }
  registers(): Promise<Registers> { return this.request("registers"); }
  setRegister(name: string, value: number): Promise<Registers> { return this.request("setRegister", { name, value }); }
  async read(address: number, length: number): Promise<Buffer> {
    const body = await this.request<{ data: string }>("read", { address, length });
    return Buffer.from(body.data, "base64");
  }
  write(address: number, data: Uint8Array): Promise<void> { return this.request("write", { address, data: Buffer.from(data).toString("base64") }); }
  breakpoints(addresses: number[]): Promise<void> { return this.request("breakpoints", { addresses }); }
  callstack(): Promise<Frame[]> { return this.request("callstack"); }
  screen(): Promise<Screen> { return this.request("screen"); }
  disassemble(address: number, count: number, before = 0): Promise<Instruction[]> { return this.request("disassemble", { address, count, before }); }
  area(): Promise<{ start: number; size: number } | null> { return this.request("area"); }
  reserve(size: number): Promise<{ start: number; size: number }> { return this.request("reserve", { size }); }
  call(entry: number, far: boolean, registers?: Record<string, number>): Promise<{ returnAddress: number }> { return this.request("call", { entry, far, registers }); }
  run(cycles: number, options: { settle?: number; untilTyped?: boolean } = {}): Promise<RunResult> { return this.request("run", { cycles, ...options }); }
  continue(speed?: number): Promise<void> { return this.request("continue", speed === undefined ? {} : { speed }); }
  speed(speed: number): Promise<void> { return this.request("speed", { speed }); }
  pause(): Promise<void> { return this.request("pause"); }
  step(): Promise<void> { return this.request("step"); }
  stepOver(): Promise<void> { return this.request("stepOver"); }
  stepOut(): Promise<void> { return this.request("stepOut"); }
  type(text: string): Promise<{ skipped: string }> { return this.request("type", { text }); }
  tap(name: string): Promise<void> { return this.request("tap", { name }); }
  key(name: string, down: boolean): Promise<void> { return this.request("key", { name, down }); }
  releaseKeys(): Promise<void> { return this.request("releaseKeys"); }
  reset(clear = false): Promise<void> { return this.request("reset", { clear }); }
  async saveState(): Promise<string> { return (await this.request<{ data: string }>("state.save")).data; }
  loadState(data: string): Promise<void> { return this.request("state.load", { data }); }
  loadStateFile(file: string): Promise<MachineInfo> { return this.request("state.loadFile", { path: file }); }
  mode(): Promise<{ busy: boolean; run: boolean; pro: boolean }> { return this.request("mode"); }
  /** Stops when an instruction reads one of these bytes; with `after`, only one that leaves P there. */
  watchReads(addresses: number[], after?: number): Promise<void> { return this.request("watchReads", { addresses, after: after ?? -1 }); }
  /** The CE-140F with this folder as its disk (undefined: unplugged). */
  diskMount(folder: string | undefined, readOnly = false): Promise<{ status: number }> { return this.request("disk.mount", { folder: folder ?? null, readOnly }); }
  /** Internal RAM 00h-EEh. */
  writeInternalMemory(address: number, data: Uint8Array): Promise<void> { return this.request("imem.write", { address, data: Buffer.from(data).toString("base64") }); }
  async internalMemory(): Promise<Buffer> { return Buffer.from((await this.request<{ data: string }>("imem")).data, "base64"); }

  dispose(): void {
    if (this.exited) return;
    this.exited = true;
    try { this.process.stdin!.end(); } catch { /* already gone */ }
    const process = this.process;
    setTimeout(() => { if (process.exitCode === null) process.kill(); }, 1000);
  }
}
