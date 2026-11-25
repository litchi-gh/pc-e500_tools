// Pictures of the 240 x 32 LCD in files:
// - .lcd, 1024 bytes: the display RAM of the two controllers as it is, controller 0's
//   512 bytes and then controller 1's, each 8 pages of 64 columns, a byte 8 dots down
//   (bit 0 at the top);
// - .pixels, 7680 bytes: a byte a dot, row by row, 0 for off.
export const WIDTH = 240;
export const HEIGHT = 32;
export const LCD_BYTES = 1024;

export type LcdFormat = "lcd" | "pixels";

export interface DotPlace {
  readonly controller: 0 | 1;
  readonly page: number;
  readonly column: number;
  readonly bit: number;
  /** Byte in a .lcd file. */
  readonly offset: number;
}

/** Where a dot is in the display RAM (with the start line at 0, as these files have it). */
export function dotPlace(x: number, y: number): DotPlace {
  const controller = x < 64 || x >= 176 ? 1 : 0;
  const column = x < 64 ? x : x < 120 ? x - 64 : x < 176 ? 175 - x : 239 - x;
  // The right half of the glass is wired to the lower 32 rows, its columns running back.
  const row = y + (x >= 120 ? 32 : 0);
  const page = row >> 3;
  return { controller, page, column, bit: row & 7, offset: controller * 512 + page * 64 + column };
}

/** The dots of a file, one byte each (0 or 1), by its size; undefined when it is neither. */
export function decodeLcd(bytes: Uint8Array): { format: LcdFormat; dots: Uint8Array } | undefined {
  const dots = new Uint8Array(WIDTH * HEIGHT);
  if (bytes.length === LCD_BYTES) {
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const p = dotPlace(x, y);
        dots[y * WIDTH + x] = (bytes[p.offset] >> p.bit) & 1;
      }
    }
    return { format: "lcd", dots };
  }
  if (bytes.length === dots.length) return { format: "pixels", dots: dots.map((_, i) => (bytes[i] ? 1 : 0)) };
  return undefined;
}

/**
 * The .lcd file of a picture (a byte a dot, 0 for off). The bits no dot of the screen
 * uses (the symbols and the hidden columns) come from `base`, the file as it was.
 */
export function encodeLcd(dots: Uint8Array, base?: Uint8Array): Uint8Array {
  const bytes = base?.length === LCD_BYTES ? Uint8Array.from(base) : new Uint8Array(LCD_BYTES);
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const p = dotPlace(x, y);
      if (dots[y * WIDTH + x]) bytes[p.offset] |= 1 << p.bit;
      else bytes[p.offset] &= ~(1 << p.bit);
    }
  }
  return bytes;
}

/** The .pixels file of a picture; dots that were on keep the value they had in `base`. */
export function encodePixels(dots: Uint8Array, base?: Uint8Array): Uint8Array {
  const old = base?.length === dots.length ? base : undefined;
  const on = old?.find(b => b !== 0) ?? 1;
  return Uint8Array.from(dots, (d, i) => (d ? old?.[i] || on : 0));
}

export function encode(format: LcdFormat, dots: Uint8Array, base?: Uint8Array): Uint8Array {
  return format === "lcd" ? encodeLcd(dots, base) : encodePixels(dots, base);
}

/** Whether two pictures are the same. */
export function sameDots(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** The other of "name.lcd" and "name.pixels", with the case of the extension kept simple. */
export function partnerPath(path: string): { path: string; format: LcdFormat } | undefined {
  const m = /^(.*)\.(lcd|pixels)$/i.exec(path);
  if (!m) return undefined;
  return m[2].toLowerCase() === "lcd" ? { path: m[1] + ".pixels", format: "pixels" } : { path: m[1] + ".lcd", format: "lcd" };
}

/** What a file is by its name. */
export function formatOf(path: string): LcdFormat {
  return /\.pixels$/i.test(path) ? "pixels" : "lcd";
}
