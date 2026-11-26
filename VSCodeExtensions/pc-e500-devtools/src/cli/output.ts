// What e500asm writes besides the bytes: Intel HEX, the listing and the symbols.
import * as path from "node:path";
import { AsmResult } from "../asm/assembler";

const hex = (n: number, width: number): string => n.toString(16).toUpperCase().padStart(width, "0");

export function intelHex(origin: number, binary: Uint8Array): string {
  const out: string[] = [];
  const record = (address: number, type: number, data: readonly number[]): string => {
    const bytes = [data.length, (address >> 8) & 255, address & 255, type, ...data];
    return ":" + bytes.map(b => hex(b, 2)).join("") + hex(-bytes.reduce((n, b) => n + b, 0) & 255, 2);
  };
  let bank = -1;
  for (let offset = 0; offset < binary.length;) {
    const address = origin + offset;
    if (address >> 16 !== bank) { bank = address >> 16; out.push(record(0, 4, [bank >> 8, bank & 255])); }
    const size = Math.min(16, binary.length - offset, 0x10000 - (address & 0xffff));
    out.push(record(address & 0xffff, 0, [...binary.subarray(offset, offset + size)]));
    offset += size;
  }
  out.push(record(0, 1, []));
  return out.join("\n") + "\n";
}

/** Address, bytes and source of every line. `text` gives a source file. */
export function listingText(result: AsmResult, text: (file: string) => string): string {
  const files = new Map<string, string[]>();
  const lineOf = (file: string, line: number): string | undefined => {
    if (!files.has(file)) files.set(file, text(file).replace(/\r\n?/g, "\n").split("\n"));
    const lines = files.get(file)!;
    // Nothing comes after the last newline.
    return line === lines.length - 1 && lines[line] === "" ? undefined : lines[line];
  };
  const out = ["Address  Machine code              Source"];
  for (const l of result.listing) {
    const line = lineOf(l.file, l.line);
    if (line === undefined) continue;
    const source = `${path.basename(l.file)}(${l.line + 1}): ${line}`;
    if (l.data.length === 0) out.push(`${hex(l.address, 5)}                            ${source}`);
    for (let i = 0; i < l.data.length; i += 8) out.push(`${hex(l.address + i, 5)}    ${[...l.data.subarray(i, i + 8)].map(b => hex(b, 2)).join(" ").padEnd(23)}   ${i === 0 ? source : ""}`);
  }
  return out.join("\n") + "\n";
}

/** "name EQU $value", a line each: can be INCLUDEd. */
export function symbolText(result: AsmResult): string {
  // A negative value as 64 bits, as e500asm writes it.
  return [...result.symbols].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${result.names.get(k) ?? k} EQU $${BigInt.asUintN(64, v).toString(16).toUpperCase()}`).join("\n") + "\n";
}
