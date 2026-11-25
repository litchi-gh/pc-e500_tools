// iocs.inc and the other include files: that they assemble together, and that what they
// say is so in the emulator.
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, describe, it } from "node:test";
import { AsmHost } from "../asm/assembler";
import { COMMANDS, commandNamed, commandsAt, commandsOf, deviceBefore, DEVICES, FILE_COMMANDS, iocsInclude, literal, wantsCommand } from "../asm/iocs";
import { EmulatorClient } from "../emu/client";
import { loadProgram, startMachine } from "../emu/prepare";
import { Program } from "../emu/program";
import { encodeLcd, HEIGHT, WIDTH } from "../lcd/lcdFile";

const extensionRoot = path.resolve(__dirname, "..", "..");
const repo = path.resolve(extensionRoot, "..", "..");
// The emulator is a repository of its own, beside this one.
const workspace = path.dirname(repo);
const inc = path.join(extensionRoot, "inc");
const server = path.join(extensionRoot, "out", "server", process.platform === "win32" ? "e500dbg.exe" : "e500dbg.dll");
const core = process.env.E500_CORE ?? path.join(workspace, "Emulator", "bin", "e500core.dll");
const rom = process.env.E500_ROM ?? path.join(workspace, "Emulator", "app", "rom", "PC-E500(7.2).ROM");
const available = [server, core, rom].every(f => fs.existsSync(f));
const folder = fs.mkdtempSync(path.join(os.tmpdir(), "e500inc-"));
after(() => fs.rmSync(folder, { recursive: true, force: true }));

const host: AsmHost = {
  readText: f => { try { return fs.readFileSync(f, "utf8"); } catch { return undefined; } },
  readBinary: f => { try { return fs.readFileSync(f); } catch { return undefined; } }
};
const build = (source: string): Program => {
  const file = path.join(folder, "t.asm");
  const program = Program.build(file, source, { host, includeDirectories: [inc] });
  assert.deepEqual(program.errors, []);
  return program;
};
const ALL = fs.readdirSync(inc).filter(f => f.endsWith(".inc"));
const CONSTANTS = "        INCLUDE \"hardware.inc\"\n        INCLUDE \"iocs.inc\"\n        INCLUDE \"keycode.inc\"\n";
const CODE = ["game", "screen", "sprite", "pad", "text", "random"].map(n => `        INCLUDE "${n}.inc"\n`).join("");

describe("include files", () => {
  it("has iocs.inc as the table says", () => {
    assert.equal(fs.readFileSync(path.join(inc, "iocs.inc"), "utf8").replace(/\r\n/g, "\n"), iocsInclude());
  });
  it("assembles all of them together, with no name twice", () => {
    const p = build(`        ORG $BE000\n${CONSTANTS}start:  RETF\n${CODE}        END\n`);
    assert.deepEqual(p.result.issues, []);
    assert.equal(ALL.length, 9);
    // Names only take no room.
    assert.equal(build(`        ORG $BE000\n${CONSTANTS}start:  RETF\n        END\n`).binary.length, 1);
  });
  it("knows the calls", () => {
    const names = [...COMMANDS, ...FILE_COMMANDS].map(c => c.constant);
    assert.equal(new Set(names).size, names.length);
    for (const d of DEVICES) {
      const numbers = COMMANDS.filter(c => c.device === d.number || c.device < 0).map(c => c.number);
      assert.equal(new Set(numbers).size, numbers.length, d.constant);
    }
    for (const c of COMMANDS) { assert.equal(c.inJa === undefined, c.inEn === undefined); assert.equal(c.outJa === undefined, c.outEn === undefined); }
    assert.equal(commandNamed("scrn_puts")?.number, 0x42);
    assert.ok(commandsOf(1).some(c => c.constant === "KYBD_READ") && !commandsOf(1).some(c => c.constant === "SCRN_PUTS") && commandsOf(1).some(c => c.constant === "IO_INIT"));
  });
  it("has snippets that assemble", () => {
    const snippets = JSON.parse(fs.readFileSync(path.join(extensionRoot, "snippets", "asm.json"), "utf8")) as Record<string, { prefix: string; body: string[] }>;
    for (const { prefix, body } of Object.values(snippets)) {
      const whole = prefix === "game-loop";
      const text = body.join("\n").replace(/\$\{\d+\|([^,|]*)[^}]*\}/g, "$1").replace(/\$\{\d+:([^}]*)\}/g, "$1").replace(/(\\)?\$(\d)/g, (m, escaped: string) => (escaped ? m : prefix === "iocs" ? "SCRN_CLEAR" : "")).replace(/\\\$/g, "$");
      const lines = text.replace(/SCRN_CLEAR$/, "").split("\n").map(l => (/^\w+:|^\s/.test(l) ? l : "        " + l)).join("\n");
      build(`        ORG $BD000\n${whole ? "" : CONSTANTS}${lines}\n${whole ? "" : "message: DB 1\nlength: DB 1\nplayer: DB 1\n" + CODE}        END\n`);
    }
  });
  it("tells the device from the lines before", () => {
    const lines = ["        MV    (CL),DEV_KYBD", "        MV    (CH),0", "        MV    IL,$41"];
    assert.equal(deviceBefore(lines, 2), 1);
    assert.deepEqual(commandsAt(lines, 2, 0x41).map(c => c.constant), ["KYBD_MATRIX"]);
    assert.equal(deviceBefore(["start:  MV ($D6),0", "  MV IL,1"], 1), 0);
    assert.equal(deviceBefore(["  MVW (CX),$0003 ; printer", "  MV IL,1"], 1), 3);
    assert.equal(deviceBefore(["  MV (CL),1", "  RETF", "next: MV IL,1"], 2), undefined);
    assert.equal(deviceBefore(["  MV (CL),1", "  CALLF IOCS", "  MV IL,1"], 2), 1);
    assert.equal(deviceBefore(["  MV IL,1"], 0), undefined);
    assert.deepEqual(commandsAt(["  MV IL,1", "  CALLF FCS"], 0, 1).map(c => c.constant), ["FCS_OPEN"]);
    assert.ok(commandsAt(["  MV IL,$41", "  CALLF IOCS"], 0, 0x41).length > 3);
    assert.deepEqual(["$42", "42h", "0x42", "66", "&H42", "x"].map(literal), [0x42, 0x42, 0x42, 66, 0x42, undefined]);
    assert.deepEqual(["  MV IL,", "a: mv il, SC", "  MV IL,$4", "  MV A,", "  MV IL,1 ", "  MVW IL,"].map(wantsCommand), [true, true, true, false, false, false]);
  });
});

describe("include files in the emulator", { skip: available ? false : "e500dbg, e500core.dll or the ROM not found" }, () => {
  let client: EmulatorClient, base: string;
  before(async () => {
    client = await startMachine({ server, core, rom, ram: /E650|U6000/i.test(rom) ? 64 : 32 });
    base = await client.saveState();
  });
  after(() => client?.dispose());

  let program: Program;
  const use = async (source: string): Promise<void> => {
    await client.loadState(base);
    program = build(`        ORG $BE000\n${CONSTANTS}${source}\n${CODE}        END\n`);
    await loadProgram(client, program);
  };
  const call = async (label: string, seconds = 3, registers: Record<string, number> = {}): Promise<{ A: number; F: number; cycles: number }> => {
    await client.call(program.entry(label), true, registers);
    const r = await client.run(768000 * seconds);
    assert.equal(r.reason, "return", `${label} at ${r.pc.toString(16)}`);
    return { A: r.registers!.A, F: r.registers!.F, cycles: r.cycles };
  };
  const shown = async (): Promise<Uint8Array> => {
    const p = Buffer.from((await client.screen()).pixels, "base64");
    return Uint8Array.from({ length: WIDTH * HEIGHT }, (_, i) => (p[i >> 3] >> (7 - (i & 7))) & 1);
  };
  const lit = (dots: Uint8Array): string[] => [...dots.keys()].filter(i => dots[i]).map(i => `${i % WIDTH},${Math.floor(i / WIDTH)}`);
  const at = async (name: string, length: number): Promise<number[]> => [...await client.read(program.resolve(name), length)];

  const IOCS_SOURCE = `
screen_: MV   (CL),DEV_SCRN
        MV    (CH),0
        MV    IL,SCRN_CLEAR
        CALLF IOCS
        MV    (CL),DEV_SCRN
        MV    (CH),0
        MV    (BL),3
        MV    (BH),1
        MV    X,message
        MV    Y,5
        MV    IL,SCRN_PUTS
        CALLF IOCS
        MV    A,'!'
        MV    (CL),DEV_SCRN
        MV    (CH),0
        MV    IL,SCRN_PUTC
        CALLF IOCS
        RETF
message: DB   "HELLO"
clear:  MVW   (CX),DEV_SCRN
        MV    IL,SCRN_CLEAR
        CALLF IOCS
        RETF
dot:    MVW   (CX),DEV_SCRN
        MV    X,100
        MV    Y,20
        MV    A,0
        MV    IL,SCRN_PSET
        CALLF IOCS
        MVW   (CX),DEV_SCRN
        MV    X,100
        MV    Y,20
        MV    IL,SCRN_POINT
        CALLF IOCS
        RETF
line:   MVW   (CX),DEV_SCRN
        MV    A,0
        MV    [DOTSOP],A
        MV    BA,$FFFF
        MV    [LINPTN],BA
        MV    X,10
        MV    Y,5
        MVW   (BX),13
        MVW   (DX),5
        MV    IL,SCRN_LINE
        CALLF IOCS
        RETF
box:    MVW   (CX),DEV_SCRN
        MV    A,0
        MV    [DOTSOP],A
        MV    BA,$FFFF
        MV    [LINPTN],BA
        MV    X,50
        MV    Y,10
        MVW   (BX),52
        MVW   (DX),11
        MV    IL,SCRN_BOX
        CALLF IOCS
        RETF
dots:   MVW   (CX),DEV_SCRN
        MV    A,0
        MV    [DOTSOP],A
        MV    A,$81
        MV    X,200
        MV    Y,8
        MV    IL,SCRN_DOTS_WRITE
        CALLF IOCS
        MVW   (CX),DEV_SCRN
        MV    X,200
        MV    Y,8
        MV    IL,SCRN_DOTS_READ
        CALLF IOCS
        RETF
row:    MVW   (CX),DEV_SCRN
        MV    (BH),2
        MV    X,row_data
        MV    IL,SCRN_ROW_WRITE
        CALLF IOCS
        MVW   (CX),DEV_SCRN
        MV    (BH),2
        MV    X,row_back
        MV    IL,SCRN_ROW_READ
        CALLF IOCS
        RETF
row_data: DB  1,2,4,8
        DS    232,0
        DB    16,32,64,128
row_back: DS  240,0
peek:   MVW   (CX),DEV_KYBD
        MV    IL,KYBD_PEEK
        CALLF IOCS
        MV    [key_a],BA
        RETF
key:    MVW   (CX),DEV_KYBD
        MV    A,0
        MV    IL,KYBD_READ
        CALLF IOCS
        MV    [key_a],BA
        MV    [key_i],I
        RETF
flush:  MVW   (CX),DEV_KYBD
        MV    IL,KYBD_CLEAR
        CALLF IOCS
        RETF
key_a:  DB    0,0
key_i:  DB    0,0
`;
  it("calls the screen by the names of iocs.inc", async () => {
    await use(IOCS_SOURCE);
    await call("screen_");
    assert.match((await client.screen()).text ?? "", /^\s*\n? {3}HELLO!/m);
    await call("clear");
    assert.deepEqual(lit(await shown()), []);
    assert.equal((await call("dot")).A, 1);
    assert.deepEqual(lit(await shown()), ["100,20"]);
    await call("clear"); await call("line");
    assert.deepEqual(lit(await shown()), ["10,5", "11,5", "12,5", "13,5"]);
    await call("clear"); await call("box");
    assert.deepEqual(lit(await shown()), ["50,10", "51,10", "52,10", "50,11", "51,11", "52,11"]);
    await call("clear");
    assert.equal((await call("dots")).A, 0x81);
    assert.deepEqual(lit(await shown()), ["200,8", "200,15"]);
    await call("clear"); await call("row");
    assert.deepEqual(lit(await shown()), ["0,16", "1,17", "2,18", "3,19", "123,20", "122,21", "121,22", "120,23"]);
    assert.deepEqual(await at("row_back", 240), [1, 2, 4, 8, ...new Array<number>(232).fill(0), 16, 32, 64, 128]);
  });
  it("reads keys by the names of iocs.inc and keycode.inc", async () => {
    await use(IOCS_SOURCE);
    const press = async (key: string): Promise<void> => { await client.key(key, true); await client.run(768000 / 5); };
    for (const [key, matrix, code] of [["A", "MTX_A", "'A'"], ["SPACE", "MTX_SPACE", "KEY_SPACE"], ["ENTER", "MTX_ENTER", "KEY_ENTER"], ["LEFT", "MTX_LEFT", "KEY_LEFT"], ["UP", "MTX_UP", "KEY_UP"], ["5", "MTX_0+5", "'5'"], ["BS", "MTX_BS", "KEY_BS"], ["F1", "MTX_F1", ""]] as const) {
      await client.loadState(base);
      await loadProgram(client, program);
      await call("flush");
      // Interrupts run while the routine waits in the prompt's place: a program that is busy.
      await client.call(program.entry("flush"), true);
      await client.run(768000);
      const busy = build(`        ORG $BE000\n${CONSTANTS}wait:   PUSHU IMR\n        MV (IMR),IRM+MTI+KEYI\n        MV I,$FFFF\nw1:     DEC I\n        JRNZ w1\n        MV I,$FFFF\nw2:     DEC I\n        JRNZ w2\n        POPU IMR\n        RETF\n${IOCS_SOURCE}\n        END\n`);
      await loadProgram(client, busy);
      program = busy;
      await client.call(busy.entry("wait"), true);
      await client.run(100);
      await press(key);
      const r = await client.run(768000 * 4);
      await client.key(key, false);
      assert.equal(r.reason, "return");
      await call("peek");
      const [a, b] = await at("key_a", 2);
      assert.equal(b, 1, `${key}: a key`);
      assert.equal(a, busy.resolve(matrix), key);
      if (code) {
        await call("key");
        assert.deepEqual([await at("key_i", 1), await at("key_a", 1)], [[1], [busy.resolve(code)]], key);
      }
    }
  });

  const GAME_SOURCE = `
load:   CALL  game_start
        MV    X,picture
        CALL  screen_load
        CALL  screen_keep
        CALL  screen_show
        JP    leave_
show:   CALL  screen_show
        RETF
clear:  CALL  screen_clear
        RETF
restore: CALL screen_restore
        RETF
leave_: MV    I,$C0             ; as game_end, without its clearing of the screen
        MVL   ($00),[game_saved]
        POPU  IMR
        RETF
draw:   MV    X,[arg_x]
        MV    ($24),X
        MV    A,[arg_y]
        MV    (sprite_y),A
        MV    X,sprite_file
        MV    A,[arg_frame]
        CALL  sprite_draw
        RETF
hit:    MV    I,8
        MVL   (hit_ax),[boxes]
        CALL  box_hit
        RETF
write:  MV    (text_x),6
        MV    (text_row),1
        MV    X,text_
        CALL  text_draw
        MV    I,[value]
        CALL  number_draw
        MV    A,(text_x)
        RETF
rnd:    CALL  random
        RETF
rnd10:  MV    IL,10
        CALL  random_below
        RETF
wait:   PUSHU IMR
        AND   (ISR),$FE
        MV    A,10
        CALL  game_wait
        POPU  IMR
        RETF
pads:   PUSHU IMR
        MV    (pad_now),0
        CALL  pad_read
        MV    [pad_out],A
        MV    A,(pad_new)
        MV    [pad_out+1],A
        CALL  pad_read
        MV    A,(pad_new)
        MV    [pad_out+2],A
        POPU  IMR
        RETF
whole:  CALL  game_start
        CALL  screen_clear
        CALL  screen_show
        CALL  game_end
        RC
        RETF
arg_x:  DB    0,0,0
arg_y:  DB    0
arg_frame: DB 0
boxes:  DS    8,0
pad_out:  DS    3,0
value:  DW    0
text_:  DB    "ab~",0
picture: INCBIN "pic.lcd"
sprite_file: INCBIN "s.spr"
`;
  // Every dot of a picture by itself would take long: a pattern with no regularity instead.
  const pattern = Uint8Array.from({ length: WIDTH * HEIGHT }, (_, i) => ((i * 2654435761) >>> 13) & 1);
  // Two frames of 9 x 16 dots: 0 transparent, 1 on, 2 off.
  const frames = [0, 1].map(f => Uint8Array.from({ length: 9 * 16 }, (_, i) => ((i * 7 + f * 5 + (i >> 3)) % 3)));
  const spr = (mask: boolean): Uint8Array => {
    const out = [9, 2, 2, mask ? 1 : 0];
    for (const f of frames) for (let r = 0; r < 2; r++) for (let x = 0; x < 9; x++) {
      let m = 0, b = 0;
      for (let y = 0; y < 8; y++) { const v = f[(r * 8 + y) * 9 + x]; if (v) m |= 1 << y; if (v === 1) b |= 1 << y; }
      if (mask) out.push(m);
      out.push(b);
    }
    return Uint8Array.from(out);
  };
  const useGame = async (mask = true): Promise<void> => {
    fs.writeFileSync(path.join(folder, "pic.lcd"), encodeLcd(pattern));
    fs.writeFileSync(path.join(folder, "s.spr"), spr(mask));
    await use(GAME_SOURCE);
  };
  const expectDots = async (want: Uint8Array, what: string): Promise<void> => {
    const got = await shown(), wrong = [...want.keys()].filter(i => want[i] !== got[i]);
    assert.equal(wrong.length, 0, `${what}: ${wrong.length} wrong, first ${wrong[0] % WIDTH},${Math.floor(wrong[0] / WIDTH)}`);
  };
  it("loads, keeps and shows a picture, fast enough", async () => {
    await useGame();
    await call("load");
    await expectDots(pattern, "picture");
    const t = await call("show");
    await call("clear"); await call("show");
    await expectDots(new Uint8Array(WIDTH * HEIGHT), "cleared");
    const r = await call("restore"); await call("show");
    await expectDots(pattern, "restored");
    // Frames a second: a game of a few sprites does more than 15 of them.
    if (process.env.E500_TIMES) console.log(`show ${t.cycles}, restore ${r.cycles}`);
    assert.ok(t.cycles < 768000 / 35, `show ${t.cycles}`);
    assert.ok(r.cycles < 768000 / 100, `restore ${r.cycles}`);
  });
  it("draws sprites at every edge and shift, with and without a mask", async () => {
    for (const mask of [true, false]) {
      await useGame(mask);
      await call("load");
      const places: Array<[number, number]> = [[100, 8], [0, 0], [231, 16]];
      for (let y = -18; y <= 34; y++) places.push([50 + y, y]);
      for (const x of [-10, -9, -8, -5, -1, 1, 60, 63, 119, 120, 175, 176, 230, 232, 236, 239, 240, 245, 255, 256, 300, -255, -256, -300]) places.push([x, 5]);
      let cycles = 0;
      for (const [k, [x, y]] of places.entries()) {
        await call("restore");
        const a = program.resolve("arg_x");
        await client.write(a, Uint8Array.from([x & 255, (x >> 8) & 255, 0, y & 255, k & 1]));
        cycles = Math.max(cycles, (await call("draw")).cycles);
        await call("show");
        const want = Uint8Array.from(pattern);
        frames[k & 1].forEach((v, i) => {
          const u = x + i % 9, w = y + Math.floor(i / 9);
          if (u < 0 || w < 0 || u >= WIDTH || w >= HEIGHT || v === 0) return;
          if (mask) want[w * WIDTH + u] = v === 1 ? 1 : 0; else if (v === 1) want[w * WIDTH + u] = 1;
        });
        await expectDots(want, `${mask ? "mask" : "no mask"} ${x},${y}`);
      }
      if (process.env.E500_TIMES) console.log(`sprite 9x16 ${mask} ${cycles}`);
      assert.ok(cycles < 768000 / 150, `sprite ${cycles}`);
    }
  });
  it("says whether boxes touch", async () => {
    await useGame();
    const overlap = (a: number[], b: number[]): boolean => a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
    for (const [a, b] of [[[10, 10, 8, 8], [17, 10, 8, 8]], [[10, 10, 8, 8], [18, 10, 8, 8]], [[17, 10, 8, 8], [10, 10, 8, 8]], [[18, 10, 8, 8], [10, 10, 8, 8]], [[10, 0, 8, 8], [10, 7, 1, 1]], [[10, 0, 8, 8], [10, 8, 1, 1]], [[10, 9, 8, 8], [12, 1, 4, 8]], [[10, 9, 8, 8], [12, 2, 4, 8]], [[230, 24, 8, 8], [237, 31, 8, 8]], [[0, 0, 240, 32], [100, 10, 1, 1]], [[100, 10, 1, 1], [0, 0, 240, 32]]]) {
      await client.write(program.resolve("boxes"), Uint8Array.from([...a, ...b]));
      assert.equal((await call("hit")).F & 1, overlap(a, b) ? 1 : 0, JSON.stringify([a, b]));
    }
  });
  it("writes text and numbers as the ROM shows them", async () => {
    await useGame();
    for (const [value, text] of [[0, "    0"], [7, "    7"], [40, "   40"], [12345, "12345"], [65535, "65535"], [10000, "10000"], [909, "  909"]] as const) {
      await client.write(program.resolve("value"), Uint8Array.from([value & 255, value >> 8]));
      await call("clear");
      assert.equal((await call("write")).A, 6 + 8 * 6);
      await call("show");
      assert.ok(((await client.screen()).text ?? "").split("\n")[1]?.startsWith(` ab~${text}`), `${value}: ${(await client.screen()).text}`);
    }
  });
  it("makes numbers at random", async () => {
    await useGame();
    const seen = new Set<number>(), counts = new Array<number>(10).fill(0);
    for (let i = 0; i < 200; i++) seen.add((await call("rnd")).A);
    for (let i = 0; i < 300; i++) counts[(await call("rnd10")).A]++;
    assert.ok(seen.size > 100, String(seen.size));
    assert.equal(counts.length, 10);
    assert.ok(Math.min(...counts) > 10 && Math.max(...counts) < 60, counts.join());
  });
  it("waits, and reads the pad", async () => {
    await useGame();
    const t = (await call("wait")).cycles / 768000;
    assert.ok(t > 0.13 && t < 0.18, String(t));
    for (const [keys, want] of [[[], 0], [["LEFT"], 1], [["RIGHT"], 2], [["UP"], 4], [["DOWN"], 8], [["SPACE"], 16], [["ENTER"], 32], [["Z"], 64], [["ON/BRK"], 128], [["LEFT", "SPACE"], 17]] as Array<[string[], number]>) {
      for (const k of keys) await client.key(k, true);
      await call("pads");
      for (const k of keys) await client.key(k, false);
      assert.deepEqual(await at("pad_out", 3), [want, want, 0], keys.join());
    }
  });
  it("starts and ends a game, leaving the machine as it was", async () => {
    await useGame();
    await client.type(`CALL ${program.entry("whole")}\n`);
    await client.run(768000 * 4, { untilTyped: true, settle: 768000 });
    assert.ok(!(await client.mode()).busy);
    await client.type("PRINT 6*7\n");
    await client.run(768000 * 3, { untilTyped: true, settle: 768000 });
    const text = (await client.screen()).text ?? "";
    assert.match(text, /42/);
    assert.doesNotMatch(text, /ERROR|BREAK/i);
  });
});
