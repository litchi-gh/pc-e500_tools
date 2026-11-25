// What the emulator panel's variables and watch lists show: read from the running
// machine (between its slices, so it does not have to be stopped).
// - BASIC's variables from RAM (src/emu/basic.ts), whatever program is running;
// - the CPU registers; with an assembly program being debugged, its labels;
// - a watch expression: a BASIC variable (A, B$, P(1)), a register, [address] or
//   (address) for memory and internal RAM (:2 and :3 for more bytes), or an expression of
//   numbers and the program's symbols (src/emu/asmValues.ts).
import { bitsOf, evaluateExpression, hexAndDecimal, hexValue, POINTERS, readTarget, REGISTER_BITS, Target, targetOf, writeLabel, writeTarget } from "./asmValues";
import { BasicVariable, findVariable, isShown, readBasicVariables } from "./basic";
import { EmulatorClient } from "./client";
import { hex5, Program } from "./program";
import { L } from "../l10n";

export interface InspectRow {
  readonly name: string;
  readonly value: string;
  readonly children?: readonly InspectRow[];
  /** How it can be changed, if it can. */
  readonly edit?: EditKind;
  /** What Inspector.set is given for it, when not its name. */
  readonly target?: string;
}

/**
 * "basic": a BASIC variable, while its program is stopped at a line; "asm": a register
 * or internal RAM, while stopped and no BASIC program is being debugged (its interpreter
 * is using them); "memory": memory, while stopped.
 */
export type EditKind = "basic" | "asm" | "memory";

export interface InspectGroup {
  /** Stays the same in every language: the panel keeps a group open or closed by it. */
  readonly id: "basic" | "registers" | "labels";
  readonly title: string;
  readonly rows: readonly InspectRow[];
  /** Shown closed at first. */
  readonly closed?: boolean;
}

const REGISTERS = Object.keys(REGISTER_BITS);

export class Inspector {
  constructor(private readonly client: EmulatorClient, private readonly program?: Program) {}

  private basic(): Promise<{ variables: BasicVariable[]; letters: Set<string> }> {
    return readBasicVariables((a, n) => this.client.read(a, n), this.client.info?.internalKB ?? 32);
  }

  async groups(): Promise<InspectGroup[]> {
    const groups: InspectGroup[] = [];
    const { variables, letters } = await this.basic();
    const row = (v: BasicVariable): InspectRow => v.kind === "array"
      ? { name: v.name, value: `${v.name.replace("()", "")}${v.value}`, children: (v.elements ?? []).map(e => ({ name: v.name.replace("()", "") + e.index, value: e.value, edit: "basic" as const })) }
      : { name: v.name, value: v.value, edit: "basic" };
    const own = variables.filter(v => isShown(v, letters));
    groups.push({ id: "basic", title: L("BASIC の変数", "BASIC variables"), rows: own.length ? own.map(row) : [{ name: "", value: L("（まだありません）", "(none yet)") }] });
    const [r, imem] = await Promise.all([this.client.registers(), this.client.internalMemory()]);
    const low = (name: string, value: string): InspectRow => ({ name, value, edit: "asm" });
    groups.push({
      id: "registers", title: L("レジスタ", "Registers"), closed: true,
      rows: [
        ...REGISTERS.map(n => low(n, hexValue((r as unknown as Record<string, number>)[n], REGISTER_BITS[n]))), low("C", String(r.F & 1)), low("Z", String((r.F >> 1) & 1)),
        ...Object.entries(POINTERS).map(([n, at]) => low(n, hexValue(imem[at], 8)))
      ]
    });
    if (this.program && this.program.labels.length) {
      const rows: InspectRow[] = [];
      for (const [name, address] of this.program.labels) {
        const bytes = await this.client.read(address, 4);
        rows.push({ name, value: `${hex5(address)}h: ${[...bytes].map(b => b.toString(16).toUpperCase().padStart(2, "0")).join(" ")}`, edit: "memory", target: `label ${name}` });
      }
      groups.push({ id: "labels", title: L("ラベル", "Labels"), rows, closed: true });
    }
    return groups;
  }

  // A BASIC variable or an element of an array, by name as written in BASIC. While an
  // assembly program is debugged, A, X ... are its registers first.
  private isBasicName(text: string): boolean {
    const name = text.toUpperCase().replace(/\s+/g, "");
    const asmName = !!this.program && (name in REGISTER_BITS || name in POINTERS || name === "C" || name === "Z" || this.program.symbols.has(name));
    return !asmName && /^[A-Z][A-Z0-9]*[#$]?(\(.+\))?$/.test(name);
  }

  /** A watch expression's value, or an Error with why not. */
  async evaluate(expression: string): Promise<string> {
    return (await this.watch(expression)).value;
  }

  /** A watch expression's value and how it can be changed. */
  async watch(expression: string): Promise<{ value: string; edit?: EditKind }> {
    const text = expression.trim();
    if (!text) throw new Error(L("式がありません。", "There is no expression."));
    if (this.isBasicName(text)) {
      const found = findVariable((await this.basic()).variables, text);
      if (found) return { value: found.value, edit: "basic" };
      if (/[#$]$|\)$/.test(text)) throw new Error(L(`変数 ${text} はまだありません。`, `There is no variable ${text} yet.`));
    }
    const registers = await this.client.registers();
    const target = targetOf(text, registers, this.program);
    if (target) {
      const shown = hexAndDecimal(await readTarget(this.client, target, registers), bitsOf(target));
      return { value: shown + (target.kind === "memory" ? `  @${hex5(target.address)}` : ""), edit: target.kind === "memory" ? "memory" : "asm" };
    }
    const n = Number(evaluateExpression(text, registers, this.program));
    return { value: n < 0 ? L(`${n}（${n}）`, `${n} (${n})`) : hexAndDecimal(n, n > 0xffff ? 20 : n > 0xff ? 16 : 8) };
  }

  /** Sets what a row or a watch names: a register, [..], (..), or "label NAME" (bytes). */
  async set(name: string, typed: string): Promise<void> {
    const label = /^label (.+)$/.exec(name);
    if (label && this.program) { await writeLabel(this.client, this.program, label[1], typed); return; }
    const target: Target | undefined = targetOf(name, await this.client.registers(), this.program);
    if (!target) throw new Error(L(`${name} は書き換えられません。メモリは [${name}] と書きます。`, `${name} cannot be changed. Write [${name}] for the memory there.`));
    await writeTarget(this.client, target, typed, this.program);
  }
}
