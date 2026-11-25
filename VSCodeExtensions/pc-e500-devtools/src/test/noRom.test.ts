// The debug server and the emulator's core without a ROM of a real machine: a stand-in ROM
// that only loops. For systems where no ROM is at hand (Windows, Linux and macOS alike).
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, describe, it } from "node:test";
import { EmulatorClient } from "../emu/client";
import { Program } from "../emu/program";
import { coreName } from "../setup/find";

const extensionRoot = path.resolve(__dirname, "..", "..");
const workspace = path.resolve(extensionRoot, "..", "..", "..");
const server = path.join(extensionRoot, "out", "server", process.platform === "win32" ? "e500dbg.exe" : "e500dbg.dll");
const core = process.env.E500_CORE ?? path.join(workspace, "Emulator", "bin", coreName(process.platform));
const available = [server, core].every(f => fs.existsSync(f));

const host = { readText: () => undefined, readBinary: () => undefined };

describe("the machine without a ROM", { skip: available ? false : "e500dbg or the emulator's core not found" }, () => {
  let client: EmulatorClient, folder: string;
  before(async () => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), "e500norom-ロム-"));
    // JR to itself at C0000h, and every vector to it.
    const rom = Buffer.alloc(256 * 1024);
    rom.set([0x13, 0x02], 0);
    for (const at of [0x3fffa, 0x3fffd]) rom.set([0x00, 0x00, 0x0c], at);
    fs.writeFileSync(path.join(folder, "blank.rom"), rom);
    client = new EmulatorClient({ server, core });
    await client.open(path.join(folder, "blank.rom"), 32);
    await client.run(10000);
    // The stacks, which a ROM would have set.
    await client.setRegister("S", 0xbfb00);
    await client.setRegister("U", 0xbfa00);
  });
  after(() => { client?.dispose(); fs.rmSync(folder, { recursive: true, force: true }); });

  const call = async (source: string, registers: Record<string, number> = {}) => {
    const program = Program.build(path.join(folder, "t.asm"), "        ORG $BEC00\n" + source + "        END\n", { host });
    await client.write(program.origin, program.binary);
    await client.call(program.resolve("start")!, true, registers);
    return client.run(768000);
  };

  it("runs machine code and gives its registers and memory", async () => {
    const r = await call("start:  MV A,0\n        MV IL,10\nloop:   ADD A,IL\n        DEC IL\n        JRNZ loop\n        MV [$BED00],A\n        RC\n        RETF\n");
    assert.equal(r.reason, "return");
    assert.equal(r.registers!.A, 55);
    assert.equal((await client.read(0xbed00, 1))[0], 55);
    await client.write(0xbed10, Uint8Array.of(0x12, 0x34));
    await call("start:  MV ($20),[X++]\n        MV ($21),[X]\n        RETF\n", { X: 0xbed10 });
    assert.deepEqual([...(await client.internalMemory()).subarray(0x20, 0x22)], [0x12, 0x34]);
  });

  it("stops at breakpoints, steps and disassembles", async () => {
    const program = Program.build(path.join(folder, "s.asm"), "        ORG $BEC00\nstart:  MV A,1\nhere:   INC A\n        RETF\n        END\n", { host });
    await client.write(program.origin, program.binary);
    await client.breakpoints([program.resolve("here")!]);
    await client.call(program.resolve("start")!, true);
    const r = await client.run(768000);
    assert.deepEqual([r.reason, r.pc], ["breakpoint", program.resolve("here")]);
    await client.breakpoints([]);
    assert.match((await client.disassemble(program.resolve("here")!, 1))[0].text, /^INC\s+A$/);
    assert.equal((await client.run(768000)).reason, "return");
  });

  it("gives the screen and mounts a folder as the CE-140F", async () => {
    assert.equal(Buffer.from((await client.screen()).pixels, "base64").length, 960);
    await client.diskMount(folder);
    await client.diskMount(undefined);
    const state = await client.saveState();
    await client.loadState(state);
  });

  it("gives up with a message for what is not a core", async () => {
    const file = path.join(folder, "not.dll");
    fs.writeFileSync(file, "x");
    const broken = new EmulatorClient({ server, core: file });
    await assert.rejects(broken.registers());
    broken.dispose();
  });
});
