// Runs e500dbg with a real ROM. Skipped unless the server is built (npm run build:server),
// and the emulator core and a ROM are found: E500_CORE / E500_ROM, or the
// Emulator folder next to this repository's VSCodeExtensions.
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { after, before, describe, it } from "node:test";
import { AsmHost } from "../asm/assembler";
import { EmulatorClient, Stopped } from "../emu/client";
import { Inspector } from "../emu/inspector";
import { basicCall, loadProgram, startMachine } from "../emu/prepare";
import { Program } from "../emu/program";
import { parseTestFile, runTests } from "../emu/testfile";

const extensionRoot = path.resolve(__dirname, "..", "..");
const repo = path.resolve(extensionRoot, "..", "..");
// The emulator is a repository of its own, beside this one.
const workspace = path.dirname(repo);
const server = path.join(extensionRoot, "out", "server", process.platform === "win32" ? "e500dbg.exe" : "e500dbg.dll");
const core = process.env.E500_CORE ?? path.join(workspace, "Emulator", "bin", "e500core.dll");
const rom = process.env.E500_ROM ?? path.join(workspace, "Emulator", "app", "rom", "PC-E500(7.2).ROM");
const available = [server, core, rom].every(f => fs.existsSync(f));

const host: AsmHost = {
  readText: f => { try { return fs.readFileSync(f, "utf8"); } catch { return undefined; } },
  readBinary: f => { try { return fs.readFileSync(f); } catch { return undefined; } }
};

const build = (source: string, name = "test.asm"): Program => {
  const program = Program.build(path.join(repo, name), source, { host });
  assert.deepEqual(program.errors, []);
  return program;
};

describe("emulator (e500dbg)", { skip: available ? false : "e500dbg, e500core.dll or the ROM not found" }, () => {
  let client: EmulatorClient;
  let base: string;
  before(async () => {
    client = await startMachine({ server, core, rom, ram: 32 });
    base = await client.saveState();
  });
  after(() => client?.dispose());

  it("boots to BASIC's prompt", async () => {
    await client.loadState(base);
    const mode = await client.mode();
    assert.ok(mode.run && !mode.busy);
    assert.match((await client.screen()).text ?? "", />/);
  });

  it("stops at a breakpoint mapped from a source line, and returns a near call", async () => {
    await client.loadState(base);
    const program = build("        ORG &BE000\nstart:  MV A,0\n        MV IL,10\nloop:   ADD A,IL\n        DEC IL\n        JRNZ loop\n        RET\n");
    await loadProgram(client, program);
    const line = program.codeAtOrAfter(program.file, 6)[0];
    assert.equal(line.address, 0xbe00a);
    await client.breakpoints([line.address]);
    await client.call(program.entry(), false);
    const stop = await client.run(100000);
    assert.equal(stop.reason, "breakpoint");
    assert.equal(program.lineAt(stop.pc)?.line, 6);
    assert.equal((await client.registers()).A, 55);
    const frames = await client.callstack();
    assert.equal(frames.at(-1)?.target, 0xbe000);
    const back = await client.run(100000);
    assert.equal(back.reason, "return");
    assert.equal(back.registers?.A, 55);
    await client.breakpoints([]);
  });

  it("runs a routine from BASIC's CALL and comes back to the prompt", async () => {
    await client.loadState(base);
    // MV A,7 / RC / RETF at the machine-code area, writing 7 at BED00h first.
    const program = build("        ORG &BEC00\nstart:  MV A,7\n        MV [&BED00],A\n        RC\n        RETF\n");
    await loadProgram(client, program);
    await client.breakpoints([program.entry()]);
    await client.type(basicCall(program.entry()) + "\n");
    const hit = await client.run(768000 * 5);
    assert.equal(hit.reason, "breakpoint");
    assert.equal(hit.pc, 0xbec00);
    await client.step();
    assert.equal((await client.registers()).A, 7);
    await client.breakpoints([]);
    const done = await client.run(768000 * 2, { untilTyped: true, settle: 768000 / 2 });
    assert.notEqual(done.reason, "exception");
    assert.equal((await client.read(0xbed00, 1))[0], 7);
    assert.ok(!(await client.mode()).busy);
  });

  it("runs the tests of a test file", async () => {
    await client.loadState(base);
    const program = build([
      "        ORG &BEC00",
      "add2:   MV IL,[&BED01]",
      "        MV A,[&BED00]",
      "        ADD A,IL",
      "        MV [&BED02],A",
      "        RC",
      "        RETF",
      "spin:   JR spin"
    ].join("\n"));
    const spec = parseTestFile(`{
      // comments are allowed
      "program": "test.asm",
      "tests": [
        { "name": "3+4", "call": "add2", "memory": { "&HBED00": [3, 4] }, "expect": { "registers": { "A": 7, "C": 0 }, "memory": { "&HBED02": [7] } } },
        { "name": "wrong on purpose", "call": "add2", "memory": { "&HBED00": [1, 1] }, "expect": { "registers": { "A": 3 } } },
        { "name": "never returns", "call": "spin", "maxCycles": 20000 },
        { "name": "from BASIC", "basic": "POKE &HBED00,20,22:CALL &HBEC00:PRINT PEEK &HBED02", "expect": { "screen": "42" } },
      ]
    }`);
    const results = await runTests(client, program, spec);
    assert.deepEqual(results.map(r => r.passed), [true, false, false, true], JSON.stringify(results, null, 1));
    assert.match(results[1].messages[0], /A: 期待 3/);
    assert.match(results[2].messages[0], /戻りませんでした/);
  });

  it("takes a step past the end of a direct call for its return", async () => {
    await client.loadState(base);
    const program = build("        ORG &BEC00\nstart:  MV A,7\n        RETF\n");
    await loadProgram(client, program);
    const before = await client.registers();
    for (const how of ["step", "stepOver", "stepOut"] as const) {
      await client.call(program.entry(), true);
      const stopped = async (go: () => Promise<void>): Promise<Stopped> => {
        const wait = new Promise<Stopped>(resolve => client.once("stopped", resolve));
        await go();
        return wait;
      };
      assert.equal((await stopped(() => client.step())).reason, "step");
      const last = await stopped(() => client[how]());
      assert.equal(last.reason, "return", how);
      assert.equal(last.registers?.A, 7);
      assert.equal((await client.registers()).P, before.P);
      assert.equal((await client.registers()).S, before.S);
    }
  });

  it("lets a comma before a bracket go, but not inside strings", () => {
    const spec = parseTestFile(`{ "program": "a.asm", "tests": [ { "name": "A,]B", "expect": { "screen": "1,}2", }, }, /* x */ ], }`);
    assert.equal(spec.tests[0].name, "A,]B");
    assert.equal(spec.tests[0].expect?.screen, "1,}2");
  });

  it("passes the example tests (examples/hello.e500test.json)", async () => {
    await client.loadState(base);
    const examples = path.join(extensionRoot, "examples");
    const spec = parseTestFile(fs.readFileSync(path.join(examples, "hello.e500test.json"), "utf8"));
    const file = path.join(examples, spec.program);
    const program = Program.build(file, fs.readFileSync(file, "utf8"), { host });
    assert.deepEqual(program.errors, []);
    const results = await runTests(client, program, spec);
    assert.deepEqual(results.filter(r => !r.passed), []);
    assert.equal(results.length, 4);
  });

  it("shows registers, labels and expressions of an assembly program to the panel", async () => {
    await client.loadState(base);
    const program = build("        ORG &BEC00\nstart:  MV A,7\n        MV [data],A\n        RETF\ndata:   DB 0,0\n");
    await loadProgram(client, program);
    await client.call(program.entry(), true);
    assert.equal((await client.run(10000)).reason, "return");
    const inspector = new Inspector(client, program);
    assert.ok((await inspector.groups()).some(g => g.title === "ラベル" && g.rows.some(r => r.name === "DATA" && /: 07 00/.test(r.value))));
    assert.match(await inspector.evaluate("[data]"), /^07h（7）/);
    // MV A,7 (2) + MV [lmn],A (4) + RETF (1): data is at BEC07h.
    assert.match(await inspector.evaluate("data+1"), /^BEC08h（781320）$/);
    assert.match(await inspector.evaluate("S"), /^[0-9A-F]+h/);
    // Changing what the panel shows, while stopped.
    await inspector.set("label DATA", "AB 01");
    assert.match(await inspector.evaluate("[data]:2"), /^01ABh/);
    await inspector.set("[data]:3", "&H12345");
    assert.match(await inspector.evaluate("[data]:3"), /^012345h（74565）  @BEC07$/);
    await inspector.set("X", "data+1");
    assert.match(await inspector.evaluate("X"), /^BEC08h/);
    await inspector.set("BP", "55h");
    assert.match(await inspector.evaluate("BP"), /^55h/);
    // What it points at, as the assembler reads it.
    await inspector.set("(BP)", "ABh");
    await inspector.set("(BP+1)", "CDh");
    assert.match(await inspector.evaluate("($55):2"), /^CDABh/);
    await inspector.set("[data]", "01 02 03");
    await inspector.set("[data+3]", "\"AB\"");
    assert.deepEqual([...await client.read(0xbec07, 5)], [1, 2, 3, 0x41, 0x42]);
    assert.deepEqual([(await inspector.watch("X")).edit, (await inspector.watch("[data]")).edit, (await inspector.watch("data")).edit], ["asm", "memory", undefined]);
    await assert.rejects(inspector.set("data", "1"), /\[data\]/);
    await client.continue(0);
    await assert.rejects(inspector.set("X", "1"), /止めているとき/);
    await client.pause();
  });

  it("goes on running after RESET, and says so when a request stops it", async () => {
    await client.loadState(base);
    await client.continue(0);
    await client.reset(false);
    assert.equal(client.running, true);
    const cycles = async (): Promise<number> => (await client.request<{ cycles: number }>("status")).cycles;
    const before = await cycles();
    await new Promise(r => setTimeout(r, 200));
    assert.ok(await cycles() > before);
    const stop = new Promise<Stopped>(resolve => client.once("stopped", resolve));
    await client.loadState(base);
    assert.equal((await stop).reason, "pause");
    assert.equal(client.running, false);
  });

  it("stops at a breakpoint on the first instruction of a direct call", async () => {
    await client.loadState(base);
    const program = build("        ORG $BEC00\nstart:  MV A,1\n        RET\n");
    await loadProgram(client, program);
    await client.breakpoints([0xbec00]);
    const stop = new Promise<Stopped>(resolve => client.once("stopped", resolve));
    await client.call(0xbec00, false);
    await client.continue(0);
    assert.deepEqual([(await stop).reason, (await client.registers()).P], ["breakpoint", 0xbec00]);
    await client.breakpoints([]);
  });

  it("steps over a call that takes its return address off to skip data", async () => {
    await client.loadState(base);
    const program = build("        ORG $BEC00\nstart:  CALLF skip\n        DB 1,2\n        NOP\n        RET\nskip:   MV X,[S++]\n        MV Y,2\n        ADD X,Y\n        MV [--S],X\n        RETF\n");
    await loadProgram(client, program);
    await client.call(0xbec00, false);
    const stop = new Promise<Stopped>(resolve => client.once("stopped", resolve));
    await client.stepOver();
    assert.equal((await stop).pc, 0xbec06);
  });

  it("stops at a breakpoint on the way of a step over, also after the return address is taken off", async () => {
    await client.loadState(base);
    const program = build("        ORG $BEC00\nstart:  CALL put\n        DB 1,2,0\n        RET\nput:    POPS BA\n        MV X,$B0000\n        ADD X,BA\np1:     MV A,[X++]\nbp:     CMP A,0\n        JRNZ p1\n        MV BA,X\n        PUSHS BA\n        RET\n");
    await loadProgram(client, program);
    const at = program.resolve("bp");
    await client.breakpoints([at]);
    await client.call(0xbec00, false);
    const stop = new Promise<Stopped>(resolve => client.once("stopped", resolve));
    await client.stepOver();
    const got = await stop;
    assert.deepEqual([got.reason, got.pc], ["breakpoint", at]);
    await client.breakpoints([]);
  });

  it("leaves CAPS to the machine when a key at a time is typed", async () => {
    await client.loadState(base);
    await client.tap("C-CE");
    await client.tap("CAPS");
    for (const c of "a$=\"abc\"") await client.type(c);
    await client.run(768000 * 20, { untilTyped: true, settle: 768000 / 2 });
    assert.match((await client.screen()).text ?? "", /a\$="abc"/);
  });

  it("types a text as it is written, small letters too", async () => {
    await client.loadState(base);
    await client.tap("C-CE");
    await client.type("a=5:b$=\"abC\":print b$;A\n");
    await client.run(768000 * 20, { untilTyped: true, settle: 768000 / 2 });
    const screen = (await client.screen()).text ?? "";
    assert.match(screen, /a=5:b\$="abC"/);
    assert.match(screen, /^abC +5$/m);
  });

  it("takes the RAM size of the state it starts from", async () => {
    const big = await startMachine({ server, core, rom, ram: 64 });
    const state = path.join(fs.mkdtempSync(path.join(require("node:os").tmpdir(), "e500state-")), "a.e500state");
    fs.writeFileSync(state, JSON.stringify({ Data: await big.saveState() }));
    big.dispose();
    const started = await startMachine({ server, core, rom, ram: 32, state });
    assert.equal(started.info?.internalKB, 64);
    started.dispose();
    fs.rmSync(path.dirname(state), { recursive: true });
  });

  it("breaks on every copy of a line of a file included twice", () => {
    const files = new Map([[path.join(repo, "twice.inc"), "        INC A\n        INC A\n"]]);
    const program = Program.build(path.join(repo, "t.asm"), "        ORG $BEC00\n        INCLUDE \"twice.inc\"\n        NOP\n        INCLUDE \"twice.inc\"\n        RET\n", { host: { readText: f => files.get(f), readBinary: () => undefined } });
    assert.deepEqual(program.codeAtOrAfter(path.join(repo, "twice.inc"), 0).map(l => l.address), [0xbec00, 0xbec05]);
  });

  it("disassembles around an address", async () => {
    await client.loadState(base);
    const program = build("        ORG &BEC00\nstart:  MV A,0\n        MV IL,10\n        ADD A,IL\n        RETF\n");
    await loadProgram(client, program);
    const lines = await client.disassemble(0xbec04, 2, 2);
    assert.deepEqual(lines.map(l => l.address), [0xbec00, 0xbec02, 0xbec04, 0xbec06]);
    assert.match(lines[2].text, /^ADD A,IL$/);
  });
});
