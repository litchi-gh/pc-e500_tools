// What a word in an assembly source is: an instruction or directive, a register, or a
// name of the program.
import { L } from "../l10n";
import { DIRECTIVES } from "./assembler";
import { nameAt, Span } from "./definition";
import { INSTRUCTIONS } from "./instructions";

/** What the instructions do, d the first operand and s the second. */
export const OPERATIONS: Readonly<Record<string, string>> = {
  MV: "d ← s", MVW: "d ← s (2 bytes)", MVP: "d ← s (3 bytes)", MVL: "d ← s (I bytes, ++)", MVLD: "d ← s (I bytes, --)",
  EX: "d ↔ s", EXW: "d ↔ s (2 bytes)", EXP: "d ↔ s (3 bytes)", EXL: "d ↔ s (I bytes)", SWAP: "A7-4 ↔ A3-0",
  ADD: "d ← d + s", SUB: "d ← d - s", ADC: "d ← d + s + C", SBC: "d ← d - s - C",
  ADCL: "d ← d + s + C (I bytes)", SBCL: "d ← d - s - C (I bytes)", DADL: "d ← d + s + C (BCD, I bytes)", DSBL: "d ← d - s - C (BCD, I bytes)",
  INC: "d ← d + 1", DEC: "d ← d - 1", PMDF: "d ← d + s", AND: "d ← d ∧ s", OR: "d ← d ∨ s", XOR: "d ← d ⊻ s", TEST: "d ∧ s → Z",
  CMP: "d - s → C, Z", CMPW: "d - s → C, Z (2 bytes)", CMPP: "d - s → C, Z (3 bytes)", SC: "C ← 1", RC: "C ← 0",
  ROR: "→ 7 6 5 4 3 2 1 0 → 7, C", ROL: "C, 0 ← 7 6 5 4 3 2 1 0 ←", SHR: "C → 7 6 5 4 3 2 1 0 → C", SHL: "C ← 7 6 5 4 3 2 1 0 ← C",
  JP: "PC ← d", JPZ: "Z = 1: PC ← d", JPNZ: "Z = 0: PC ← d", JPC: "C = 1: PC ← d", JPNC: "C = 0: PC ← d", JPF: "PS, PC ← d",
  JR: "PC ← PC ± n", JRZ: "Z = 1: PC ← PC ± n", JRNZ: "Z = 0: PC ← PC ± n", JRC: "C = 1: PC ← PC ± n", JRNC: "C = 0: PC ← PC ± n"
};

/** The registers, with what they hold. */
export const REGISTERS: Readonly<Record<string, { readonly ja: string; readonly en: string }>> = {
  A: { ja: "アキュムレータ（8 ビット、BA の下位）", en: "Accumulator (8 bits, the low half of BA)" },
  B: { ja: "8 ビット（BA の上位）", en: "8 bits (the high half of BA)" },
  BA: { ja: "16 ビット（B と A）", en: "16 bits (B and A)" },
  IL: { ja: "8 ビット（I の下位）。書くと IH は 0 になる", en: "8 bits (the low half of I). Writing it clears IH" },
  I: { ja: "16 ビット。I バイト転送などの回数", en: "16 bits. The count of the block instructions" },
  X: { ja: "アドレスを指す 20 ビット", en: "20 bits, for addresses" },
  Y: { ja: "アドレスを指す 20 ビット", en: "20 bits, for addresses" },
  U: { ja: "U スタックのアドレス（20 ビット）。PUSHU / POPU が使う", en: "The U stack's address (20 bits), used by PUSHU / POPU" },
  S: { ja: "S スタックのアドレス（20 ビット）。CALL と割り込みが使う", en: "The S stack's address (20 bits), used by CALL and interrupts" },
  F: { ja: "フラグ（ビット 0 = C、ビット 1 = Z）", en: "Flags (bit 0 = C, bit 1 = Z)" },
  IMR: { ja: "割り込みマスク（内部 RAM の FBh）。ビット 7 が全体の許可", en: "Interrupt mask (FBh of internal RAM). Bit 7 enables them all" },
  BP: { ja: "内部 RAM のベースポインタ（ECh）", en: "Base pointer of internal RAM (ECh)" },
  PX: { ja: "内部 RAM のポインタ（EDh）", en: "Pointer of internal RAM (EDh)" },
  PY: { ja: "内部 RAM のポインタ（EEh）", en: "Pointer of internal RAM (EEh)" }
};

export interface AsmWord extends Span {
  readonly kind: "instruction" | "directive" | "register" | "name";
  /** In capitals, without a directive's dot; a name as it is written. */
  readonly name: string;
}

/** The word at a column of a line, outside strings, comments and numbers. */
export function asmWordAt(line: string, column: number): AsmWord | undefined {
  const at = nameAt(line, column);
  if (!at) return undefined;
  const upper = at.name.toUpperCase();
  const ahead = line.slice(0, at.start), after = line.slice(at.end);
  // The first word is an instruction unless it is being defined: "name:", "name EQU".
  const first = /^\s*(?:[A-Za-z_.][A-Za-z_0-9.]*\s*:\s*)?$/.test(ahead);
  const defined = first && /^\s*(?::|=|\.?EQU\b)/i.test(after) && (ahead.trim() === "" || !ahead.includes(":"));
  if (first && !defined) {
    if (Object.hasOwn(INSTRUCTIONS, upper)) return { kind: "instruction", name: upper, start: at.start, end: at.end };
    const bare = upper.replace(/^\./, "");
    if (DIRECTIVES.has(bare)) return { kind: "directive", name: bare, start: at.start, end: at.end };
  }
  // "name EQU 10".
  if (/^\.?EQU$/.test(upper) && /^\s*[A-Za-z_.][A-Za-z_0-9.]*\s+$/.test(ahead)) return { kind: "directive", name: "EQU", start: at.start, end: at.end };
  if (!first && Object.hasOwn(REGISTERS, upper)) return { kind: "register", name: upper, start: at.start, end: at.end };
  return { kind: "name", name: at.name, start: at.start, end: at.end };
}

/** A register's explanation. */
export function registerText(name: string): string {
  return L(REGISTERS[name].ja, REGISTERS[name].en);
}
