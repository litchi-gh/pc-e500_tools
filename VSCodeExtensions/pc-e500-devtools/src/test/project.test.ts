// The "new program" sources, tried in the emulator, and the BIN for LOAD M.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, describe, it } from "node:test";
import { AsmHost } from "../asm/assembler";
import { EmulatorClient } from "../emu/client";
import { basicCall, loadProgram, startMachine } from "../emu/prepare";
import { Program } from "../emu/program";
import { parseTestFile, runTests } from "../emu/testfile";
import { setLanguage } from "../l10n";
import { decodeLcd, encodeLcd, HEIGHT, WIDTH } from "../lcd/lcdFile";
import { basicLines, binName, isProgramName, loadMFile, loadMOrigin } from "../project/loadM";
import { templates } from "../project/templates";

const extensionRoot = path.resolve(__dirname, "..", "..");
const repo = path.resolve(extensionRoot, "..", "..");
// The emulator is a repository of its own, beside this one.
const workspace = path.dirname(repo);
const server = path.join(extensionRoot, "out", "server", process.platform === "win32" ? "e500dbg.exe" : "e500dbg.dll");
const core = process.env.E500_CORE ?? path.join(workspace, "Emulator", "bin", "e500core.dll");
const rom = process.env.E500_ROM ?? path.join(workspace, "Emulator", "app", "rom", "PC-E500(7.2).ROM");
const converter = path.join(repo, "FileConverter", "ce140conv.exe");
const assembler = path.join(repo, "Assembler", "app", "e500asm.exe");
const available = [server, core, rom].every(f => fs.existsSync(f));

const host: AsmHost = {
  readText: f => { try { return fs.readFileSync(f, "utf8"); } catch { return undefined; } },
  readBinary: f => { try { return fs.readFileSync(f); } catch { return undefined; } }
};
const folder = fs.mkdtempSync(path.join(os.tmpdir(), "e500new-"));
after(() => fs.rmSync(folder, { recursive: true, force: true }));

function make(id: string, name: string): Program {
  const files = templates().find(t => t.id === id)!.files(name);
  for (const f of files) fs.writeFileSync(path.join(folder, f.name), f.content);
  const file = path.join(folder, files[0].name);
  const program = Program.build(file, fs.readFileSync(file, "utf8"), { host, includeDirectories: [path.join(extensionRoot, "inc")] });
  assert.deepEqual(program.errors, []);
  return program;
}

describe("new programs and BIN files", () => {
  it("assembles every template, in both languages", () => {
    for (const language of ["en", "ja"]) {
      setLanguage(language);
      for (const t of templates()) {
        const program = make(t.id, t.id);
        assert.equal(program.result.issues.length, 0, `${t.id} ${JSON.stringify(program.result.issues)}`);
        assert.ok(program.end <= 0xbfc00);
      }
    }
  });
  it("names the BIN so that the drive takes it", () => {
    assert.equal(binName("c:/a/game.asm"), "GAME.BIN");
    assert.equal(binName("c:/a/my-long program.asm"), "MYLONGPR.BIN");
    assert.equal(binName("c:/a/ゲーム.asm"), "PROGRAM.BIN");
    assert.equal(binName("c:/a/con.asm"), "PROGRAM.BIN");
    assert.deepEqual(["game", "A_1", "nine_char", "1st", "a-b", "", "nul"].map(isProgramName), [true, true, false, false, false, false, false]);
  });
  it("writes the header of LOAD M, and reads it", () => {
    const file = loadMFile(0xbec00, new Uint8Array(46));
    assert.deepEqual([...file.slice(0, 16)], [0xff, 0, 6, 1, 0x10, 0x2e, 0, 0, 0, 0xec, 0x0b, 0xff, 0xff, 0xff, 0, 0x0f]);
    assert.equal(file.length, 62);
    assert.equal(loadMOrigin(file), 0xbec00);
    assert.equal(loadMOrigin(new Uint8Array(40)), undefined);
    assert.throws(() => loadMFile(0xfff00, new Uint8Array(0x101)), RangeError);
  });
  it("writes the same file as ce140conv", { skip: fs.existsSync(converter) && process.platform === "win32" ? false : "no ce140conv here" }, () => {
    const program = make("screen", "conv");
    const raw = path.join(folder, "conv.raw"), out = path.join(folder, "conv.out");
    fs.writeFileSync(raw, program.binary);
    execFileSync(converter, ["bin2bas", "--addr", "0x" + program.origin.toString(16), raw, out], { stdio: "ignore" });
    assert.deepEqual(Buffer.from(loadMFile(program.origin, program.binary)), fs.readFileSync(out));
  });
  it("makes the same bytes as e500asm", { skip: fs.existsSync(assembler) && process.platform === "win32" ? false : "no e500asm here" }, () => {
    for (const t of templates()) {
      const program = make(t.id, "same"), out = path.join(folder, "same.out");
      execFileSync(assembler, [path.join(folder, "same.asm"), "-I", path.join(extensionRoot, "inc"), "-o", out], { stdio: "ignore" });
      assert.deepEqual(Buffer.from(program.binary), fs.readFileSync(out), t.id);
    }
  });
  it("says what to type", () => {
    assert.deepEqual(basicLines(make("text", "hi"), "HI.BIN"), { reserve: "POKE &HBFE03,&H1A,&HFD,&H0B,&H00,&H10,&H00:CALL &HFFFD8", load: "LOAD M \"X:HI.BIN\"", call: "CALL &HBEC00" });
    assert.equal(basicLines(make("routine", "r"), "R.BIN").call, "CALL &HBEC04");
  });
  it("makes an .lcd file that reads back", () => {
    const dots = Uint8Array.from({ length: WIDTH * HEIGHT }, (_, i) => (i * 7 + (i >> 3)) % 3 === 0 ? 1 : 0);
    assert.deepEqual([...decodeLcd(encodeLcd(dots))!.dots], [...dots]);
  });
});

describe("new programs in the emulator", { skip: available ? false : "e500dbg, e500core.dll or the ROM not found" }, () => {
  let client: EmulatorClient, base: string;
  before(async () => {
    client = await startMachine({ server, core, rom, ram: /E650|U6000/i.test(rom) ? 64 : 32 });
    base = await client.saveState();
  });
  after(() => client?.dispose());

  const settle = async (seconds = 1): Promise<string> => { await client.run(768000 * seconds); return (await client.screen()).text ?? ""; };
  const call = async (program: Program): Promise<void> => {
    await client.loadState(base);
    await loadProgram(client, program);
    await client.type(`CLS:${basicCall(program.entry())}\n`);
    await client.run(768000 * 4, { untilTyped: true, settle: 768000 });
  };

  it("minimal: comes back to the prompt", async () => {
    await call(make("minimal", "min"));
    const text = await settle();
    assert.match(text, />/);
    assert.doesNotMatch(text, /ERROR/i);
  });
  it("text: shows its line", async () => {
    await call(make("text", "txt"));
    assert.match(await settle(), /HELLO!/);
  });
  it("routine: passes its tests", async () => {
    await client.loadState(base);
    const program = make("routine", "rout");
    const spec = parseTestFile(fs.readFileSync(path.join(folder, "rout.e500test.json"), "utf8"));
    for (const r of await runTests(client, program, spec)) assert.ok(r.passed, `${r.name}: ${r.messages.join(" ")}`);
  });
  it("BIN: the lines it gives reserve, load and run it", async () => {
    await client.loadState(base);
    const program = make("text", "bin"), file = binName(program.file), disk = path.join(folder, "x");
    fs.mkdirSync(disk, { recursive: true });
    fs.writeFileSync(path.join(disk, file), loadMFile(program.origin, program.binary));
    const lines = basicLines(program, file);
    const enter = async (line: string, seconds: number): Promise<string> => {
      const typed = await client.type(line + "\n");
      assert.equal(typed.skipped, "");
      await client.run(768000 * seconds, { untilTyped: true, settle: 768000 * 2 });
      return settle(2);
    };
    // The POKE line does what the server's own reserve does. It goes to the main menu.
    await client.reserve(program.areaSize(32)!);
    const reserved = await client.area();
    await client.loadState(base);
    await enter(lines.reserve!, 8);
    assert.deepEqual(await client.area(), reserved);
    assert.equal(reserved?.start, program.origin);
    await client.tap("BASIC"); await settle(2);
    assert.ok((await client.mode()).run);
    await client.diskMount(disk);
    try {
      await enter(lines.load, 10);
      for (let i = 0; i < 20 && (await client.mode()).busy; i++) await settle(1);
      assert.deepEqual(await client.read(program.origin, program.binary.length), Buffer.from(program.binary));
      assert.match(await enter("CLS:" + lines.call, 4), /HELLO!/);
    } finally {
      await client.diskMount(undefined);
    }
  });
  it("tests compare the LCD with a picture, and press keys", async () => {
    const program = make("screen", "pic");
    const dots = decodeLcd(fs.readFileSync(path.join(folder, "pic.lcd")))!.dots;
    fs.writeFileSync(path.join(folder, "blank.lcd"), encodeLcd(dots));
    for (let v = 12; v < 20; v++) for (let u = 116; u < 124; u++) dots[v * WIDTH + u] = 1;
    fs.writeFileSync(path.join(folder, "start.lcd"), encodeLcd(dots));
    const basic = `CLS:${basicCall(program.entry())}`, maxCycles = 768000 * 3;
    await client.loadState(base);
    const results = await runTests(client, program, { program: "pic.asm", tests: [
      { name: "same", basic, maxCycles, expect: { picture: "start.lcd" } },
      { name: "other", basic, maxCycles, expect: { picture: "blank.lcd" } },
      { name: "missing", basic, maxCycles, expect: { picture: "none.lcd" } },
      { name: "leaves", basic, maxCycles, keys: ["LEFT", "ON/BRK"], expect: { screen: ">" } }
    ] }, { folder });
    assert.deepEqual(results.map(r => r.passed), [true, false, false, true], JSON.stringify(results));
    assert.match(results[1].messages[0], /64/);
  });
  it("game: the face moves, takes a star, and goes back to BASIC", async () => {
    const program = make("game", "g");
    await call(program);
    const imem = async (name: string, n = 1): Promise<number[]> => [...(await client.internalMemory()).subarray(Number(program.symbols.get(name.toUpperCase())), Number(program.symbols.get(name.toUpperCase())) + n)];
    const hold = async (key: string, seconds: number): Promise<void> => { await client.key(key, true); await settle(seconds); await client.key(key, false); await settle(0.3); };
    const where = async (): Promise<number[]> => imem("face_x", 2);
    assert.deepEqual(await where(), [116, 12]);
    await hold("RIGHT", 10); assert.deepEqual(await where(), [232, 12]);
    await hold("DOWN", 2); assert.deepEqual(await where(), [232, 24]);
    await hold("LEFT", 12); assert.deepEqual(await where(), [0, 24]);
    await hold("UP", 2); assert.deepEqual(await where(), [0, 0]);
    // To where the star is.
    const before = (await imem("score", 2))[0];
    for (let turn = 0; turn < 40 && (await imem("score", 2))[0] === before; turn++) {
      const [x, y] = await where(), [u, v] = await imem("star_x", 2);
      await hold(Math.abs(u - x) > 6 ? (u > x ? "RIGHT" : "LEFT") : v > y ? "DOWN" : "UP", 0.3);
    }
    assert.equal((await imem("score", 2))[0], before + 1);
    // How many turns a second.
    const from = (await imem("count"))[0];
    await settle(3);
    const turns = (((await imem("count"))[0] - from) & 255) / 3;
    assert.ok(turns > 13 && turns < 22, `${turns} turns a second`);
    if (process.env.E500_TIMES) console.log(`game ${turns.toFixed(1)} turns a second`);
    await client.key("ON/BRK", true); await settle();
    await client.key("ON/BRK", false); await settle(2);
    assert.ok(!(await client.mode()).busy);
    await client.type("PRINT 6*7\n");
    await client.run(768000 * 3, { untilTyped: true, settle: 768000 / 2 });
    const text = await settle();
    assert.match(text, /42/);
    assert.doesNotMatch(text, /BREAK|ERROR/i);
  });
  it("screen: draws the picture and the square, moves it, and goes back to BASIC", async () => {
    const program = make("screen", "scr");
    await call(program);
    const expected = (x: number, y: number): string => {
      const dots = decodeLcd(fs.readFileSync(path.join(folder, "scr.lcd")))!.dots;
      for (let v = 0; v < 8; v++) for (let u = 0; u < 8; u++) dots[(y + v) * WIDTH + x + u] = 1;
      return Buffer.from(dots).toString("hex");
    };
    const shown = async (): Promise<string> => {
      const p = Buffer.from((await client.screen()).pixels, "base64");
      return Buffer.from(Uint8Array.from({ length: WIDTH * HEIGHT }, (_, i) => p.length === WIDTH * HEIGHT ? (p[i] ? 1 : 0) : (p[i >> 3] >> (7 - (i & 7))) & 1)).toString("hex");
    };
    const at = async (): Promise<[number, number]> => [(await client.read(program.resolve("sq_x"), 1))[0], (await client.read(program.resolve("sq_y"), 1))[0]];
    const hold = async (key: string, seconds: number): Promise<[number, number]> => {
      await client.key(key, true); await settle(seconds);
      await client.key(key, false); await settle();
      return at();
    };
    assert.deepEqual(await at(), [116, 12]);
    assert.equal(await shown(), expected(116, 12));
    // To each edge, and no further.
    assert.equal((await hold("RIGHT", 12))[0], 232);
    assert.equal(await shown(), expected(232, 12));
    assert.equal((await hold("LEFT", 20))[0], 0);
    assert.equal((await hold("DOWN", 4))[1], 24);
    assert.equal(await shown(), expected(0, 24));
    assert.equal((await hold("UP", 6))[1], 0);
    assert.deepEqual(await hold("SPACE", 1), [116, 12]);
    assert.equal(await shown(), expected(116, 12));
    await client.key("ON/BRK", true); await settle();
    await client.key("ON/BRK", false); await settle(2);
    assert.ok(!(await client.mode()).busy);
    await client.type("PRINT 6*7\n");
    await client.run(768000 * 3, { untilTyped: true, settle: 768000 / 2 });
    const text = await settle();
    assert.match(text, /42/);
    assert.doesNotMatch(text, /BREAK|ERROR/i);
  });
});
