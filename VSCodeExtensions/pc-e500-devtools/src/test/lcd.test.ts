import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fileNameAt } from "../asm/definition";
import { decodeLcd, dotPlace, HEIGHT, WIDTH } from "../lcd/lcdFile";

describe("LCD picture files", () => {
  it("puts every dot in a place of its own", () => {
    const seen = new Set<number>();
    for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) {
      const p = dotPlace(x, y);
      assert.ok(p.offset >= 0 && p.offset < 1024 && p.column >= 0 && p.column < 64);
      seen.add(p.offset * 8 + p.bit);
    }
    assert.equal(seen.size, WIDTH * HEIGHT);
    // The four corners of the two halves.
    assert.deepEqual([dotPlace(0, 0).offset, dotPlace(64, 0).offset, dotPlace(120, 0).offset, dotPlace(239, 31).offset], [512, 0, 4 * 64 + 55, 512 + 7 * 64]);
  });
  it("reads .lcd and .pixels by their size, and no other", () => {
    const lcd = new Uint8Array(1024), pixels = new Uint8Array(WIDTH * HEIGHT);
    for (const [x, y] of [[0, 0], [63, 31], [64, 7], [119, 8], [120, 0], [175, 31], [176, 16], [239, 31]]) {
      const p = dotPlace(x, y);
      lcd[p.offset] |= 1 << p.bit;
      pixels[y * WIDTH + x] = 255;
    }
    const a = decodeLcd(lcd)!, b = decodeLcd(pixels)!;
    assert.deepEqual([a.format, b.format], ["lcd", "pixels"]);
    assert.deepEqual([...a.dots], [...b.dots]);
    assert.equal(a.dots.reduce((n, d) => n + d, 0), 8);
    assert.equal(decodeLcd(new Uint8Array(1000)), undefined);
  });
  it("finds the file name of an INCBIN", () => {
    assert.deepEqual(fileNameAt("logo: INCBIN \"assets/title.lcd\" ; x", "INCBIN"), { name: "assets/title.lcd", start: 13, end: 31 });
    assert.equal(fileNameAt("  incbin 'a.bin',16,32", "INCBIN")?.name, "a.bin");
    assert.equal(fileNameAt("  .INCBIN \"a.bin\"", "INCBIN")?.name, "a.bin");
    assert.equal(fileNameAt("; INCBIN \"a.bin\"", "INCBIN"), undefined);
    assert.equal(fileNameAt("  DB \"INCBIN \"", "INCBIN"), undefined);
  });
});
