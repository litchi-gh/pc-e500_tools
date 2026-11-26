// The LCD as a PNG, for looking at a program's screen.
import * as zlib from "node:zlib";

const TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
const crc = (data: Uint8Array): number => (data.reduce((c, b) => TABLE[(c ^ b) & 255] ^ (c >>> 8), 0xffffffff) ^ 0xffffffff) >>> 0;

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc(body), body.length + 4);
  return out;
}

/** 240 x 32 dots, one bit each from the left (the server's screen), as a PNG `scale` times as big. */
export function lcdPng(bits: Uint8Array, scale = 4): Buffer {
  const width = 240, height = 32, w = width * scale, h = height * scale, row = Math.ceil(w / 8) + 1;
  const raw = Buffer.alloc(row * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = Math.floor(y / scale) * width + Math.floor(x / scale);
    if ((bits[i >> 3] >> (7 - (i & 7))) & 1) raw[y * row + 1 + (x >> 3)] |= 0x80 >> (x & 7);
  }
  const head = Buffer.alloc(13);
  head.writeUInt32BE(w, 0);
  head.writeUInt32BE(h, 4);
  head[8] = 1; // one bit a dot
  head[9] = 3; // of a palette
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", head),
    chunk("PLTE", Buffer.from([189, 208, 139, 36, 53, 29])), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))
  ]);
}
