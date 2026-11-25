import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LcdFiles, LcdPicture } from "../lcd/lcdDocument";
import { decodeLcd, dotPlace, encodeLcd, encodePixels, HEIGHT, partnerPath, WIDTH } from "../lcd/lcdFile";

class Files implements LcdFiles {
  readonly all = new Map<string, Uint8Array>();
  read(p: string): Promise<Uint8Array | undefined> { return Promise.resolve(this.all.get(p)); }
  write(p: string, bytes: Uint8Array): Promise<void> { this.all.set(p, Uint8Array.from(bytes)); return Promise.resolve(); }
}
const pattern = (n: number): Uint8Array => Uint8Array.from({ length: WIDTH * HEIGHT }, (_, i) => (i * 7 + n) % 5 === 0 ? 1 : 0);

describe("LCD picture editing", () => {
  it("keeps the bits that are no dot of the screen", () => {
    const used = new Uint8Array(1024);
    for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) { const p = dotPlace(x, y); used[p.offset] |= 1 << p.bit; }
    const base = Uint8Array.from({ length: 1024 }, (_, i) => (i * 37 + 11) & 255);
    const out = encodeLcd(pattern(1), base);
    out.forEach((b, i) => assert.equal(b & ~used[i], base[i] & ~used[i]));
    assert.deepEqual([...decodeLcd(out)!.dots], [...pattern(1)]);
    assert.deepEqual([...encodeLcd(decodeLcd(base)!.dots, base)], [...base]);
  });
  it("writes .pixels with the value that file has for a dot", () => {
    const base = pattern(0).map(d => d * 255);
    const out = encodePixels(pattern(1), base);
    assert.deepEqual([...new Set(out)].sort(), [0, 255]);
    assert.deepEqual([...decodeLcd(out)!.dots], [...pattern(1)]);
    assert.deepEqual([...new Set(encodePixels(pattern(1)))].sort(), [0, 1]);
  });
  it("takes the other file along when it has the same picture, and only then", async () => {
    assert.deepEqual(partnerPath("/a/title.LCD"), { path: "/a/title.pixels", format: "pixels" });
    assert.equal(partnerPath("/a/title.dat"), undefined);
    const files = new Files();
    files.all.set("/a.lcd", encodeLcd(pattern(0)));
    files.all.set("/a.pixels", encodePixels(pattern(0)));
    const p = new LcdPicture("/a.lcd");
    p.load(files.all.get("/a.lcd")!);
    assert.equal(p.dirty, false);
    p.dots = pattern(1);
    assert.equal(p.dirty, true);
    assert.equal(await p.save(files), "written");
    assert.equal(p.dirty, false);
    assert.ok(p.isDisk(files.all.get("/a.lcd")));
    assert.deepEqual([...decodeLcd(files.all.get("/a.pixels")!)!.dots], [...pattern(1)]);
    // Another picture there is left as it is.
    const other = encodePixels(pattern(3));
    files.all.set("/a.pixels", other);
    p.dots = pattern(2);
    assert.equal(await p.save(files), "different");
    assert.deepEqual([...files.all.get("/a.pixels")!], [...other]);
    // The other way, and with nothing there.
    const q = new LcdPicture("/a.pixels");
    q.load(files.all.get("/a.pixels")!);
    files.all.set("/a.lcd", encodeLcd(pattern(3)));
    q.dots = pattern(4);
    assert.equal(await q.save(files), "written");
    assert.deepEqual([...decodeLcd(files.all.get("/a.lcd")!)!.dots], [...pattern(4)]);
    files.all.delete("/a.pixels");
    const r = new LcdPicture("/a.lcd");
    r.load(files.all.get("/a.lcd")!);
    r.dots = pattern(1);
    assert.equal(await r.save(files), "none");
    assert.equal(files.all.has("/a.pixels"), false);
  });
  it("takes an empty file as a blank picture, and no other size", async () => {
    const files = new Files();
    const p = new LcdPicture("/new.lcd");
    p.load(new Uint8Array(0));
    assert.equal(p.wrongSize, undefined);
    p.dots = pattern(1);
    await p.save(files);
    assert.equal(files.all.get("/new.lcd")!.length, 1024);
    p.load(new Uint8Array(1000));
    assert.equal(p.wrongSize, 1000);
  });
});
