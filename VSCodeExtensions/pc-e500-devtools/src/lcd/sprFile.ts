// Sprites (.spr), as inc/sprite.inc draws them: width, height/8, frames and flags (1 = with
// a mask), then the frames. A frame has a row of bytes for every 8 dots down, left to
// right, bit 0 at the top; with a mask there are two bytes a column, the mask first (1
// where the sprite is drawn) and then the dots.
export const SPR_HEADER = 4;
export const MAX_WIDTH = 64;
export const MAX_ROWS = 4;
export const MAX_FRAMES = 255;

/** A dot of a sprite: what is under it stays, or it is put on or off. */
export const CLEAR = 0, ON = 1, OFF = 2;

export interface Sprite {
  /** 1-64. */
  readonly width: number;
  /** 8, 16, 24 or 32. */
  readonly height: number;
  readonly mask: boolean;
  /** A byte a dot (CLEAR, ON, OFF), row by row. */
  readonly frames: readonly Uint8Array[];
}

export function emptySprite(width = 8, height = 8, frames = 1): Sprite {
  return { width, height, mask: true, frames: Array.from({ length: frames }, () => new Uint8Array(width * height)) };
}

/** Why a file is not a sprite, or the sprite. An empty file is an empty one of 8 x 8. */
export function decodeSpr(bytes: Uint8Array): Sprite | undefined {
  if (bytes.length === 0) return emptySprite();
  if (bytes.length < SPR_HEADER) return undefined;
  const [width, rows, count, flags] = bytes;
  if (width < 1 || width > MAX_WIDTH || rows < 1 || rows > MAX_ROWS || count < 1 || flags > 1) return undefined;
  const mask = flags === 1, step = mask ? 2 : 1, size = width * rows * step;
  if (bytes.length !== SPR_HEADER + size * count) return undefined;
  const height = rows * 8;
  const frames = Array.from({ length: count }, (_, n) => {
    const dots = new Uint8Array(width * height);
    for (let r = 0; r < rows; r++) {
      for (let x = 0; x < width; x++) {
        const at = SPR_HEADER + n * size + (r * width + x) * step;
        const bits = bytes[at + step - 1], covered = mask ? bytes[at] : bits;
        for (let y = 0; y < 8; y++) dots[(r * 8 + y) * width + x] = (bits >> y) & 1 ? ON : (covered >> y) & 1 ? OFF : CLEAR;
      }
    }
    return dots;
  });
  return { width, height, mask, frames };
}

export function encodeSpr(sprite: Sprite): Uint8Array {
  const { width, height, mask, frames } = sprite, rows = height / 8, step = mask ? 2 : 1;
  const out = new Uint8Array(SPR_HEADER + width * rows * step * frames.length);
  out.set([width, rows, frames.length, mask ? 1 : 0]);
  frames.forEach((dots, n) => {
    for (let r = 0; r < rows; r++) {
      for (let x = 0; x < width; x++) {
        let bits = 0, covered = 0;
        for (let y = 0; y < 8; y++) {
          const d = dots[(r * 8 + y) * width + x];
          if (d !== CLEAR) covered |= 1 << y;
          if (d === ON) bits |= 1 << y;
        }
        const at = SPR_HEADER + (n * width * rows + r * width + x) * step;
        if (mask) out[at] = covered;
        out[at + step - 1] = bits;
      }
    }
  });
  return out;
}

/** The sprite as its file would have it: without a mask, what is off is clear. */
export function withoutOff(sprite: Sprite): Sprite {
  return sprite.mask ? sprite : { ...sprite, frames: sprite.frames.map(f => f.map(d => (d === OFF ? CLEAR : d))) };
}

/** Whether what the editor sent can be a sprite. */
export function isSprite(s: Sprite): boolean {
  return Number.isInteger(s.width) && s.width >= 1 && s.width <= MAX_WIDTH && [8, 16, 24, 32].includes(s.height)
    && s.frames.length >= 1 && s.frames.length <= MAX_FRAMES && s.frames.every(f => f.length === s.width * s.height);
}

export function sameSprite(a: Sprite, b: Sprite): boolean {
  return a.width === b.width && a.height === b.height && a.mask === b.mask && a.frames.length === b.frames.length
    && a.frames.every((f, n) => f.every((d, i) => d === b.frames[n][i]));
}
