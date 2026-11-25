// BASIC debugging on real ROMs (skipped without the server, core and ROMs; see emulator.test.ts).
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, it } from "node:test";
import { findVariable } from "../emu/basic";
import { BasicSession } from "../emu/basicSession";
import { EmulatorClient, Stopped } from "../emu/client";
import { Inspector } from "../emu/inspector";
import { startMachine } from "../emu/prepare";

const extensionRoot = path.resolve(__dirname, "..", "..");
const repo = path.resolve(extensionRoot, "..", "..");
// The emulator is a repository of its own, beside this one.
const workspace = path.dirname(repo);
const server = path.join(extensionRoot, "out", "server", process.platform === "win32" ? "e500dbg.exe" : "e500dbg.dll");
const core = process.env.E500_CORE ?? path.join(workspace, "Emulator", "bin", "e500core.dll");
const romFolder = process.env.E500_ROMS ?? path.join(workspace, "Emulator", "app", "rom");
// E500_ROM runs everything here on that ROM.
const oneRom = process.env.E500_ROM ?? path.join(romFolder, "PC-E500(7.2).ROM");
const available = [server, core, romFolder].every(f => fs.existsSync(f));

const PROGRAM = [
  "10 A=0:B$=\"HI\"",
  "20 FOR I=1 TO 3",
  "30 A=A+I",
  "40 NEXT I",
  "50 GOSUB 100",
  "60 C=0",
  "65 C=C+1:IF C<3 THEN 65",
  "70 DIM P(2):P(1)=A:END",
  "100 A=A*2:IF A>0 THEN 110",
  "105 A=999",
  "110 RETURN"
].join("\r\n");

function nextStop(client: EmulatorClient): Promise<Stopped> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("no stop")), 20000);
    client.once("stopped", (s: Stopped) => { clearTimeout(timer); resolve(s); });
  });
}

describe("pausing a BASIC program", { skip: available && fs.existsSync(oneRom) ? false : "server, core or ROM not found" }, () => {
  const start = async (program: string): Promise<{ client: EmulatorClient; session: BasicSession }> => {
    const client = await startMachine({ server, core, rom: oneRom, ram: 32 });
    const session = await BasicSession.load(client, "pause.bas", program);
    await session.runToFirstLine();
    await session.setBreakpoints([]);
    return { client, session };
  };
  it("waits out a long line and stops at the next one; asked twice, stops at once", async () => {
    const { client, session } = await start("10 A=1\r\n20 WAIT 128:PRINT 1\r\n30 A=2\r\n40 GOTO 20");
    try {
      await session.continue(1);
      await new Promise(resolve => setTimeout(resolve, 300));
      let stop = nextStop(client);
      const asked = Date.now();
      await session.pause();
      assert.equal((await session.stopped(await stop))?.number, 30);
      assert.ok(Date.now() - asked > 700, `half a second does not cut the line short (${Date.now() - asked} ms)`);

      await session.continue(1);
      await new Promise(resolve => setTimeout(resolve, 300));
      stop = nextStop(client);
      await session.pause();
      await session.pause();
      assert.equal(await session.stopped(await stop), undefined, "in the middle of line 20");
    } finally { session.dispose(); client.dispose(); }
  });
  it("waits for INPUT to be answered", async () => {
    const { client, session } = await start("10 INPUT A\r\n20 B=A*2\r\n30 END");
    try {
      await session.continue(0);
      await new Promise(resolve => setTimeout(resolve, 300));
      const stop = nextStop(client);
      await session.pause();
      await new Promise(resolve => setTimeout(resolve, 1000));
      assert.ok(client.running, "still waiting at the INPUT");
      await client.type("21\n");
      assert.equal((await session.stopped(await stop))?.number, 20);
    } finally { session.dispose(); client.dispose(); }
  });
});

describe("changing BASIC variables", { skip: available && fs.existsSync(oneRom) ? false : "server, core or ROM not found" }, () => {
  it("is what the running program sees: a loop's counter, doubles, arrays, strings", async () => {
    const client = await startMachine({ server, core, rom: oneRom, ram: 32 });
    try {
      const session = await BasicSession.load(client, "edit.bas", [
        "10 DIM P(1,1),Q#(1),R$(1):D#=0:N=0:B$=\"HI\":C$=B$:R$(1)=\"AB\"",
        "20 FOR I=1 TO 100",
        "30 N=N+1",
        "40 NEXT I",
        "50 X=P(1,0)+2:Y#=D#*2+Q#(1):Z$=B$+C$+R$(1)",
        "60 END"
      ].join("\r\n"));
      await session.runToFirstLine();
      const to = async (line: number): Promise<void> => {
        await session.setBreakpoints([line]);
        const stop = nextStop(client);
        await session.continue(0);
        assert.equal((await session.stopped(await stop))?.number, line);
      };
      await to(30);
      await session.setVariable("I", "99");
      await to(50);
      const value = async (name: string): Promise<string | undefined> => findVariable(await session.variables(), name)?.value;
      assert.equal(await value("N"), "2", "99 and 100 are left of the loop");
      await session.setVariable("P(1,0)", "40");
      await session.setVariable("D#", "1.25");
      await session.setVariable("Q#(1)", "0.12345678901234567891");
      await session.setVariable("B$", "YO");
      await session.setVariable("R$(1)", "\"cd\"");
      await to(60);
      assert.equal(await value("X"), "42");
      assert.equal(await value("Y#"), "2.6234567890123456789");
      assert.equal(await value("Z$"), "\"YOHIcd\"");
      session.dispose();
    } finally {
      client.dispose();
    }
  });
});

for (const file of process.env.E500_ROM ? [oneRom] : ["PC-E500(7.2).ROM", "PC-E650(8.5).ROM"].map(f => path.join(romFolder, f))) {
  const rom = path.basename(file);
  describe(`BASIC debugging on ${rom}`, { skip: available && fs.existsSync(file) ? false : "server, core or ROM not found" }, () => {
    it("steps line by line, stops at breakpoints and reads the variables", async () => {
      const client = await startMachine({ server, core, rom: file, ram: 64 });
      try {
        const session = await BasicSession.load(client, "test.bas", PROGRAM);
        assert.deepEqual(session.lines.map(l => l.number), [10, 20, 30, 40, 50, 60, 65, 70, 100, 105, 110]);
        const first = await session.runToFirstLine();
        assert.equal(first.number, 10);
        assert.ok(session.dispatchAddress! >= 0xc0000, "the line start is in the ROM");

        const order: number[] = [10];
        for (let i = 0; i < 20 && order.at(-1) !== 70; i++) {
          const stop = nextStop(client);
          await session.step(0);
          order.push((await session.stopped(await stop))!.number);
        }
        assert.deepEqual(order, [10, 20, 30, 40, 30, 40, 30, 40, 50, 100, 110, 60, 65, 65, 65, 70]);

        // Again from the top, now to a breakpoint, and the variables there.
        await client.run(768000, { untilTyped: false });
        await session.runToFirstLine();
        await session.setBreakpoints([110, 105]);
        let stop = nextStop(client);
        await session.continue(0);
        assert.equal((await session.stopped(await stop))?.number, 110);
        let vars = new Map((await session.variables()).map(v => [v.name, v]));
        assert.equal(vars.get("A")?.value, "12");
        assert.equal(vars.get("I")?.value, "4");
        assert.equal(vars.get("B$")?.value, "\"HI\"");

        // On to the end of the program; a pause then finds no line starting and stops the CPU where it is.
        // Changed where they are; the program goes on with the new values.
        assert.equal(await session.setVariable("b$", "\"OK\""), "\"OK\"");
        await assert.rejects(session.setVariable("B$", "LONG"), /同じ長さだけ/);
        await assert.rejects(session.setVariable("Z9", "1"), /まだありません/);
        assert.equal(await session.setVariable("A", "-1.5E3"), "-1500");
        vars = new Map((await session.variables()).map(v => [v.name, v]));
        assert.equal(vars.get("B$")?.value, "\"OK\"");
        assert.equal(vars.get("I")?.value, "4", "the others are as they were");
        assert.equal(await session.setVariable("A", "12"), "12");

        await session.setBreakpoints([]);
        await session.continue(0);
        await new Promise(resolve => setTimeout(resolve, 500));
        stop = nextStop(client);
        await session.pause();
        const paused = await stop;
        assert.equal(paused.reason, "pause");
        assert.equal(await session.stopped(paused), undefined);
        vars = new Map((await session.variables()).map(v => [v.name, v]));
        assert.deepEqual(vars.get("P()")?.elements?.map(e => e.value), ["0", "12", "0"]);

        // What the panel's lists and watches show, with no debugger involved.
        const inspector = new Inspector(client);
        const groups = await inspector.groups();
        assert.deepEqual(groups.map(g => g.title), ["BASIC の変数", "レジスタ"]);
        assert.deepEqual(groups[0].rows.map(r => r.name), ["A", "B$", "C", "I", "P()"]);
        assert.ok(groups[0].rows.some(r => r.name === "P()" && r.children?.[1].value === "12"));
        assert.equal(await inspector.evaluate("b$"), "\"OK\"");
        assert.equal(await inspector.evaluate("P(1)"), "12");
        assert.equal(await inspector.evaluate("A"), "12");
        assert.match(await inspector.evaluate("[&HB0000]"), /@B0000$/);
        await assert.rejects(inspector.evaluate("Q$"), /まだありません/);
        session.dispose();
      } finally {
        client.dispose();
      }
    });
  });
}
