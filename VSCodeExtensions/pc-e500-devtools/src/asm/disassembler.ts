// Port of DisAssembler/src/E500Disassembler.Core: the same source, byte for byte, from the
// same image. What it writes always assembles back to the image.
import { InstructionEncoder } from "./encoder";
import { AssemblyError, evaluate } from "./expression";

export class DisassemblyError extends Error {}

export interface DecodedLine {
  readonly address: number;
  readonly bytes: Uint8Array;
  readonly mnemonic: string;
  readonly operands: readonly string[];
  readonly note: string;
  readonly target?: number;
}

export interface InputImage {
  readonly payload: Uint8Array;
  readonly origin: number;
  readonly format: "raw" | "ce140f";
  readonly header: Uint8Array;
}

export interface DisassemblyOptions { readonly labels?: boolean; readonly addresses?: boolean; readonly bytes?: boolean }

export interface Disassembly { readonly image: InputImage; readonly lines: readonly DecodedLine[]; readonly source: string; readonly instructions: number; readonly dataBytes: number }

const HEAD = [0xff, 0x00, 0x06, 0x01, 0x10], TAIL = [0xff, 0xff, 0xff, 0x00, 0x0f];
const read24 = (b: Uint8Array, at: number): number => b[at] | b[at + 1] << 8 | b[at + 2] << 16;

function checkRange(origin: number, length: number): void {
  if (origin < 0 || origin > 0xfffff || origin + length > 0x100000) throw new DisassemblyError("Image must fit in addresses 00000h..FFFFFh");
}

/** Whether a file has the 16-byte header of SAVE M. */
export const isSaveM = (file: Uint8Array): boolean => file.length >= 16 && HEAD.every((b, i) => file[i] === b);

export function readImage(file: Uint8Array, format: "raw" | "ce140f", rawOrigin?: number): InputImage {
  if (file.length > 0x100010) throw new DisassemblyError("Input exceeds the SC62015 1 MiB address space plus header");
  if (format === "raw") {
    if (rawOrigin === undefined) throw new DisassemblyError("RAW input requires a start address (--org)");
    checkRange(rawOrigin, file.length);
    return { payload: file.slice(), origin: rawOrigin, format, header: new Uint8Array() };
  }
  if (rawOrigin !== undefined) throw new DisassemblyError("CE-140F input uses the header address; --org is for RAW only");
  if (file.length < 16) throw new DisassemblyError("CE-140F file is shorter than its 16-byte header");
  if (!isSaveM(file)) throw new DisassemblyError("Not a CE-140F SAVE M machine-code header (expected FF 00 06 01 10)");
  if (!TAIL.every((b, i) => file[11 + i] === b)) throw new DisassemblyError("Unsupported CE-140F header tail (expected FF FF FF 00 0F)");
  const length = read24(file, 5), origin = read24(file, 8);
  if (length !== file.length - 16) throw new DisassemblyError(`Header length ${length} does not match payload length ${file.length - 16}; no data was discarded`);
  checkRange(origin, length);
  return { payload: file.slice(16), origin, format, header: file.slice(0, 16) };
}

const REGISTERS = ["A", "IL", "BA", "I", "X", "Y", "U", "S"];
const MOVES = ["MV", "MVW", "MVP", "MVL"];
const MODES: Readonly<Record<number, readonly [number, number]>> = {
  0x21: [1, 3], 0x22: [1, 0], 0x23: [1, 2], 0x24: [3, 1], 0x25: [3, 3], 0x26: [3, 0], 0x27: [3, 2],
  0x30: [0, 1], 0x31: [0, 3], 0x32: [0, 0], 0x33: [0, 2], 0x34: [2, 1], 0x35: [2, 3], 0x36: [2, 0], 0x37: [2, 2]
};
const MODE_NAMES = ["absolute", "BP+offset", "PX/PY+offset", "BP+PX/PY"];
const isPrefix = (op: number): boolean => (op >= 0x21 && op <= 0x27) || (op >= 0x30 && op <= 0x37);
const hex = (n: number, width = 2): string => "$" + n.toString(16).toUpperCase().padStart(width, "0");
const reg = (code: number): string => REGISTERS[code & 7];

class EndOfInput extends Error {}
class InvalidEncoding extends Error {}

type Line = DecodedLine;

class Decoder {
  private cursor = 0;
  private start = 0;
  private memoryIndex = 0;
  private modes: readonly [number, number] = [1, 1];

  constructor(private readonly data: Uint8Array, private readonly origin: number) {}

  private byte(): number {
    if (this.cursor >= this.data.length) throw new EndOfInput();
    return this.data[this.cursor++];
  }

  private value(size: number): number {
    let v = 0;
    for (let i = 0; i < size; i++) v += this.byte() * 2 ** (i * 8);
    return v;
  }

  private immediate(size: number): string { return hex(this.value(size), size * 2); }
  private address20(): string { return hex(this.value(3) & 0xfffff, 5); }
  private memory20(): string { return `[${this.address20()}]`; }

  private memory(): string {
    const index = this.memoryIndex++, mode = this.modes[index === 0 ? 0 : 1], n = this.byte(), pointer = index === 0 ? "PX" : "PY";
    return mode === 0 ? `(${hex(n)})` : mode === 1 ? `(BP+${hex(n)})` : mode === 2 ? `(${pointer}+${hex(n)})` : `(BP+${pointer})`;
  }

  private static index(mode: number): string {
    const r = reg(mode);
    switch (mode & 0xf0) {
      case 0x00: case 0x80: case 0xc0: return r;
      case 0x20: return r + "++";
      case 0x30: return "--" + r;
      default: throw new InvalidEncoding("invalid index mode");
    }
  }

  private indexed(indirect: boolean, hasMemory: boolean, store: boolean): { external: string; internal: string } {
    const mode = this.byte();
    let external: string | undefined, internal = "";
    if (indirect && store) external = this.memory();
    if (hasMemory) internal = this.memory();
    if (indirect && !store) external = this.memory();
    external ??= Decoder.index(mode);
    const displacement = (mode & 0x80) === 0 ? "" : ((mode & 0x40) === 0 ? "+" : "-") + this.immediate(1);
    return { external: `[${external}${displacement}]`, internal };
  }

  private line(mnemonic: string, ...operands: string[]): Line {
    return { address: this.origin + this.start, bytes: this.data.slice(this.start, this.cursor), mnemonic, operands, note: "" };
  }

  private branch(mnemonic: string, value: number, width: number, target: number): Line {
    return { ...this.line(mnemonic, hex(value, width)), target };
  }

  private pairRegisters(mnemonic: string, wide = false): Line {
    // ED/FD use the wide register selector: 0/2 = BA, 1/3 = I.
    const name = (code: number): string => (wide && (code & 7) < 2 ? reg((code & 7) + 2) : reg(code));
    const mode = this.byte();
    return this.line(mnemonic, name(mode >> 4), name(mode));
  }

  // The operands are read in the order they are written: left first.
  private pairMemory(mnemonic: string): Line { const a = this.memory(), b = this.memory(); return this.line(mnemonic, a, b); }

  private decodeAt(offset: number, prefix: number | undefined): Line {
    this.start = this.cursor = offset;
    this.memoryIndex = 0;
    this.modes = prefix === undefined ? [1, 1] : MODES[prefix];
    if (prefix !== undefined) this.byte();
    const at = this.origin + this.cursor, op = this.byte();
    const four = (mnemonic: string): Line => {
      switch (op & 3) {
        case 0: return this.one(mnemonic, () => ["A", this.immediate(1)]);
        case 1: return this.one(mnemonic, () => [this.memory(), this.immediate(1)]);
        case 2: return this.one(mnemonic, () => ["A", this.memory()]);
        default: return this.one(mnemonic, () => [this.memory(), "A"]);
      }
    };
    const between = (a: number, b: number): boolean => op >= a && op <= b;
    switch (op) {
      case 0x00: return this.line("NOP");
      case 0x01: return this.line("RETI");
      case 0x02: case 0x04: case 0x14: case 0x15: case 0x16: case 0x17: {
        const v = this.value(2);
        return this.branch(({ 0x02: "JP", 0x04: "CALL", 0x14: "JPZ", 0x15: "JPNZ", 0x16: "JPC", 0x17: "JPNC" } as Record<number, string>)[op], v, 4, (at & 0xf0000) | v);
      }
      case 0x03: case 0x05: { const v = this.value(3) & 0xfffff; return this.branch(op === 3 ? "JPF" : "CALLF", v, 5, v); }
      case 0x06: return this.line("RET");
      case 0x07: return this.line("RETF");
      case 0x10: return this.one("JP", () => [this.memory()]);
      case 0x11: return this.one("JP", () => [reg(this.byte())]);
      case 0x20: case 0xbf: throw new InvalidEncoding("reserved opcode");
      case 0x47: return this.one("PMDF", () => [this.memory(), this.immediate(1)]);
      case 0x57: return this.one("PMDF", () => [this.memory(), "A"]);
      case 0x4f: return this.line("PUSHS", "F");
      case 0x5f: return this.line("POPS", "F");
      case 0x54: return this.pairMemory("ADCL");
      case 0x5c: return this.pairMemory("SBCL");
      case 0x55: return this.one("ADCL", () => [this.memory(), "A"]);
      case 0x5d: return this.one("SBCL", () => [this.memory(), "A"]);
      case 0x56: { const x = this.indexed(false, true, false); return this.line("MVL", x.internal, x.external); }
      case 0x5e: { const x = this.indexed(false, true, true); return this.line("MVL", x.external, x.internal); }
      case 0x6c: case 0x7c: return this.one(op === 0x6c ? "INC" : "DEC", () => [reg(this.byte())]);
      case 0x6d: case 0x7d: return this.one(op === 0x6d ? "INC" : "DEC", () => [this.memory()]);
      case 0x6e: case 0x76: case 0x7e: return this.pairMemory(op === 0x6e ? "XOR" : op === 0x76 ? "AND" : "OR");
      case 0x6f: case 0x77: case 0x7f: return this.one(op === 0x6f ? "XOR" : op === 0x77 ? "AND" : "OR", () => ["A", this.memory()]);
      case 0x74: return this.line("MV", "A", "B");
      case 0x75: return this.line("MV", "B", "A");
      case 0x97: return this.line("SC");
      case 0x9f: return this.line("RC");
      case 0xb7: return this.pairMemory("CMP");
      case 0xc4: return this.pairMemory("DADL");
      case 0xc5: return this.one("DADL", () => [this.memory(), "A"]);
      case 0xc6: case 0xc7: return this.pairMemory(op === 0xc6 ? "CMPW" : "CMPP");
      case 0xcc: case 0xcd: case 0xdc: return this.one(op === 0xcc ? "MV" : op === 0xcd ? "MVW" : "MVP", () => [this.memory(), this.immediate(op === 0xcc ? 1 : op === 0xcd ? 2 : 3)]);
      case 0xce: return this.line("TCL");
      case 0xcf: return this.pairMemory("MVLD");
      case 0xd4: return this.pairMemory("DSBL");
      case 0xd5: return this.one("DSBL", () => [this.memory(), "A"]);
      // The register comes first in the bytes.
      case 0xd6: case 0xd7: { const r = reg(this.byte()); return this.one(op === 0xd6 ? "CMPW" : "CMPP", () => [this.memory(), r]); }
      case 0xdd: return this.line("EX", "A", "B");
      case 0xde: return this.line("HALT");
      case 0xdf: return this.line("OFF");
      case 0xe4: case 0xe6: case 0xf4: case 0xf6: return this.line(op === 0xe4 ? "ROR" : op === 0xe6 ? "ROL" : op === 0xf4 ? "SHR" : "SHL", "A");
      case 0xe5: case 0xe7: case 0xf5: case 0xf7: return this.one(op === 0xe5 ? "ROR" : op === 0xe7 ? "ROL" : op === 0xf5 ? "SHR" : "SHL", () => [this.memory()]);
      case 0xec: case 0xfc: return this.one(op === 0xec ? "DSLL" : "DSRL", () => [this.memory()]);
      case 0xed: return this.pairRegisters("EX", true);
      case 0xfd: return this.pairRegisters("MV", true);
      case 0xee: return this.line("SWAP", "A");
      case 0xef: return this.line("WAIT");
      case 0xfe: return this.line("IR");
      case 0xff: return this.line("RESET");
    }
    if (between(0x08, 0x0f)) return this.one("MV", () => [reg(op), op < 0x0a ? this.immediate(1) : op < 0x0c ? this.immediate(2) : this.address20()]);
    if (op === 0x12 || op === 0x13 || between(0x18, 0x1f)) {
      const delta = this.byte(), negative = (op & 1) !== 0;
      const target = (at & 0xf0000) | ((at + 2 + (negative ? -delta : delta)) & 0xffff);
      return { ...this.line(op < 0x18 ? "JR" : ["JRZ", "JRNZ", "JRC", "JRNC"][(op - 0x18) >> 1], (negative ? "-" : "+") + hex(delta)), target };
    }
    if (between(0x28, 0x2f) || between(0x38, 0x3f)) return this.line(op < 0x30 ? "PUSHU" : "POPU", (op & 7) === 6 ? "F" : (op & 7) === 7 ? "IMR" : reg(op));
    if (between(0x44, 0x46)) return this.pairRegisters("ADD");
    if (between(0x4c, 0x4e)) return this.pairRegisters("SUB");
    if (between(0x40, 0x5b)) return four(["ADD", "SUB", "ADC", "SBC"][(op - 0x40) >> 3]);
    if (between(0x60, 0x7b)) {
      const m = op < 0x64 ? "CMP" : op < 0x68 ? "TEST" : op < 0x70 ? "XOR" : op < 0x78 ? "AND" : "OR";
      return (op & 3) === 2 ? this.one(m, () => [this.memory20(), this.immediate(1)]) : four(m);
    }
    if (between(0x80, 0x87)) return this.one("MV", () => [reg(op), this.memory()]);
    if (between(0x88, 0x8f)) return this.one("MV", () => [reg(op), this.memory20()]);
    if (between(0x90, 0x9e)) return this.one("MV", () => [reg(op), this.indexed(op >= 0x98, false, false).external]);
    if (between(0xa0, 0xa7)) return this.one("MV", () => [this.memory(), reg(op)]);
    if (between(0xa8, 0xaf)) return this.one("MV", () => [this.memory20(), reg(op)]);
    if (between(0xb0, 0xbe)) return this.one("MV", () => [this.indexed(op >= 0xb8, false, true).external, reg(op)]);
    if (between(0xc0, 0xc3)) return this.pairMemory(["EX", "EXW", "EXP", "EXL"][op - 0xc0]);
    if (between(0xc8, 0xcb)) return this.pairMemory(MOVES[op - 0xc8]);
    if (between(0xd0, 0xd3)) return this.one(MOVES[op - 0xd0], () => [this.memory(), this.memory20()]);
    if (between(0xd8, 0xdb)) return this.one(MOVES[op - 0xd8], () => [this.memory20(), this.memory()]);
    if (between(0xe0, 0xfb)) {
      const store = (op & 8) !== 0, x = this.indexed(op >= 0xf0, true, store);
      return store ? this.line(MOVES[op & 3], x.external, x.internal) : this.line(MOVES[op & 3], x.internal, x.external);
    }
    throw new InvalidEncoding("standalone PRE");
  }

  /** The operands are read before the line is made: its bytes end after them. */
  private one(mnemonic: string, operands: () => string[]): Line {
    const list = operands();
    return this.line(mnemonic, ...list);
  }

  private static matches(line: Line): boolean {
    try {
      const pc = line.address;
      const bytes = new InstructionEncoder(text => evaluate(text, name => { throw new AssemblyError(name, "ASM031"); }, pc), pc, true).encode(line.mnemonic, [...line.operands]);
      return (pc & 0xffff) + bytes.length <= 0x10000 && bytes.length === line.bytes.length && line.bytes.every((b, i) => b === bytes[i]);
    } catch { return false; }
  }

  private raw(offset: number, count: number, note: string): Line {
    const bytes = this.data.slice(offset, offset + count);
    return { address: this.origin + offset, bytes, mnemonic: "DB", operands: [...bytes].map(b => hex(b)), note };
  }

  decode(): Line[] {
    const out: Line[] = [];
    for (let offset = 0; offset < this.data.length;) {
      const op = this.data[offset];
      if (isPrefix(op)) {
        // Folded only when the assembler chooses exactly this PRE and keeps every operand byte.
        if (offset + 1 < this.data.length && !isPrefix(this.data[offset + 1])) {
          try {
            const combined = this.decodeAt(offset, op);
            if (Decoder.matches(combined)) { out.push(combined); offset += combined.bytes.length; continue; }
          } catch (error) { if (!(error instanceof EndOfInput || error instanceof InvalidEncoding)) throw error; }
        }
        const [first, second] = MODES[op];
        out.push({ address: this.origin + offset, bytes: Uint8Array.of(op), mnemonic: "PRE", operands: [hex(op)], note: `explicit PRE: internal operand 1=${MODE_NAMES[first]}, 2=${MODE_NAMES[second]}` });
        offset++;
        continue;
      }
      let line: Line;
      try {
        line = this.decodeAt(offset, undefined);
        if (!Decoder.matches(line)) line = this.raw(offset, line.bytes.length, `byte-preserving fallback; decoded: ${line.mnemonic} ${line.operands.join(", ")}`);
      } catch (error) {
        if (error instanceof EndOfInput) line = this.raw(offset, this.data.length - offset, "truncated instruction at end of input");
        else if (error instanceof InvalidEncoding) line = this.raw(offset, Math.max(1, this.cursor - offset), error.message);
        else throw error;
      }
      out.push(line);
      offset += line.bytes.length;
    }
    return out;
  }
}

export function disassemble(image: InputImage, options: DisassemblyOptions = {}): Disassembly {
  const { labels: wantLabels = true, addresses = true, bytes = true } = options;
  const lines = new Decoder(image.payload, image.origin).decode();
  const starts = new Set(lines.map(l => l.address));
  const labels = new Map<number, string>();
  if (wantLabels) for (const l of lines) if (l.target !== undefined && starts.has(l.target)) labels.set(l.target, `L${l.target.toString(16).toUpperCase().padStart(5, "0")}`);
  const two = (b: number): string => b.toString(16).toUpperCase().padStart(2, "0"), five = (a: number): string => a.toString(16).toUpperCase().padStart(5, "0");
  const out = ["; Generated by e500dasm for SHARP PC-E500 series / SC62015", image.format === "ce140f" ? `; Input: CE-140F SAVE M, 16-byte header removed, ${image.payload.length} payload bytes` : `; Input: RAW, ${image.payload.length} bytes`];
  if (image.format === "ce140f") out.push("; CE-140F header: " + [...image.header].map(two).join(" "));
  out.push(`        ORG $${five(image.origin)}`, "");
  for (const l of lines) {
    const label = labels.get(l.address);
    if (label) out.push(label + ":");
    const to = l.target === undefined ? undefined : labels.get(l.target);
    let body = "        " + l.mnemonic.padEnd(7) + (to ?? l.operands.join(","));
    const comments = [...(addresses ? [five(l.address)] : []), ...(bytes ? [[...l.bytes].map(two).join(" ")] : []), ...(l.note ? [l.note] : [])];
    if (comments.length > 0) body = body.padEnd(42) + (body.length >= 42 ? " " : "") + "; " + comments.join(" | ");
    out.push(body.trimEnd());
  }
  out.push("        END", "");
  return {
    image, lines, source: out.join("\n"),
    instructions: lines.filter(l => l.mnemonic !== "DB" && l.mnemonic !== "PRE").length,
    dataBytes: lines.filter(l => l.mnemonic === "DB").reduce((n, l) => n + l.bytes.length, 0)
  };
}
