// The file LOAD M reads: a 16-byte header and the bytes, as SAVE M and
// e500asm -f ce140f write it, and what to type on the PC-E500 for it.
import * as fs from "node:fs";
import * as path from "node:path";
import { hex5, Program } from "../emu/program";

export const HEADER = 16;
const HEAD = [0xff, 0x00, 0x06, 0x01, 0x10], TAIL = [0xff, 0xff, 0xff, 0x00, 0x0f];
const le24 = (n: number): number[] => [n & 255, (n >> 8) & 255, (n >> 16) & 255];

export function loadMFile(origin: number, binary: Uint8Array): Uint8Array {
  if (origin < 0 || origin + binary.length > 0x100000) throw new RangeError(`${hex5(origin)} + ${binary.length}`);
  return Uint8Array.from([...HEAD, ...le24(binary.length), ...le24(origin), ...TAIL, ...binary]);
}

/** Where a LOAD M file goes, or undefined when it is not one. */
export function loadMOrigin(file: Uint8Array): number | undefined {
  return file.length >= HEADER && HEAD.every((b, i) => file[i] === b) && TAIL.every((b, i) => file[11 + i] === b)
    ? file[8] | (file[9] << 8) | (file[10] << 16) : undefined;
}

// Names Windows keeps for devices: the drive would not take them either.
const RESERVED = /^(?:CON|PRN|AUX|NUL|COM\d|LPT\d)$/i;

/** Whether a name can be used as it is for the source and for its BIN on the X: drive (8.3). */
export function isProgramName(name: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_]{0,7}$/.test(name) && !RESERVED.test(name);
}

/** The BIN's name for a source: in capitals, eight characters of those a file on X: may have. */
export function binName(source: string): string {
  const name = path.basename(source, path.extname(source)).toUpperCase().replace(/[^A-Z0-9_]/g, "").slice(0, 8);
  return (!name || RESERVED.test(name) ? "PROGRAM" : name) + ".BIN";
}

/** The other sources of a folder whose output gets the same name (Japanese names, or ones alike in their first eight characters). */
export function sharesName(source: string, nameOf: (file: string) => string): string[] {
  const kind = path.extname(source).toLowerCase(), own = path.basename(source), name = nameOf(source);
  try {
    return fs.readdirSync(path.dirname(path.resolve(source))).filter(f => f.toLowerCase() !== own.toLowerCase() && path.extname(f).toLowerCase() === kind && nameOf(f) === name && f.toUpperCase() !== name);
  } catch { return []; }
}

/** What to type: the machine-code area to reserve first (internal RAM of this size), the LOAD M and the CALL. */
export function basicLines(program: Program, file: string, internalKB = 32): { reserve?: string; load: string; call: string } {
  const size = program.areaSize(internalKB);
  return {
    reserve: size === undefined ? undefined : `POKE &HBFE03,&H1A,&HFD,&H0B,${le24(size).map(b => "&H" + b.toString(16).toUpperCase().padStart(2, "0")).join(",")}:CALL &HFFFD8`,
    load: `LOAD M "X:${file}"`,
    call: `CALL &H${hex5(program.entry())}`
  };
}
