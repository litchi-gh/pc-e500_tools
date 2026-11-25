// The values a machine-code debugger reads and changes, named the same way in VS Code's
// debug view, the panel's lists and watches and the debug view:
//   A IL BA I X Y U S P F, and the flags C and Z
//   [expr], [expr]:2, [expr]:3     memory, little-endian
//   (expr), (expr):2, (expr):3     internal RAM, as the assembler writes it; BP, PX, PY
// expr is made of numbers, registers and the program's symbols.
import { evaluate } from "../asm/expression";
import { L } from "../l10n";
import { EmulatorClient, Registers } from "./client";
import { parseNumber, Program } from "./program";

export const REGISTER_BITS: Readonly<Record<string, number>> = { A: 8, IL: 8, BA: 16, I: 16, X: 20, Y: 20, U: 20, S: 20, P: 20, F: 8 };
export const POINTERS: Readonly<Record<string, number>> = { BP: 0xec, PX: 0xed, PY: 0xee };

export type Target =
  | { readonly kind: "register"; readonly name: string }
  | { readonly kind: "memory" | "imem"; readonly address: number; readonly size: number };

/** 8 bits as 2 digits, 16 as 4, 20 as 5. */
export function hexValue(value: number, bits: number): string {
  return value.toString(16).toUpperCase().padStart(Math.ceil(bits / 4), "0") + "h";
}

/** "1234h（4660）", or "1234h (4660)" in English. */
export function hexAndDecimal(value: number, bits: number): string {
  return L(`${hexValue(value, bits)}（${value}）`, `${hexValue(value, bits)} (${value})`);
}

const registerValue = (registers: Registers, name: string): number => (registers as unknown as Record<string, number>)[name];

/** An expression of numbers, registers and the program's symbols. */
export function evaluateExpression(text: string, registers: Registers | undefined, program: Program | undefined): bigint {
  const n = parseNumber(text);
  if (n !== undefined) return BigInt(n);
  return evaluate(text.trim().replace(/&H(?=[0-9A-F])/gi, "$"), name => {
    const key = name.toUpperCase();
    if (registers && key in REGISTER_BITS) return BigInt(registerValue(registers, key));
    const v = program?.symbols.get(key);
    if (v === undefined) throw new Error(L(`${name} は変数でもレジスタでもシンボルでもありません。`, `${name} is not a variable, a register or a symbol.`));
    return v;
  }, registers?.P ?? 0);
}

/** The inside of text wholly in one pair of these brackets, and the size after it. */
function enclosed(text: string, open: string, close: string): { inner: string; size: number } | undefined {
  const m = /^(.*?)\s*(?::\s*([123]))?$/s.exec(text.trim())!;
  const s = m[1];
  if (!s.startsWith(open) || !s.endsWith(close) || s.length < 3) return undefined;
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === open) depth++;
    else if (s[i] === close && --depth === 0 && i < s.length - 1) return undefined;
  }
  return depth === 0 ? { inner: s.slice(1, -1), size: Number(m[2] ?? 1) } : undefined;
}

/** What a name or [..] or (..) stands for; undefined when it is only an expression. */
export function targetOf(text: string, registers: Registers, program: Program | undefined): Target | undefined {
  const key = text.trim().toUpperCase();
  if (key in REGISTER_BITS) return { kind: "register", name: key };
  // Not reserved words of the assembler: a program's own symbol comes first.
  if (!program?.symbols.has(key)) {
    if (key === "C" || key === "Z") return { kind: "register", name: key };
    if (key in POINTERS) return { kind: "imem", address: POINTERS[key], size: 1 };
  }
  const memory = enclosed(text, "[", "]");
  if (memory) return { kind: "memory", address: Number(evaluateExpression(memory.inner, registers, program)) & 0xfffff, size: memory.size };
  const internal = enclosed(text, "(", ")");
  if (internal) {
    const pointer = internal.inner.trim().toUpperCase();
    const at = pointer in POINTERS && !program?.symbols.has(pointer) ? POINTERS[pointer] : Number(evaluateExpression(internal.inner, registers, program));
    if (at < 0 || at + internal.size > 256) throw new Error(L("内部 RAM は 00h〜FFh です。", "Internal RAM is 00h-FFh."));
    return { kind: "imem", address: at, size: internal.size };
  }
  return undefined;
}

export function bitsOf(target: Target): number {
  return target.kind !== "register" ? target.size * 8 : REGISTER_BITS[target.name] ?? 1;
}

export async function readTarget(client: EmulatorClient, target: Target, registers: Registers): Promise<number> {
  if (target.kind === "register") {
    return target.name === "C" ? registers.F & 1 : target.name === "Z" ? (registers.F >> 1) & 1 : registerValue(registers, target.name);
  }
  const bytes = target.kind === "memory" ? await client.read(target.address, target.size) : (await client.internalMemory()).subarray(target.address, target.address + target.size);
  return [...bytes].reduce((v, b, i) => v + b * 2 ** (8 * i), 0);
}

/** A value as typed over what a list shows: a number, "FFh", "40h（64）", or an expression. */
function typedValue(text: string, registers: Registers, program: Program | undefined): number {
  const shown = /^\s*([0-9A-F]+h|\d+)\s*[（(]-?\d+[）)].*$/i.exec(text);
  const s = (shown ? shown[1] : text).trim();
  if (s === "") throw new Error(L("値がありません。", "There is no value."));
  const plain = parseNumber(s);
  if (plain !== undefined) return plain;
  const hex = /^([0-9A-F]+)h$/i.exec(s);
  if (hex && !program?.symbols.has(s.toUpperCase())) return parseInt(hex[1], 16);
  return Number(evaluateExpression(s, registers, program));
}

/** The value in that many bits; a negative one as two's complement. An Error when it does not fit. */
function fit(value: number, bits: number): number {
  const limit = 2 ** bits;
  if (!Number.isInteger(value) || value >= limit || value < -limit / 2) {
    throw new Error(L(`${bits} ビットに入りません（0〜${hexValue(limit - 1, bits)}）: ${value}`, `Does not fit in ${bits} bits (0 to ${hexValue(limit - 1, bits)}): ${value}`));
  }
  return value < 0 ? value + limit : value;
}

function mustBeStopped(client: EmulatorClient): void {
  if (client.running) throw new Error(L("止めているときだけ書き換えられます。", "Values can be changed only while it is stopped."));
}

/** Sets a register, flag, memory or internal RAM, and returns the value it then has. */
export async function writeTarget(client: EmulatorClient, target: Target, typed: string, program: Program | undefined): Promise<number> {
  mustBeStopped(client);
  const registers = await client.registers();
  const bits = bitsOf(target);
  const value = typedValue(typed, registers, program);
  if (target.kind === "register") {
    if (target.name === "C" || target.name === "Z") {
      const flag = target.name === "C" ? 1 : 2;
      if (value !== 0 && value !== 1) throw new Error(L("フラグは 0 か 1 です。", "A flag is 0 or 1."));
      await client.setRegister("F", value ? registers.F | flag : registers.F & ~flag);
    } else await client.setRegister(target.name, fit(value, bits));
  } else {
    let rest = fit(value, bits);
    const bytes = new Uint8Array(target.size);
    for (let i = 0; i < target.size; i++) { bytes[i] = rest & 0xff; rest = Math.floor(rest / 256); }
    if (target.kind === "memory") await client.write(target.address, bytes);
    else await client.writeInternalMemory(target.address, bytes);
  }
  return readTarget(client, target, await client.registers());
}

/** Bytes as typed over a label's: 03 04 FF (hexadecimal), or "text". */
export function parseBytes(typed: string): Uint8Array {
  const s = typed.trim().replace(/^[0-9A-F]{5}h:\s*/i, "");
  const quoted = /^"(.*)"$/s.exec(s);
  if (quoted) {
    const codes = [...quoted[1]].map(c => c.charCodeAt(0));
    if (codes.length === 0 || codes.some(c => c < 0x20 || c > 0x7e)) throw new Error(L("文字列は半角の英数字と記号だけです。", "Text must be printable ASCII."));
    return Uint8Array.from(codes);
  }
  const parts = s.split(/[\s,]+/).filter(p => p !== "").map(p => /^(?:\$|&H?|0x)?([0-9A-F]{1,2})h?$/i.exec(p));
  if (parts.length === 0 || parts.some(p => !p)) throw new Error(L("バイトは 03 04 FF のように 16 進で、文字は \"ABC\" のように書きます。", "Write bytes in hexadecimal, 03 04 FF, or text as \"ABC\"."));
  return Uint8Array.from(parts.map(p => parseInt(p![1], 16)));
}

/** Writes bytes at a label of the program. */
export async function writeLabel(client: EmulatorClient, program: Program, name: string, typed: string): Promise<void> {
  mustBeStopped(client);
  const label = program.labels.find(([n]) => n === name.toUpperCase());
  if (!label) throw new Error(L(`ラベル ${name} はありません。`, `There is no label ${name}.`));
  await client.write(label[1], parseBytes(typed));
}
