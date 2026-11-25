// Running and stopping a BASIC program in the emulator, line by line.
//
// The program is loaded as the machine would load it, LOAD "X:NAME.BAS" from the
// CE-140F, so the ROM itself turns the text into tokens. A line is caught as the
// interpreter starts it: the first thing it does is read the line's first token,
// always from one place in the ROM (F5EDAh after the read in ROM 7.2, F5778h in the
// PC-E650's 8.5). That place is learnt on the first line of RUN and then only reads
// from there stop the machine, so the other reads of a line (the rest of the
// statement, READ looking for DATA, LIST) go by. Nothing in the program is changed
// and nothing is shown on the LCD.
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { BasicLine, BasicVariable, driveName, encodeSource, encodeValue, findVariable, parseProgram, readBasicVariables } from "./basic";
import { EmulatorClient, Stopped } from "./client";
import { L } from "../l10n";

const CPU_HZ = 768000;

export class BasicSession {
  private dispatch?: number;
  private stepping = false;
  /** A pause asked for and not reached yet. */
  private pausing?: object;
  private breakAt = new Set<number>();
  private folder?: string;

  private constructor(readonly client: EmulatorClient, readonly name: string, readonly lines: BasicLine[]) {}

  /**
   * LOADs the source through the CE-140F (a folder of its own in the temp directory)
   * at BASIC's prompt and reads where the ROM put each line.
   */
  static async load(client: EmulatorClient, fileName: string, source: string, log: (text: string) => void = () => undefined): Promise<BasicSession> {
    const { bytes, unsupported, skipped } = encodeSource(source);
    if (unsupported) log(L(`本体の文字にない文字があるため省きました: ${unsupported}`, `Left out characters the machine does not have: ${unsupported}`));
    if (skipped) log(L(`行番号のない行を ${skipped} 行省きました。`, `Left out ${skipped} line(s) with no line number.`));
    const name = driveName(fileName);
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), "pce500-basic-"));
    fs.writeFileSync(path.join(folder, name), bytes);
    try {
      await client.diskMount(folder);
      await client.tap("C-CE");
      await client.type(`LOAD "X:${name}"\n`);
      await client.run(CPU_HZ * 30, { untilTyped: true, settle: CPU_HZ });
      for (let i = 0; i < 60 && (await client.mode()).busy; i++) await client.run(CPU_HZ / 2);
      const screen = (await client.screen()).text ?? "";
      if (/error/i.test(screen.split("\n").slice(-2).join(" "))) throw new Error(L(`LOAD でエラーになりました。画面:\n${screen}`, `LOAD failed with an error. Screen:\n${screen}`));
      const lines = await BasicSession.readLines(client);
      if (lines.length === 0) throw new Error(L(`プログラムを読み込めませんでした。画面:\n${screen}`, `The program could not be loaded. Screen:\n${screen}`));
      const session = new BasicSession(client, name, lines);
      session.folder = folder;
      log(L(`${name} を CE-140F から読み込みました（${lines.length} 行）。`, `Loaded ${name} from the CE-140F (${lines.length} lines).`));
      return session;
    } catch (error) {
      fs.rmSync(folder, { recursive: true, force: true });
      throw error;
    }
  }

  /** The lines of the program in RAM, from the program block the ROM points at (internal RAM CBh). */
  static async readLines(client: EmulatorClient): Promise<BasicLine[]> {
    const imem = await client.internalMemory();
    const block = imem[0xcb] | imem[0xcc] << 8 | imem[0xcd] << 16;
    const head = await client.read(block, 0x22);
    const used = head[0x16] | head[0x17] << 8 | head[0x18] << 16;
    if (head[0] !== 0xfb || used < 0x36 || used > 0x40000) return [];
    return parseProgram(await client.read(block, used), block);
  }

  /** The variables now, from the DATA block of the chain. */
  async variables(): Promise<BasicVariable[]> {
    return (await this.variablesAndLetters()).variables;
  }

  /** The variables and the letters A-Z the program uses (what a list shows: isShown). */
  variablesAndLetters(): Promise<{ variables: BasicVariable[]; letters: Set<string>; address: number }> {
    return readBasicVariables((a, n) => this.client.read(a, n), this.client.info?.internalKB ?? 32);
  }

  /**
   * Sets a variable or array element where it is in RAM. For a program stopped at the
   * start of a line: there the interpreter is not in the middle of using one.
   */
  async setVariable(name: string, typed: string): Promise<string> {
    const { variables, address } = await this.variablesAndLetters();
    const found = findVariable(variables, name);
    if (!found?.place) throw new Error(L(`変数 ${name} はまだありません。`, `There is no variable ${name} yet.`));
    const bytes = encodeValue(found.place, typed);
    if (bytes.length) await this.client.write(address + found.place.offset, bytes);
    return findVariable((await this.variablesAndLetters()).variables, name)?.value ?? "";
  }

  /** The line whose first token is at `address`. */
  lineAt(address: number | undefined): BasicLine | undefined {
    return address === undefined ? undefined : this.lines.find(l => l.first === address);
  }

  lineNumbered(number: number): BasicLine | undefined {
    return this.lines.find(l => l.number === number);
  }

  /** Breakpoints by BASIC line number; the ones the program has. */
  async setBreakpoints(numbers: Iterable<number>): Promise<number[]> {
    this.breakAt = new Set([...numbers].filter(n => this.lineNumbered(n)));
    if (!this.stepping) await this.arm();
    return [...this.breakAt];
  }

  private async arm(): Promise<void> {
    const lines = this.stepping ? this.lines : this.lines.filter(l => this.breakAt.has(l.number));
    await this.client.watchReads(lines.map(l => l.first), this.dispatch);
  }

  /**
   * Types RUN and runs as fast as it goes to the start of the first line, where the
   * ROM's place for starting a line is learnt. The machine is left stopped there.
   */
  async runToFirstLine(): Promise<BasicLine> {
    const first = this.lines[0];
    await this.client.watchReads([first.first]);
    await this.client.tap("C-CE");
    await this.client.type("RUN\n");
    const result = await this.client.run(CPU_HZ * 20);
    if (result.reason !== "read" || result.address !== first.first) {
      const screen = (await this.client.screen()).text ?? "";
      throw new Error(L(`RUN で最初の行 ${first.number} に着きませんでした（${result.reason}）。画面:\n${screen}`, `RUN did not reach the first line ${first.number} (${result.reason}). Screen:\n${screen}`));
    }
    this.dispatch = result.pc;
    await this.arm();
    return first;
  }

  /** The ROM's place where a line starts (after the reading instruction), once learnt. */
  get dispatchAddress(): number | undefined { return this.dispatch; }

  /** Runs on in real time; the next breakpoint line stops it (a "stopped" event). */
  async continue(speed?: number): Promise<void> {
    this.pausing = undefined;
    this.stepping = false;
    await this.arm();
    await this.client.continue(speed);
  }

  /** Runs to the start of the next line that runs, whichever it is. */
  async step(speed?: number): Promise<void> {
    this.pausing = undefined;
    this.stepping = true;
    await this.arm();
    await this.client.continue(speed);
  }

  /** Called with the server's stop: the line it stopped at (watches back to the breakpoints). */
  async stopped(stop: Stopped): Promise<BasicLine | undefined> {
    const wasStepping = this.stepping;
    this.pausing = undefined;
    this.stepping = false;
    if (wasStepping) await this.arm();
    return stop.reason === "read" ? this.lineAt(stop.address) : undefined;
  }

  /**
   * Stops at the start of the next line. While the program runs (BUSY is on, also in
   * a long BEEP, WAIT or INPUT) that is waited for; with none running it stops where
   * it is. Asked again while waiting, it stops at once, in the middle of the line.
   */
  async pause(): Promise<void> {
    const client = this.client;
    if (this.pausing) { await client.pause(); return; }
    const asked = this.pausing = {};
    this.stepping = true;
    await this.arm();
    // Off twice running: a moment between two lines does not count.
    let off = 0;
    const watch = async (): Promise<void> => {
      if (this.pausing !== asked || !client.alive || !client.running) return;
      off = (await client.mode()).busy ? 0 : off + 1;
      if (this.pausing !== asked || !client.running) return;
      if (off >= 2) await client.pause();
      else setTimeout(() => void watch().catch(() => undefined), 200);
    };
    setTimeout(() => void watch().catch(() => undefined), 200);
  }

  dispose(): void {
    if (this.folder) fs.rmSync(this.folder, { recursive: true, force: true });
    this.folder = undefined;
  }
}
