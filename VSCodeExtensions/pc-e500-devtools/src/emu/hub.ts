// The machine the emulator panel shows: a debug session's, or one started on its own.
import * as vscode from "vscode";
import { EmulatorClient } from "./client";
import { Program } from "./program";

export interface Attached {
  readonly client: EmulatorClient;
  /** Shown in the panel's title bar ("デバッグ: sum.asm"). */
  readonly label: string;
  /** Whether a debug session owns it (then the panel's run/pause go through the debugger). */
  readonly debugging: boolean;
  /** The assembly program being debugged (its labels in the panel's lists and watches). */
  readonly program?: Program;
  /** Changes BASIC variables, while a BASIC program is stopped at the start of a line. */
  readonly editor?: VariableEditor;
  /** How the panel pauses it, when not just by stopping the CPU (a BASIC program: at its next line). */
  readonly pause?: () => Promise<void>;
  /** A register or memory was changed from a panel: the debugger's own lists are out of date. */
  readonly changed?: () => void;
}

export interface VariableEditor {
  canEdit(): boolean;
  set(name: string, typed: string): Promise<string>;
}

export class MachineHub implements vscode.Disposable {
  private attached?: Attached;
  /** Debug sessions that were shown before the one that is: shown again when it ends. */
  private readonly behind: Attached[] = [];
  private readonly changed = new vscode.EventEmitter<Attached | undefined>();
  readonly onDidChange = this.changed.event;

  get current(): Attached | undefined { return this.attached; }

  attach(value: Attached): void {
    // A machine of the panel's own does not take the place of a debug session that began while it was starting.
    if (!value.debugging && this.attached?.debugging && this.attached.client.alive) { value.client.dispose(); return; }
    if (this.attached && this.attached.client !== value.client) {
      if (this.attached.debugging) this.behind.push(this.attached);
      else this.attached.client.dispose();
    }
    this.attached = value;
    this.changed.fire(value);
  }

  /** Forgets the client if it is the current one. */
  detach(client: EmulatorClient): void {
    if (this.attached?.client !== client) {
      const at = this.behind.findIndex(b => b.client === client);
      if (at >= 0) this.behind.splice(at, 1);
      return;
    }
    do this.attached = this.behind.pop(); while (this.attached && !this.attached.client.alive);
    this.changed.fire(this.attached);
  }

  dispose(): void {
    if (this.attached && !this.attached.debugging) this.attached.client.dispose();
    this.changed.dispose();
  }
}
