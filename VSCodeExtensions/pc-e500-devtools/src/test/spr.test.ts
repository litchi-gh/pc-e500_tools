import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CLEAR, decodeSpr, emptySprite, encodeSpr, isSprite, OFF, ON, sameSprite, Sprite, withoutOff } from "../lcd/sprFile";

const sprite = (width: number, height: number, count: number, mask = true): Sprite => ({
  width, height, mask, frames: Array.from({ length: count }, (_, n) => Uint8Array.from({ length: width * height }, (_, i) => { const v = (i * 7 + n * 5 + (i >> 4)) % 3; return !mask && v === OFF ? CLEAR : v; }))
});

describe("sprite files", () => {
  it("reads what it writes", () => {
    for (const [w, h, n, m] of [[8, 8, 1, true], [9, 16, 3, true], [64, 32, 2, true], [1, 8, 1, false], [12, 24, 4, false]] as const) {
      const s = sprite(w, h, n, m), bytes = encodeSpr(s);
      assert.equal(bytes.length, 4 + w * (h / 8) * (m ? 2 : 1) * n);
      assert.ok(sameSprite(decodeSpr(bytes)!, s), `${w}x${h}`);
      assert.ok(isSprite(s));
    }
  });
  it("has the layout sprite.inc draws", () => {
    const f = new Uint8Array(16 * 2);
    // 2 x 16: the left column on at the top, the right one off at y = 9.
    const s: Sprite = { width: 2, height: 16, mask: true, frames: [f] };
    f[0] = ON; f[9 * 2 + 1] = OFF;
    assert.deepEqual([...encodeSpr(s)], [2, 2, 1, 1, 1, 1, 0, 0, 0, 0, 2, 0]);
    assert.deepEqual([...encodeSpr({ ...s, mask: false })], [2, 2, 1, 0, 1, 0, 0, 0]);
  });
  it("takes an empty file as an empty sprite, and nothing that does not fit", () => {
    assert.ok(sameSprite(decodeSpr(new Uint8Array(0))!, emptySprite()));
    const good = encodeSpr(sprite(8, 8, 2));
    for (const bad of [good.slice(0, 3), good.slice(0, -1), Uint8Array.from([0, 1, 1, 1]), Uint8Array.from([65, 1, 1, 0, ...new Uint8Array(65)]), Uint8Array.from([8, 5, 1, 0, ...new Uint8Array(40)]), Uint8Array.from([8, 1, 0, 1]), Uint8Array.from([8, 1, 1, 2, ...new Uint8Array(16)])]) assert.equal(decodeSpr(bad), undefined);
    assert.ok(!isSprite({ ...emptySprite(), height: 12 }) && !isSprite({ ...emptySprite(), width: 65 }) && !isSprite({ ...emptySprite(), frames: [] }) && !isSprite({ ...emptySprite(), frames: [new Uint8Array(3)] }));
  });

  it("has no dots that are off without a mask", () => {
    const s = { width: 8, height: 8, mask: false, frames: [Uint8Array.from({ length: 64 }, (_, i) => i % 3)] };
    const clean = withoutOff(s);
    assert.ok(clean.frames[0].every(d => d !== OFF));
    assert.ok(sameSprite(decodeSpr(encodeSpr(s))!, clean));
  });
});
