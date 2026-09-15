// Port of Assembler/src/E500Assembler.Core/InstructionEncoder.cs.
// Encodes one SC62015 instruction so the linter reports exactly what e500asm would reject.
import { AssemblyError } from "./expression";

export const REGISTERS = ["A", "IL", "BA", "I", "X", "Y", "U", "S"] as const;

export const FIXED_OPCODES: ReadonlyMap<string, number> = new Map([
  ["NOP", 0x00], ["RETI", 0x01], ["RET", 0x06], ["RETF", 0x07],
  ["SC", 0x97], ["RC", 0x9f], ["TCL", 0xce], ["HALT", 0xde], ["OFF", 0xdf],
  ["WAIT", 0xef], ["IR", 0xfe], ["INT", 0xfe], ["RESET", 0xff]
]);

/** Every mnemonic the encoder understands (used for the unknown-instruction check). */
export const MNEMONICS: ReadonlySet<string> = new Set([
  ...FIXED_OPCODES.keys(),
  "PRE",
  "JP", "JPZ", "JPNZ", "JPC", "JPNC", "CALL", "JPF", "CALLF",
  "JR", "JRZ", "JRNZ", "JRC", "JRNC",
  "PUSHU", "POPU", "PUSHS", "POPS",
  "INC", "DEC", "ROR", "ROL", "SHR", "SHL", "DSLL", "DSRL", "SWAP",
  "MV", "MVW", "MVP", "MVL",
  "ADD", "SUB", "ADC", "SBC",
  "CMP", "TEST", "XOR", "AND", "OR",
  "EX", "EXW", "EXP", "EXL", "ADCL", "SBCL", "DADL", "DSBL", "CMPW", "CMPP", "MVLD",
  "PMDF"
]);

interface Operand {
  readonly kind: string;
  readonly text: string;
  readonly reg: number;
  readonly mode: number;
  readonly index: number;
  readonly offset?: string;
  readonly inner?: Operand;
}

function operand(kind: string, text: string, extra: Partial<Operand> = {}): Operand {
  return { kind, text, reg: -1, mode: 1, index: 0, ...extra };
}

export type Evaluator = (expression: string) => bigint;

export class InstructionEncoder {
  private readonly internalOperands: Operand[] = [];
  private readonly bytes: number[] = [];

  constructor(private readonly evaluate: Evaluator, private readonly pc: number, private readonly strict: boolean) {}

  private emit(...values: number[]): void {
    for (const v of values) this.bytes.push(v & 0xff);
  }

  private value(s: string, bits: number, signed = false): bigint {
    const v = this.evaluate(s);
    const min = signed ? -(1n << BigInt(bits - 1)) : 0n;
    if (this.strict && (v < min || v >= 1n << BigInt(bits))) throw new AssemblyError(`値 ${v} は ${bits} ビットに収まりません。`, "ASM040");
    return v;
  }

  private immediate(s: string, bits: number, signed = false): void {
    let v = this.value(s, bits, signed);
    v &= (1n << BigInt(bits)) - 1n;
    for (let i = 0; i < Math.floor((bits + 7) / 8); i += 1) this.emit(Number((v >> BigInt(8 * i)) & 0xffn));
  }

  private parse(text: string): Operand {
    const s = text.toUpperCase().replace(/\s+/g, "");
    const r = (REGISTERS as readonly string[]).indexOf(s);
    if (r >= 0) return operand("R", text, { reg: r });
    if (s === "B" || s === "F" || s === "IMR") return operand(s, text);
    if (s.startsWith("(") && s.endsWith(")")) return InstructionEncoder.internal(text.trim().slice(1, -1));
    if (s.startsWith("[") && s.endsWith("]")) {
      const inside = text.trim().slice(1, -1).trim();
      const m = /^(--)?([XYUS])(\+\+)?(?:\s*([+-])\s*(.+))?$/i.exec(inside);
      if (m) {
        if ((m[1] ? 1 : 0) + (m[3] ? 1 : 0) + (m[4] ? 1 : 0) > 1) throw new AssemblyError("自動増減と変位は同時に指定できません。", "ASM020");
        const reg = (REGISTERS as readonly string[]).indexOf(m[2].toUpperCase());
        const index = m[1] ? 0x30 : m[3] ? 0x20 : m[4] ? (m[4] === "+" ? 0x80 : 0xc0) : 0;
        return operand("ER", inside, { reg, index, offset: m[5] });
      }
      if (inside.startsWith("(")) {
        let depth = 0;
        let end = -1;
        for (let i = 0; i < inside.length; i += 1) {
          if (inside[i] === "(") depth += 1;
          if (inside[i] === ")" && --depth === 0) { end = i; break; }
        }
        if (end < 0) throw new AssemblyError("間接アドレスの ')' がありません。", "ASM010");
        const inner = InstructionEncoder.internal(inside.slice(1, end));
        const tail = inside.slice(end + 1).trim();
        if (tail.length > 0 && tail[0] !== "+" && tail[0] !== "-") throw new AssemblyError("間接アドレスの変位が不正です。", "ASM020");
        return operand("EI", inside, { index: tail.length === 0 ? 0 : tail[0] === "+" ? 0x80 : 0xc0, offset: tail.length === 0 ? undefined : tail.slice(1), inner });
      }
      if (/^\[(?:A|IL|BA|I|B)(?:\]|[+-])/.test(s)) throw new AssemblyError("外部メモリの添字レジスタは X, Y, U, S のいずれかです。", "ASM020");
      return operand("EA", inside);
    }
    return operand("V", text.startsWith("#") ? text.slice(1) : text);
  }

  private static internal(text: string): Operand {
    const s = text.toUpperCase().replace(/\s+/g, "");
    if (s === "BP+PX" || s === "PX+BP") return operand("M", "0", { mode: 3, index: 1 });
    if (s === "BP+PY" || s === "PY+BP") return operand("M", "0", { mode: 3, index: 2 });
    const m = /^\s*(BP|PX|PY)\s*(?:([+-])\s*(.+))?$/i.exec(text);
    if (m) {
      const name = m[1].toUpperCase();
      return operand("M", m[3] ? `${m[2]}(${m[3]})` : "0", { mode: name === "BP" ? 1 : 2, index: name === "PX" ? 1 : name === "PY" ? 2 : 0 });
    }
    return operand("M", text, { mode: 0 });
  }

  private mem(o: Operand): void {
    this.internalOperands.push(o);
    this.immediate(o.text, 8, o.mode === 1 || o.mode === 2);
  }

  private static width(r: number): number {
    return r < 2 ? 8 : r < 4 ? 16 : 20;
  }

  private external(opcode: number, ext: Operand, memory?: Operand, store = false): void {
    this.emit(opcode);
    if (ext.kind === "EA") {
      if (memory && !store) this.mem(memory);
      this.immediate(ext.text, 20);
      if (memory && store) this.mem(memory);
      return;
    }
    this.emit(ext.index | (ext.kind === "ER" ? ext.reg : 0));
    if (ext.kind === "EI" && store) this.mem(ext.inner!);
    if (memory) this.mem(memory);
    if (ext.kind === "EI" && !store) this.mem(ext.inner!);
    if (ext.offset !== undefined) this.immediate(ext.offset, 8);
  }

  encode(mnemonic: string, args: readonly string[]): number[] {
    const m = mnemonic.toUpperCase();
    const fixed = FIXED_OPCODES.get(m);
    if (fixed !== undefined) {
      if (args.length !== 0) throw new AssemblyError(`${m} にオペランドは指定できません。`, "ASM021");
      return [fixed];
    }
    const a = args.map(arg => this.parse(arg));
    if (m === "PRE") {
      if (a.length !== 1 || a[0].kind !== "V") throw new AssemblyError("PRE には 1 バイトの値を指定します。", "ASM021");
      const v = Number(this.value(a[0].text, 8));
      if (this.strict && !((v >= 0x21 && v <= 0x27) || (v >= 0x30 && v <= 0x37))) throw new AssemblyError("PRE は 21h～27h または 30h～37h です（20h は予約）。", "ASM040");
      return [v];
    }
    const ok = a.length === 1 ? this.unary(m, a[0]) : a.length === 2 && this.binary(m, a[0], a[1]);
    if (!ok) throw new AssemblyError(`この命令またはオペランドの組合せは使用できません: ${m} ${args.join(", ")}`, "ASM020");
    if (this.internalOperands.length > 0) {
      for (let i = 0; i < this.internalOperands.length; i += 1) {
        const o = this.internalOperands[i];
        if (o.index !== 0 && o.index !== i + 1) throw new AssemblyError(`${i + 1} 番目の内部 RAM オペランドは ${i === 0 ? "PX" : "PY"} を使用します。`, "ASM020");
      }
      const first = this.internalOperands[0].mode;
      const second = this.internalOperands.length > 1 ? this.internalOperands[1].mode : 1;
      const pre = [[0x32, 0x30, 0x33, 0x31], [0x22, 0, 0x23, 0x21], [0x36, 0x34, 0x37, 0x35], [0x26, 0x24, 0x27, 0x25]];
      if (pre[first][second] !== 0) this.bytes.unshift(pre[first][second]);
    }
    return this.bytes.slice();
  }

  private unary(m: string, x: Operand): boolean {
    if (["JP", "JPZ", "JPNZ", "JPC", "JPNC", "CALL", "JPF", "CALLF"].includes(m)) {
      if (m === "JP" && x.kind === "M") { this.emit(0x10); this.mem(x); return true; }
      if (m === "JP" && x.kind === "R" && x.reg >= 4) { this.emit(0x11, x.reg); return true; }
      if (x.kind !== "V") return false;
      const op = { JP: 2, JPF: 3, CALL: 4, CALLF: 5, JPZ: 0x14, JPNZ: 0x15, JPC: 0x16 }[m] ?? 0x17;
      this.emit(op);
      if (m.endsWith("F")) {
        this.immediate(x.text, 20);
      } else {
        const target = Number(this.value(x.text, 20));
        if (this.strict && target > 0xffff && (target >> 16) !== (this.pc >> 16)) throw new AssemblyError("近距離分岐が 64 KiB セグメントをまたいでいます。JPF/CALLF を使用してください。", "ASM041");
        this.emit(target, target >> 8);
      }
      return true;
    }
    if (["JR", "JRZ", "JRNZ", "JRC", "JRNC"].includes(m)) {
      if (x.kind !== "V") return false;
      let delta: number;
      const expression = x.text.trim();
      if (expression.startsWith("+") || expression.startsWith("-")) {
        delta = Number(this.evaluate(expression));
      } else {
        let target = Number(this.value(expression, 20));
        if (target <= 0xffff) target += this.pc & 0xf0000;
        if (this.strict && (target >> 16) !== (this.pc >> 16)) throw new AssemblyError("相対分岐が 64 KiB セグメントをまたいでいます。", "ASM041");
        delta = (target - (((this.pc + 2) & 0xffff) | (this.pc & 0xf0000))) & 0xffff;
        if (delta > 32767) delta -= 65536;
      }
      if (this.strict && Math.abs(delta) > 255) throw new AssemblyError(`相対分岐の変位 ${delta} が範囲外です（-255～255）。`, "ASM041");
      const op = { JR: 0x12, JRZ: 0x18, JRNZ: 0x1a, JRC: 0x1c }[m] ?? 0x1e;
      this.emit(op + (delta < 0 ? 1 : 0), Math.abs(delta));
      return true;
    }
    if (m === "PUSHU" || m === "POPU") {
      const r = x.kind === "F" ? 6 : x.kind === "IMR" ? 7 : x.kind === "R" && x.reg < 6 ? x.reg : -1;
      if (r < 0) return false;
      this.emit((m === "PUSHU" ? 0x28 : 0x38) + r);
      return true;
    }
    if (m === "PUSHS" || m === "POPS") {
      if (x.kind !== "F") return false;
      this.emit(m === "PUSHS" ? 0x4f : 0x5f);
      return true;
    }
    if (m === "INC" || m === "DEC") {
      const op = m === "INC" ? 0x6c : 0x7c;
      if (x.kind === "R") this.emit(op, x.reg);
      else if (x.kind === "M") { this.emit(op + 1); this.mem(x); }
      else return false;
      return true;
    }
    if (["ROR", "ROL", "SHR", "SHL"].includes(m)) {
      const op = { ROR: 0xe4, ROL: 0xe6, SHR: 0xf4 }[m] ?? 0xf6;
      if (x.kind === "R" && x.reg === 0) this.emit(op);
      else if (x.kind === "M") { this.emit(op + 1); this.mem(x); }
      else return false;
      return true;
    }
    if ((m === "DSLL" || m === "DSRL") && x.kind === "M") { this.emit(m === "DSLL" ? 0xec : 0xfc); this.mem(x); return true; }
    if (m === "SWAP" && x.kind === "R" && x.reg === 0) { this.emit(0xee); return true; }
    return false;
  }

  private binary(m: string, d: Operand, s: Operand): boolean {
    const dm = d.kind === "M", sm = s.kind === "M", dr = d.kind === "R", sr = s.kind === "R", imm = s.kind === "V";
    const da = dr && d.reg === 0, sa = sr && s.reg === 0;
    const width = InstructionEncoder.width;
    if (["MV", "MVW", "MVP", "MVL"].includes(m)) {
      const w = { MV: 0, MVW: 1, MVP: 2 }[m] ?? 3;
      if (m === "MV") {
        if (da && s.kind === "B") { this.emit(0x74); return true; }
        if (d.kind === "B" && sa) { this.emit(0x75); return true; }
        if (dr && sr && d.reg >= 2 && s.reg >= 2) { this.emit(0xfd, (d.reg << 4) | s.reg); return true; }
        if (dr && imm) { this.emit(8 + d.reg); this.immediate(s.text, width(d.reg), true); return true; }
        if (dr && sm) { this.emit(0x80 + d.reg); this.mem(s); return true; }
        if (dm && sr) { this.emit(0xa0 + s.reg); this.mem(d); return true; }
        if (dr && s.kind.startsWith("E")) {
          if (d.reg === 7 && s.kind !== "EA") return false;
          this.external((s.kind === "EA" ? 0x88 : s.kind === "ER" ? 0x90 : 0x98) + d.reg, s);
          return true;
        }
        if (sr && d.kind.startsWith("E")) {
          if (s.reg === 7 && d.kind !== "EA") return false;
          this.external((d.kind === "EA" ? 0xa8 : d.kind === "ER" ? 0xb0 : 0xb8) + s.reg, d, undefined, true);
          return true;
        }
      }
      if (dm && sm) { this.emit(0xc8 + w); this.mem(d); this.mem(s); return true; }
      if (dm && imm && w < 3) { this.emit(w === 2 ? 0xdc : 0xcc + w); this.mem(d); this.immediate(s.text, (w + 1) * 8, true); return true; }
      if (dm && s.kind.startsWith("E")) {
        if (w === 3 && s.kind === "ER" && s.index === 0) s = { ...s, index: 0x80, offset: "0" };
        let op = s.kind === "EA" ? 0xd0 + w : s.kind === "ER" ? 0xe0 + w : 0xf0 + w;
        if (w === 3 && s.kind === "ER" && s.offset !== undefined) op = 0x56;
        this.external(op, s, d);
        return true;
      }
      if (sm && d.kind.startsWith("E")) {
        if (w === 3 && d.kind === "ER" && d.index === 0) d = { ...d, index: 0x80, offset: "0" };
        let op = d.kind === "EA" ? 0xd8 + w : d.kind === "ER" ? 0xe8 + w : 0xf8 + w;
        if (w === 3 && d.kind === "ER" && d.offset !== undefined) op = 0x5e;
        this.external(op, d, s, true);
        return true;
      }
      return false;
    }
    if (["ADD", "SUB", "ADC", "SBC"].includes(m)) {
      const op = { ADD: 0x40, SUB: 0x48, ADC: 0x50 }[m] ?? 0x58;
      if (da && imm) { this.emit(op); this.immediate(s.text, 8, true); return true; }
      if (dm && imm) { this.emit(op + 1); this.mem(d); this.immediate(s.text, 8, true); return true; }
      if (da && sm) { this.emit(op + 2); this.mem(s); return true; }
      if (dm && sa) { this.emit(op + 3); this.mem(d); return true; }
      if ((m === "ADD" || m === "SUB") && dr && sr && width(d.reg) >= width(s.reg)) { this.emit(op + (d.reg < 2 ? 6 : d.reg < 4 ? 4 : 5), (d.reg << 4) | s.reg); return true; }
      return false;
    }
    if (["CMP", "TEST", "XOR", "AND", "OR"].includes(m)) {
      const op = { CMP: 0x60, TEST: 0x64, XOR: 0x68, AND: 0x70 }[m] ?? 0x78;
      if (da && imm) { this.emit(op); this.immediate(s.text, 8, true); return true; }
      if (dm && imm) { this.emit(op + 1); this.mem(d); this.immediate(s.text, 8, true); return true; }
      if (d.kind === "EA" && imm) { this.emit(op + 2); this.immediate(d.text, 20); this.immediate(s.text, 8, true); return true; }
      if (dm && sa) { this.emit(op + 3); this.mem(d); return true; }
      if (dm && sm && m !== "TEST") { this.emit(m === "CMP" ? 0xb7 : op + 6); this.mem(d); this.mem(s); return true; }
      if (da && sm && (m === "XOR" || m === "AND" || m === "OR")) { this.emit(op + 7); this.mem(s); return true; }
      return false;
    }
    if (["EX", "EXW", "EXP", "EXL", "ADCL", "SBCL", "DADL", "DSBL", "CMPW", "CMPP", "MVLD"].includes(m)) {
      const op = { EX: 0xc0, EXW: 0xc1, EXP: 0xc2, EXL: 0xc3, ADCL: 0x54, SBCL: 0x5c, DADL: 0xc4, DSBL: 0xd4, CMPW: 0xc6, CMPP: 0xc7 }[m] ?? 0xcf;
      if (dm && sm) { this.emit(op); this.mem(d); this.mem(s); return true; }
      if (m === "EX" && ((da && s.kind === "B") || (d.kind === "B" && sa))) { this.emit(0xdd); return true; }
      if (m === "EX" && dr && sr && d.reg >= 2 && s.reg >= 2) { this.emit(0xed, (d.reg << 4) | s.reg); return true; }
      if (["ADCL", "SBCL", "DADL", "DSBL"].includes(m) && dm && sa) { this.emit(op + 1); this.mem(d); return true; }
      if ((m === "CMPW" || m === "CMPP") && dm && sr && (m === "CMPW" ? s.reg === 2 || s.reg === 3 : s.reg >= 4)) { this.emit(op + 0x10, s.reg); this.mem(d); return true; }
      return false;
    }
    if (m === "PMDF" && dm) {
      if (imm) { this.emit(0x47); this.mem(d); this.immediate(s.text, 8, true); return true; }
      if (sa) { this.emit(0x57); this.mem(d); return true; }
    }
    return false;
  }
}
