// The debugger for PC-E500 BASIC (.bas): the program is LOADed through the CE-140F
// and stopped at the start of BASIC lines (src/emu/basicSession.ts). The call stack
// is the line running; the variables are read from RAM as BASIC keeps them.
import * as path from "node:path";
import * as vscode from "vscode";
import { BasicVariable, isShown, sourceLineNumbers } from "../emu/basic";
import { BasicSession } from "../emu/basicSession";
import { EmulatorClient, Stopped } from "../emu/client";
import { machineConfig } from "../emu/config";
import { MachineHub } from "../emu/hub";
import { startMachine } from "../emu/prepare";
import { L } from "../l10n";

export interface BasicLaunchArguments {
  program: string;
  /** Stop at the first line after RUN (false by default: on to the first breakpoint). */
  stopOnEntry?: boolean;
  rom?: string;
  ram?: number;
  state?: string;
  speed?: number;
  noDebug?: boolean;
}

type Message = { seq: number; type: string; command?: string; arguments?: any; event?: string; body?: unknown; request_seq?: number };

const THREAD = 1, VARIABLES = 1, ARRAYS = 1000;

export class BasicDebugAdapter implements vscode.DebugAdapter {
  private readonly sent = new vscode.EventEmitter<vscode.DebugProtocolMessage>();
  readonly onDidSendMessage = this.sent.event;
  private seq = 1;
  private client?: EmulatorClient;
  private session?: BasicSession;
  private args?: BasicLaunchArguments;
  private file = "";
  /** The BASIC line number each line of the source starts with. */
  private numbers: Array<number | undefined> = [];
  private ready: Promise<BasicSession | undefined>;
  private setReady!: (s: BasicSession | undefined) => void;
  private configured: Promise<void>;
  private setConfigured!: () => void;
  private wanted: number[] = [];
  private current?: number;
  private stepping = false;
  private pausing = false;
  private lastVariables: BasicVariable[] = [];
  private lastLetters: ReadonlySet<string> = new Set();
  private ended = false;

  constructor(private readonly hub: MachineHub, private readonly extensionPath: string, private readonly showPanel: () => void) {
    this.ready = new Promise(resolve => { this.setReady = resolve; });
    this.configured = new Promise(resolve => { this.setConfigured = resolve; });
  }

  handleMessage(message: vscode.DebugProtocolMessage): void {
    const m = message as Message;
    if (m.type !== "request" || !m.command) return;
    void this.dispatch(m).catch(error => this.respond(m, false, undefined, error instanceof Error ? error.message : String(error)));
  }
  private send(message: Omit<Message, "seq">): void { this.sent.fire({ ...message, seq: this.seq++ } as vscode.DebugProtocolMessage); }
  private respond(request: Message, success = true, body?: unknown, message?: string): void {
    this.send({ type: "response", request_seq: request.seq, command: request.command, success, body, ...(message ? { message } : {}) } as Omit<Message, "seq">);
  }
  private event(event: string, body?: unknown): void { this.send({ type: "event", event, body }); }
  private log(text: string, category = "console"): void { this.event("output", { category, output: text.endsWith("\n") ? text : text + "\n" }); }
  private get basic(): BasicSession {
    if (!this.session || !this.client?.alive) throw new Error(L("プログラムが動いていません。", "The program is not running."));
    return this.session;
  }
  private get speed(): number { return this.args?.speed ?? vscode.workspace.getConfiguration("pcE500").get<number>("speed", 1); }

  private async dispatch(request: Message): Promise<void> {
    const a = request.arguments ?? {};
    switch (request.command) {
      case "initialize":
        this.respond(request, true, { supportsConfigurationDoneRequest: true, supportsEvaluateForHovers: true, supportsTerminateRequest: true, supportsSetVariable: true, supportsSetExpression: true });
        this.event("initialized");
        return;
      case "launch": return this.launch(request, a as BasicLaunchArguments);
      case "configurationDone": this.setConfigured(); this.respond(request); return;
      case "setBreakpoints": return this.setBreakpoints(request, a);
      case "setExceptionBreakpoints": this.respond(request, true, { breakpoints: [] }); return;
      case "threads": this.respond(request, true, { threads: [{ id: THREAD, name: "BASIC" }] }); return;
      case "stackTrace": {
        const editorLine = this.current === undefined ? -1 : this.numbers.indexOf(this.current);
        const frame = this.current === undefined
          ? { id: 1, name: L("BASIC の行の外（プロンプトや入力待ちなど）", "Outside BASIC lines (prompt, waiting for input ...)"), line: 0, column: 0, presentationHint: "subtle" }
          : { id: 1, name: L(`${this.current} 行`, `Line ${this.current}`), line: editorLine + 1, column: 1, ...(editorLine >= 0 ? { source: { name: path.basename(this.file), path: this.file } } : {}) };
        this.respond(request, true, { stackFrames: [frame], totalFrames: 1 });
        return;
      }
      case "scopes":
        this.respond(request, true, { scopes: [
          { name: L("変数", "Variables"), variablesReference: VARIABLES, presentationHint: "locals", expensive: false }
        ] });
        return;
      case "variables": return this.variables(request, a.variablesReference);
      case "setVariable": {
        const value = await this.setVariable(String(a.name ?? ""), String(a.value ?? ""));
        this.respond(request, true, { value });
        return;
      }
      case "setExpression": {
        const value = await this.setVariable(String(a.expression ?? ""), String(a.value ?? ""));
        this.respond(request, true, { value });
        return;
      }
      case "evaluate": return this.evaluate(request, String(a.expression ?? ""), a.context);
      case "continue":
        this.respond(request, true, { allThreadsContinued: true });
        this.stepping = false;
        await this.basic.continue(this.speed);
        return;
      case "next":
      case "stepIn":
        this.respond(request);
        this.stepping = true;
        await this.basic.step(this.speed);
        return;
      case "stepOut":
        // A GOSUB's return is not followed: on to the next breakpoint.
        this.respond(request);
        this.stepping = false;
        await this.basic.continue(this.speed);
        return;
      case "pause":
        this.respond(request);
        await this.pause();
        return;
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

  private async launch(request: Message, args: BasicLaunchArguments): Promise<void> {
    this.args = args;
    try {
      if (!args.program) throw new Error(L("launch.json の program に BASIC のファイルを指定してください。", "Set program in launch.json to a BASIC file."));
      this.file = path.resolve(args.program);
      const uri = vscode.Uri.file(this.file);
      const source = (await vscode.workspace.openTextDocument(uri)).getText();
      this.numbers = sourceLineNumbers(source);
      const config = machineConfig(this.extensionPath, uri, { rom: args.rom, ram: args.ram, state: args.state });
      const client = await startMachine(config, text => this.log(text));
      // Ended while it was starting: nothing else will stop it.
      if (this.ended) { client.dispose(); return; }
      this.client = client;
      client.on("stopped", (stop: Stopped) => void this.onStopped(stop));
      client.on("continued", () => { this.current = undefined; });
      client.on("continued", () => this.event("continued", { threadId: THREAD, allThreadsContinued: true }));
      client.on("exit", () => this.end(true));
      client.on("log", (text: string) => this.log(text, "stderr"));
      const session = await BasicSession.load(client, path.basename(this.file), source, text => this.log(text));
      if (this.ended) { session.dispose(); return; }
      this.session = session;
      this.setReady(session);
      this.hub.attach({ client, label: L(`デバッグ: ${path.basename(this.file)}`, `Debugging: ${path.basename(this.file)}`), debugging: true, pause: () => this.pause(), changed: () => {
        this.lastVariables = [];
        this.event("invalidated", { areas: ["variables"] });
      }, editor: {
        canEdit: () => this.canEdit(),
        set: async (name, typed) => {
          const value = await this.setVariable(name, typed);
          // The debugger's own lists show the new value too.
          this.event("invalidated", { areas: ["variables"] });
          return value;
        }
      } });
      if (vscode.workspace.getConfiguration("pcE500").get<boolean>("openPanelOnDebug", true)) this.showPanel();

      await this.configured;
      this.respond(request);
      const first = await session.runToFirstLine();
      this.log(L(`RUN しました（ROM の行の始まり ${session.dispatchAddress?.toString(16).toUpperCase()}h）。`, `RUN started (the ROM starts lines at ${session.dispatchAddress?.toString(16).toUpperCase()}h).`));
      if (args.noDebug) await session.setBreakpoints([]); else await session.setBreakpoints(this.wanted);
      if (args.stopOnEntry === true && !args.noDebug) {
        this.current = first.number;
        this.event("stopped", { reason: "entry", threadId: THREAD, allThreadsStopped: true });
      } else {
        await session.continue(this.speed);
      }
    } catch (error) {
      this.setReady(this.session);
      this.respond(request, false, undefined, error instanceof Error ? error.message : String(error));
      this.end(true);
    }
  }

  private async onStopped(stop: Stopped): Promise<void> {
    if (!this.session) return;
    const line = await this.session.stopped(stop);
    const stepping = this.stepping, pausing = this.pausing;
    this.stepping = false;
    this.pausing = false;
    this.lastVariables = [];
    this.current = line?.number;
    if (stop.reason === "exception") {
      this.event("stopped", { reason: "exception", description: L("未定義命令で停止しました", "Stopped on an undefined instruction"), threadId: THREAD, allThreadsStopped: true });
      return;
    }
    if (stop.reason === "pause" || !line) {
      this.event("stopped", { reason: "pause", threadId: THREAD, allThreadsStopped: true });
      return;
    }
    this.event("stopped", { reason: pausing ? "pause" : stepping ? "step" : "breakpoint", threadId: THREAD, allThreadsStopped: true });
  }

  // A breakpoint goes on the BASIC line that starts on that editor line or below it.
  private async setBreakpoints(request: Message, a: { source: { path?: string }; breakpoints?: Array<{ line: number }> }): Promise<void> {
    const session = await this.ready;
    const same = !!a.source.path && !!this.file && path.resolve(a.source.path).toLowerCase() === this.file.toLowerCase();
    const result: unknown[] = [];
    const numbers: number[] = [];
    for (const bp of a.breakpoints ?? []) {
      let at = bp.line - 1;
      while (at < this.numbers.length && this.numbers[at] === undefined) at++;
      const number = this.numbers[at];
      const known = number !== undefined && (!session || session.lineNumbered(number));
      if (same && known) {
        numbers.push(number!);
        result.push({ verified: true, line: at + 1 });
      } else {
        result.push({ verified: false, line: bp.line, message: same ? L("この行より後に BASIC の行がありません。", "No BASIC line at or after this line.") : L("デバッグ中のプログラムのファイルではありません。", "This is not the file of the program being debugged.") });
      }
    }
    if (same) {
      this.wanted = numbers;
      if (session && this.client?.alive && session.dispatchAddress !== undefined && !this.args?.noDebug) await session.setBreakpoints(numbers);
    }
    this.respond(request, true, { breakpoints: result });
  }

  // The debugger's pause and the panel's: at the next line.
  private async pause(): Promise<void> {
    this.pausing = true;
    await this.basic.pause();
  }

  // Only at the start of a line: elsewhere the interpreter may be using the variable.
  private canEdit(): boolean {
    return !!this.client?.alive && !this.client.running && this.current !== undefined;
  }

  private async setVariable(name: string, typed: string): Promise<string> {
    if (!this.canEdit()) throw new Error(L("変数は、ブレークポイント・ステップ・一時停止で BASIC の行の直前に止まっているときだけ書き換えられます。", "A variable can only be changed while stopped at the start of a BASIC line."));
    const value = await this.basic.setVariable(name, typed);
    this.lastVariables = [];
    return value;
  }

  private async readVariables(): Promise<BasicVariable[]> {
    if (this.lastVariables.length === 0) {
      const { variables, letters } = await this.basic.variablesAndLetters();
      this.lastVariables = variables;
      this.lastLetters = letters;
    }
    return this.lastVariables;
  }

  private async variables(request: Message, ref: number): Promise<void> {
    const all = await this.readVariables();
    const kind = (v: BasicVariable): string => v.kind === "string" ? "string" : v.kind === "array" ? "array" : "number";
    let variables: unknown[];
    if (ref >= ARRAYS) {
      const array = all[ref - ARRAYS];
      variables = (array?.elements ?? []).map(e => ({ name: array.name.replace("()", "") + e.index, value: e.value, variablesReference: 0 }));
    } else {
      variables = all.map((v, i) => ({ v, i }))
        .filter(({ v }) => isShown(v, this.lastLetters))
        .map(({ v, i }) => ({
          name: v.name, value: v.kind === "array" ? L(`${v.name.replace("()", "")}${v.value}（${v.elements?.length ?? 0} 個）`, `${v.name.replace("()", "")}${v.value} (${v.elements?.length ?? 0} elements)`) : v.value,
          type: kind(v), variablesReference: v.kind === "array" ? ARRAYS + i : 0, indexedVariables: v.elements?.length
        }));
    }
    this.respond(request, true, { variables });
  }

  // A variable by name as written in BASIC: A, XY, D#, B$, P(1), S(1,2), R$(0).
  private async evaluate(request: Message, expression: string, context?: string): Promise<void> {
    const text = expression.trim().toUpperCase().replace(/\s+/g, "");
    const all = await this.readVariables();
    const element = /^([A-Z][A-Z0-9]*[#$]?)\((.+)\)$/.exec(text);
    let value: string | undefined;
    if (element) {
      const array = all.find(v => v.kind === "array" && v.name === element[1] + "()");
      value = array?.elements?.find(e => e.index === `(${element[2]})`)?.value;
    } else {
      value = all.find(v => v.name === text && v.kind !== "array")?.value;
    }
    if (value === undefined) {
      if (context === "hover") { this.respond(request, false); return; }
      throw new Error(L(`${expression} という変数はまだありません。`, `There is no variable ${expression} yet.`));
    }
    this.respond(request, true, { result: value, variablesReference: 0 });
  }

  private end(notify: boolean): void {
    if (this.ended) return;
    this.ended = true;
    this.session?.dispose();
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

/** Whether a debug configuration's program is BASIC (by its file name). */
export function isBasicProgram(program: unknown): boolean {
  return typeof program === "string" && /\.(bas|basic|e500)$/i.test(program);
}
