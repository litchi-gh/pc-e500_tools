// A program assembled for running in the emulator: its bytes, where they go, and
// which source line every address came from (breakpoints, the call stack).
import * as path from "node:path";
import { AsmHost, AsmLine, AsmResult, assemble } from "../asm/assembler";
import { evaluate } from "../asm/expression";
import { L } from "../l10n";

export interface BuildOptions {
  readonly includeDirectories?: readonly string[];
  readonly defines?: Readonly<Record<string, number>>;
  readonly host: AsmHost;
}

/** End of the machine-code area: the ROM keeps BFC00h and up for itself. */
export const MACHINE_CODE_TOP = 0xbfc00;

const sameFile = (a: string, b: string): boolean =>
  process.platform === "win32" ? path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase() : path.resolve(a) === path.resolve(b);

export class Program {
  readonly lines: readonly AsmLine[];
  private readonly byAddress: AsmLine[];
  private readonly labelList: Array<[string, number]>;

  private constructor(readonly file: string, readonly result: AsmResult) {
    this.lines = result.lines;
    this.byAddress = [...result.lines].sort((a, b) => a.address - b.address);
    this.labelList = [...result.labels].sort((a, b) => a[1] - b[1]);
  }

  /** Assembles a file; errors are in `program.errors`. */
  static build(file: string, source: string, options: BuildOptions): Program {
    const result = assemble(source, { filePath: file, host: options.host, includeDirectories: options.includeDirectories, defines: options.defines });
    return new Program(path.resolve(file), result);
  }

  get errors(): string[] {
    return this.result.issues.filter(i => i.severity === "error").map(i => `${path.basename(this.file)}(${i.range.line + 1}): ${i.message}`);
  }
  /** Every file the program is made of: the source, INCLUDE and INCBIN. */
  get inputFiles(): readonly string[] { return this.result.inputFiles; }
  get origin(): number { return this.result.origin; }
  get binary(): Uint8Array { return this.result.binary; }
  get end(): number { return this.result.origin + this.result.binary.length; }

  /**
   * An address from text: a label or symbol of the program, or a number
   * (123, &HB8000, $B8000, 0xB8000, B8000h) or any assembler expression.
   */
  resolve(text: string): number {
    // BASIC's &H7B is the assembler's $7B.
    const value = evaluate(text.trim().replace(/&H(?=[0-9A-F])/gi, "$"), name => {
      const v = this.result.symbols.get(name.toUpperCase());
      if (v === undefined) throw new Error(L(`シンボル ${name} はプログラムにありません。`, `The program has no symbol ${name}.`));
      return v;
    }, this.origin);
    return Number(value) & 0xfffff;
  }

  /** The entry point: `entry` if given, else the label START or MAIN, else the first byte. */
  entry(given?: string): number {
    if (given !== undefined && given.trim() !== "") return this.resolve(given);
    for (const name of ["START", "MAIN"]) {
      const at = this.result.labels.get(name);
      if (at !== undefined) return at;
    }
    return this.origin;
  }

  /** The source line whose bytes contain `address`. */
  lineAt(address: number): AsmLine | undefined {
    let lo = 0, hi = this.byAddress.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const l = this.byAddress[mid];
      if (address < l.address) hi = mid - 1;
      else if (address >= l.address + l.length) lo = mid + 1;
      else return l;
    }
    return undefined;
  }

  /** The first instruction at or after `line` (0-based) in `file`, where a breakpoint on that line goes: one for each time the file is included. */
  codeAtOrAfter(file: string, line: number): AsmLine[] {
    let best: AsmLine | undefined;
    for (const l of this.lines) {
      if (!l.code || l.line < line || !sameFile(l.file, file)) continue;
      if (best === undefined || l.line < best.line) best = l;
    }
    return best ? this.lines.filter(l => l.code && l.line === best.line && sameFile(l.file, file)) : [];
  }

  /** Whether the program has lines from this file. */
  hasFile(file: string): boolean {
    return this.lines.some(l => sameFile(l.file, file));
  }

  /** The label at or before `address` within the program, as "LABEL" or "LABEL+3". */
  symbolFor(address: number): string | undefined {
    if (address < this.origin || address >= this.end) return undefined;
    let found: [string, number] | undefined;
    for (const entry of this.labelList) {
      if (entry[1] > address) break;
      found = entry;
    }
    if (!found) return undefined;
    return address === found[1] ? found[0] : `${found[0]}+${(address - found[1]).toString(16).toUpperCase()}h`;
  }

  get labels(): ReadonlyArray<[string, number]> { return this.labelList; }
  get symbols(): ReadonlyMap<string, bigint> { return this.result.symbols; }

  /**
   * The machine-code area this program needs: from its first byte up to BFC00h,
   * when it lies in internal RAM below that (undefined otherwise: it goes where it is).
   */
  areaSize(internalKB: number): number | undefined {
    const bottom = 0xc0000 - internalKB * 1024;
    if (this.binary.length === 0 || this.origin < bottom || this.end > MACHINE_CODE_TOP) return undefined;
    return MACHINE_CODE_TOP - this.origin;
  }
}

/** Formats an address as five hex digits. */
export function hex5(address: number): string {
  return (address & 0xfffff).toString(16).toUpperCase().padStart(5, "0");
}

/** Parses a number written the PC-E500 or assembler way: 123, &H7B, $7B, 0x7B, 7Bh. */
export function parseNumber(text: string): number | undefined {
  const s = text.trim();
  let m: RegExpExecArray | null;
  if ((m = /^&H([0-9A-F]+)$/i.exec(s)) || (m = /^\$([0-9A-F]+)$/i.exec(s)) || (m = /^0x([0-9A-F]+)$/i.exec(s)) || (m = /^([0-9][0-9A-F]*)H$/i.exec(s))) return parseInt(m[1], 16);
  if (/^-?[0-9]+$/.test(s)) return parseInt(s, 10);
  return undefined;
}
