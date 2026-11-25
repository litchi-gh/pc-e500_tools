// The BASIC program and its variables as the PC-E500 keeps them in RAM
// (docs/analysis/15_BASIC_INTERNALS.md, docs/analysis/03_MEMORY.md §3.3):
// - a chain of named blocks from the bottom of the internal RAM + 18h; each starts
//   FBh, a 12-byte name, and holds its size at +11h and the bytes in use at +16h;
// - the program block ("TEXT    BAS "), whose address the ROM also keeps in internal
//   RAM CBh-CDh: from +22h the bytes of a saved file, the lines from +35h;
// - the variables block ("DATA    BAS "): FF 00 01 00 at +22h, then ten 3-byte
//   section positions (from the block's start), then the sections of records.

import { L } from "../l10n";

export interface BasicLine {
  /** The BASIC line number. */
  readonly number: number;
  /** Address of the line's first byte (its number, high byte first). */
  readonly address: number;
  /** Address of the line's first token: the interpreter reads it first when it starts the line. */
  readonly first: number;
  /** Bytes of the tokens and the closing 0Dh. */
  readonly length: number;
}

/** Where a value is, from the start of the DATA block. */
export interface Place {
  readonly offset: number;
  readonly length: number;
  readonly type: "single" | "double" | "string";
}

export interface BasicVariable {
  /** As written in BASIC: A, AB, D#, B$, P(), R$() ... */
  readonly name: string;
  readonly kind: "number" | "string" | "array";
  /** A-Z: the ROM keeps room for these 26 always, so being there does not mean the program uses it. */
  readonly fixed?: boolean;
  /** The value of a number or string; the shape ("(1,2)") of an array. */
  readonly value: string;
  /** An array's elements, the last subscript running fastest as in RAM. */
  readonly elements?: ReadonlyArray<{ readonly index: string; readonly value: string; readonly place?: Place }>;
  /** Where the value of a number or string is (an array's are its elements'). */
  readonly place?: Place;
}

const le3 = (b: Uint8Array, i: number): number => b[i] | b[i + 1] << 8 | b[i + 2] << 16;

/**
 * A number as BASIC keeps it: sign (00h/08h single, 01h/09h double), the decimal
 * exponent as a signed byte, then the BCD digits d.ddd...
 */
export function formatNumber(bytes: Uint8Array): string {
  if (bytes.length < 3) return "?";
  const negative = (bytes[0] & 8) !== 0;
  const exponent = bytes[1] > 127 ? bytes[1] - 256 : bytes[1];
  let digits = "";
  for (let i = 2; i < bytes.length; i++) digits += (bytes[i] >> 4).toString() + (bytes[i] & 15).toString();
  if (/[^0-9]/.test(digits)) return "?";
  digits = digits.replace(/0+$/, "");
  if (digits === "") return "0";
  const sign = negative ? "-" : "";
  const places = bytes.length >= 12 ? 20 : 10;
  if (exponent >= 0 && exponent < places) {
    const whole = digits.slice(0, exponent + 1).padEnd(exponent + 1, "0");
    const fraction = digits.slice(exponent + 1);
    return sign + whole + (fraction ? "." + fraction : "");
  }
  if (exponent < 0 && exponent >= -places) return sign + "0." + "0".repeat(-exponent - 1) + digits;
  const e = Math.abs(exponent).toString().padStart(2, "0");
  return `${sign}${digits[0]}${digits.length > 1 ? "." + digits.slice(1) : ""}E${exponent < 0 ? "-" : "+"}${e}`;
}

/** The lines of the program in a TEXT block read from `blockAddress` (the whole block, `used` bytes). */
export function parseProgram(block: Uint8Array, blockAddress: number): BasicLine[] {
  const lines: BasicLine[] = [];
  // FF 00 00 00, start, end, 8 bytes of password, 0D, then the lines, FF.
  if (block.length < 0x36 || block[0x22] !== 0xff || block[0x34] !== 0x0d) return lines;
  let at = 0x35;
  while (at + 3 <= block.length && block[at] !== 0xff) {
    const number = block[at] << 8 | block[at + 1], length = block[at + 2];
    if (length < 1 || at + 3 + length > block.length) break;
    lines.push({ number, address: blockAddress + at, first: blockAddress + at + 3, length });
    at += 3 + length;
  }
  return lines;
}

function text(bytes: Uint8Array): string {
  let s = "";
  // 5Ch is ¥ on the machine; a backslash here is always the start of \xNN.
  for (const b of bytes) s += b === 0x5c ? "¥" : b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : b >= 0xa1 && b <= 0xdf ? String.fromCharCode(0xff61 + b - 0xa1) : `\\x${b.toString(16).padStart(2, "0")}`;
  return s;
}

/** Subscripts in RAM order (the last running fastest), e.g. (0,0) (0,1) (1,0) ... */
function subscripts(maxima: number[]): string[] {
  const out: string[] = [];
  const index = maxima.map(() => 0);
  const total = maxima.reduce((n, m) => n * (m + 1), 1);
  for (let k = 0; k < total && k < 100000; k++) {
    out.push(`(${index.join(",")})`);
    for (let d = maxima.length - 1; d >= 0; d--) { if (++index[d] <= maxima[d]) break; index[d] = 0; }
  }
  return out;
}

/** The variables in a DATA block (the whole block from its first byte, `used` bytes). */
export function parseVariables(block: Uint8Array): BasicVariable[] {
  if (block.length < 0x40 || block[0x22] !== 0xff || block[0x23] !== 0 || block[0x24] !== 1) return [];
  const at = (i: number): number => le3(block, 0x26 + i * 3);
  const strings = at(9);
  const sections: Array<{ index: number; start: number; end: number }> = [
    { index: 0, start: at(0), end: at(1) }, { index: 1, start: at(1), end: at(2) }, { index: 3, start: at(3), end: at(4) },
    { index: 4, start: at(4), end: at(5) }, { index: 5, start: at(5), end: at(6) }, { index: 6, start: at(6), end: at(7) },
    { index: 8, start: at(8), end: at(9) }
  ];
  const stringPlace = (offset: number, length: number): Place => ({ offset: strings + offset, length, type: "string" });
  const stringAt = (offset: number, length: number): string => JSON.stringify(text(block.subarray(strings + offset, strings + offset + length)));
  const vars: BasicVariable[] = [];
  for (const { index, start, end } of sections) {
    for (let r = start; r + 4 < end && r < block.length;) {
      const nameLength = block[r], size = le3(block, r + 1);
      if (nameLength < 1 || size < 4 + nameLength || r + size > end) break;
      const name = text(block.subarray(r + 4, r + 4 + nameLength));
      const p = r + 4 + nameLength;
      switch (index) {
        case 4: case 5: vars.push({ name, kind: "number", fixed: index === 4, value: formatNumber(block.subarray(p, p + 7)), place: { offset: p, length: 7, type: "single" } }); break;
        case 6: vars.push({ name: name + "#", kind: "number", value: formatNumber(block.subarray(p, p + 12)), place: { offset: p, length: 12, type: "double" } }); break;
        case 8: vars.push({ name: name + "$", kind: "string", value: stringAt(le3(block, p), block[p + 3]), place: stringPlace(le3(block, p), block[p + 3]) }); break;
        default: {
          const dims = block[p];
          const maxima: number[] = [];
          for (let d = 0; d < dims; d++) maxima.push(block[p + 1 + d * 2] | block[p + 2 + d * 2] << 8);
          let e = p + 1 + dims * 2;
          const names = subscripts(maxima);
          const elements: Array<{ index: string; value: string; place: Place }> = [];
          if (index === 3) {
            const base = le3(block, e); e += 3;
            for (const i of names) { if (e + 3 > r + size) break; const at = base + (block[e] | block[e + 1] << 8); elements.push({ index: i, value: stringAt(at, block[e + 2]), place: stringPlace(at, block[e + 2]) }); e += 3; }
          } else {
            const width = index === 1 ? 12 : 7;
            for (const i of names) { if (e + width > r + size) break; elements.push({ index: i, value: formatNumber(block.subarray(e, e + width)), place: { offset: e, length: width, type: width === 12 ? "double" : "single" } }); e += width; }
          }
          vars.push({ name: name + (index === 1 ? "#" : index === 3 ? "$" : "") + "()", kind: "array", value: `(${maxima.join(",")})`, elements });
        }
      }
      r += size;
    }
  }
  return vars;
}

/**
 * The letters A-Z the program uses as plain numeric variables, from the tokens of a
 * TEXT block. As the ROM stores a line (seen on ROM 7.2): keywords FE xx, numbers 1D
 * and 7 or 12 bytes, line numbers 1F and 2 bytes, a label's place 1C and 2 bytes, a
 * comment 1E to the end of the line; names are capitals as typed.
 */
export function usedLetters(block: Uint8Array): Set<string> {
  const used = new Set<string>();
  for (const line of parseProgram(block, 0)) {
    const end = line.first + line.length - 1;
    for (let i = line.first; i < end;) {
      const b = block[i];
      if (b === 0x1e) break;
      if (b === 0x1d) { i += 1 + ((block[i + 1] & 1) ? 12 : 7); continue; }
      if (b === 0x1f || b === 0x1c) { i += 3; continue; }
      if (b === 0x22) { i++; while (i < end && block[i] !== 0x22) i++; i++; continue; }
      if (b === 0xfe) {
        const keyword = block[i + 1];
        i += 2;
        if (keyword === 0x59) break; // REM
        if (keyword === 0x5e) { // DATA: its items are not variables
          for (let quote = false; i < end && (quote || block[i] !== 0x3a); i++) if (block[i] === 0x22) quote = !quote;
        }
        continue;
      }
      if (b === 0x26) { i++; while (i < end && /[0-9A-FH]/.test(String.fromCharCode(block[i]))) i++; continue; } // &HEF
      if (b >= 0x41 && b <= 0x5a) {
        let j = i + 1;
        while (j < end && ((block[j] >= 0x41 && block[j] <= 0x5a) || (block[j] >= 0x30 && block[j] <= 0x39))) j++;
        // A$, A# and A( are other variables.
        if (j === i + 1 && ![0x24, 0x23, 0x28].includes(block[j])) used.add(String.fromCharCode(b));
        i = j;
        continue;
      }
      i++;
    }
  }
  return used;
}

/** Whether a list shows the variable: of A-Z, the ones the program uses and any that is not 0. */
export function isShown(v: BasicVariable, letters: ReadonlySet<string>): boolean {
  return !v.fixed || letters.has(v.name) || v.value !== "0";
}

/** The variables in RAM, in the order of their names, and the letters the program uses. */
export async function readBasicVariables(read: (address: number, length: number) => Promise<Uint8Array>, internalKB: number): Promise<{ variables: BasicVariable[]; letters: Set<string>; address: number }> {
  const chain = await readChain(read, internalKB);
  const data = chain.find(b => b.name.startsWith("DATA"));
  const text = chain.find(b => b.name.startsWith("TEXT"));
  const variables = data ? parseVariables(await read(data.address, data.used)) : [];
  variables.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  return { variables, letters: text ? usedLetters(await read(text.address, text.used)) : new Set(), address: data?.address ?? 0 };
}

/**
 * A number typed (12, -1.5, 1E10, &HFF) as BASIC keeps it: 10 digits, or 20 in double
 * precision, rounded. An Error with why it cannot be.
 */
export function encodeNumber(typed: string, double: boolean): Uint8Array {
  let s = typed.trim().replace(/#$/, "");
  const hex = /^&H?([0-9A-F]+)$/i.exec(s);
  if (hex) s = BigInt("0x" + hex[1]).toString();
  const m = /^([+-]?)(\d*)(?:\.(\d*))?(?:[ED]([+-]?\d{1,4}))?$/i.exec(s);
  if (!m || (m[2] + (m[3] ?? "")) === "") throw new Error(L(`数値ではありません: ${typed}`, `Not a number: ${typed}`));
  const places = double ? 20 : 10;
  const out = new Uint8Array(double ? 12 : 7);
  out[0] = double ? 1 : 0;
  let digits = m[2] + (m[3] ?? "");
  let exponent = m[2].length - 1 + Number(m[4] ?? 0);
  const leading = /^0*/.exec(digits)![0].length;
  digits = digits.slice(leading);
  exponent -= leading;
  if (digits === "") return out;
  if (digits.length > places) {
    const up = digits[places] >= "5";
    digits = digits.slice(0, places);
    if (up) {
      digits = (BigInt(digits) + 1n).toString();
      if (digits.length > places) { digits = digits.slice(0, places); exponent++; }
    }
  }
  if (exponent > 99 || exponent < -99) throw new Error(L(`大きすぎるか小さすぎます（1E-99〜9.99E+99）: ${typed}`, `Out of range (1E-99 to 9.99E+99): ${typed}`));
  digits = digits.padEnd(places, "0");
  if (m[1] === "-") out[0] |= 8;
  out[1] = exponent & 0xff;
  for (let i = 0; i < places / 2; i++) out[2 + i] = Number(digits[i * 2]) << 4 | Number(digits[i * 2 + 1]);
  return out;
}

/** A string typed, with or without quotes, as the machine's bytes; \xNN is the byte NN. */
export function encodeString(typed: string): Uint8Array {
  let s = typed;
  const trimmed = typed.trim();
  if (trimmed.length >= 2 && trimmed.startsWith("\"") && trimmed.endsWith("\"")) {
    // As the list shows it (JSON), or just quoted.
    try { s = String(JSON.parse(trimmed)); } catch { s = trimmed.slice(1, -1); }
  }
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const escape = /^\\x([0-9a-f]{2})/i.exec(s.slice(i, i + 4));
    if (escape) { out.push(parseInt(escape[1], 16)); i += 3; continue; }
    const c = s.charCodeAt(i);
    if (c >= 0x20 && c < 0x7f) out.push(c);
    else if (c >= 0xff61 && c <= 0xff9f) out.push(0xa1 + c - 0xff61);
    else if (s[i] === "¥") out.push(0x5c);
    else throw new Error(L(`本体にない文字です: ${s[i]}`, `Not a character of the machine: ${s[i]}`));
  }
  return Uint8Array.from(out);
}

/** The variable or array element called `name` (S, B$, P(1), in any case), with its value and place. */
export function findVariable(variables: readonly BasicVariable[], name: string): { value: string; place?: Place } | undefined {
  const key = name.toUpperCase().replace(/\s+/g, "");
  const element = /^([A-Z][A-Z0-9]*[#$]?)(\(.+\))$/.exec(key);
  return element
    ? variables.find(v => v.kind === "array" && v.name === element[1] + "()")?.elements?.find(e => e.index === element[2])
    : variables.find(v => v.kind !== "array" && v.name === key);
}

/**
 * The bytes that set a value where it is: a number, or a string of the same length
 * (another length would move every string after it). An Error with why not.
 */
export function encodeValue(place: Place, typed: string): Uint8Array {
  if (place.type !== "string") return encodeNumber(typed, place.type === "double");
  const bytes = encodeString(typed);
  if (bytes.length !== place.length) {
    throw new Error(L(`文字列は同じ長さだけ書き換えられます（今は ${place.length} 文字、入力は ${bytes.length} 文字）。`,
      `A string can only be changed to one of the same length (it has ${place.length} characters, ${bytes.length} were entered).`));
  }
  return bytes;
}

/** The blocks of the chain: name (trimmed), address, size, bytes in use. */
export interface Block { readonly name: string; readonly address: number; readonly size: number; readonly used: number }

export async function readChain(read: (address: number, length: number) => Promise<Uint8Array>, internalKB: number): Promise<Block[]> {
  const blocks: Block[] = [];
  let at = 0xc0000 - internalKB * 1024 + 0x18;
  for (let n = 0; n < 64 && at < 0xc0000 - 0x22; n++) {
    const h = await read(at, 0x1c);
    if (h[0] !== 0xfb) break;
    const size = le3(h, 0x11), used = le3(h, 0x16);
    if (size < used || used < 0x1c || at + size > 0xc0000) break;
    blocks.push({ name: text(h.subarray(1, 13)).trim(), address: at, size, used });
    at += size;
  }
  return blocks;
}

/**
 * Source text as the machine's bytes for LOAD from the CE-140F: lines ended CR LF,
 * ASCII as it is, half-width kana as A1h-DFh, ¥ as 5Ch. Characters with no byte are
 * returned so the caller can say so.
 */
export function encodeSource(source: string): { bytes: Buffer; unsupported: string; skipped: number } {
  const out: number[] = [];
  let unsupported = "";
  let skipped = 0;
  const lines = source.replace(/^﻿/, "").replace(/\r\n?/g, "\n").split("\n");
  for (const line of lines) {
    // LOAD ends the program at a blank line, and a line with no number is no line of it.
    if (line.trim() === "") continue;
    if (!/^\s*\d/.test(line)) { skipped++; continue; }
    for (const ch of line) {
      const c = ch.codePointAt(0)!;
      if (c === 9) out.push(0x20);
      else if (c >= 0x20 && c < 0x7f) out.push(c);
      else if (c >= 0xff61 && c <= 0xff9f) out.push(0xa1 + c - 0xff61);
      else if (ch === "¥") out.push(0x5c);
      else if (!unsupported.includes(ch)) unsupported += ch;
    }
    out.push(0x0d, 0x0a);
  }
  return { bytes: Buffer.from(out), unsupported, skipped };
}

/** The BASIC line number that each line of the source starts with (undefined for none). */
export function sourceLineNumbers(source: string): Array<number | undefined> {
  return source.replace(/\r\n?/g, "\n").split("\n").map(l => {
    const m = /^\s*(\d+)/.exec(l);
    return m ? Number(m[1]) : undefined;
  });
}

/** An 8.3 name the CE-140F takes (A-Z, 0-9, _ and -), from a PC file name. */
export function driveName(fileName: string): string {
  const keep = (s: string, max: number): string => s.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, max);
  const dot = fileName.lastIndexOf(".");
  const stem = keep(dot > 0 ? fileName.slice(0, dot) : fileName, 8) || "PROGRAM";
  return `${stem}.BAS`;
}
