import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";
import { Check, checkSetup, Settings, summary, Tools } from "../setup/check";
import { assemblerInWorkspace, assemblerOnPath, emulatorByItself, emulatorInWorkspace, emulatorOnPath, hasRuntime, inEmulatorFolder, pathFolders, Places } from "../setup/find";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "e500setup-"));
after(() => fs.rmSync(root, { recursive: true, force: true }));
let count = 0;
const folder = (): string => { const d = path.join(root, `d${count++}`); fs.mkdirSync(d); return d; };
const put = (f: string, data: string | Buffer = "x"): string => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); return f; };
const emulator = (withDebugger = true): string => {
  const d = folder();
  put(path.join(d, "bin", "e500core.dll"), withDebugger ? "..e500_debug_run.." : "..e500_run..");
  put(path.join(d, "app", "rom", "PC-E650(8.5).ROM"), Buffer.alloc(384 * 1024));
  put(path.join(d, "app", "rom", "PC-E500(7.2).ROM"), Buffer.alloc(256 * 1024));
  fs.mkdirSync(path.join(d, "app", "drive-x"));
  return d;
};
const at = (...dirs: string[]): string => dirs.join(";");
const places = (p: Partial<Places> = {}): Places => ({ path: "", platform: "win32", workspace: [], ...p });
const tools: Tools = {
  assemblerVersion: () => Promise.resolve("e500asm 0.2.0"),
  runtimes: () => Promise.resolve("Microsoft.NETCore.App 8.0.32 [C:\\x]\nMicrosoft.NETCore.App 10.0.13 [C:\\x]\n"),
  start: () => Promise.resolve({ romVersion: "7.2", romKB: 256, internalKB: 32, ms: 5 })
};
const settings = (s: Partial<Settings> = {}): Settings => ({ assembler: "", emulator: "", core: "", rom: "", server: "", disk: "", ram: 32, ownServer: put(path.join(root, "own", "e500dbg.exe")), ...s });
const states = (checks: Check[]): Record<string, string> => Object.fromEntries(checks.map(c => [c.id, c.state]));
const of = (checks: Check[], id: string): Check => checks.find(c => c.id === id)!;

describe("setup check", () => {
  it("looks on PATH, in quotes and order, not in relative folders", () => {
    const a = folder(), b = folder();
    const first = put(path.join(a, "e500asm.cmd")), second = put(path.join(b, "e500asm.exe"));
    assert.equal(assemblerOnPath(places({ path: at("", ".", `"${a}"`, b) })), first);
    assert.equal(assemblerOnPath(places({ path: at(b, a) })), second);
    assert.equal(assemblerOnPath(places({ path: at("relative", folder()) })), undefined);
    assert.deepEqual(pathFolders(places({ path: at("x", ` ${a} `, "..\\y") })), [a]);
    const e = emulator();
    assert.equal(emulatorOnPath(places({ path: at(a, path.join(e, "bin")) })), path.join(e, "bin"));
  });
  it("finds what a folder of the emulator has", () => {
    const e = emulator();
    const f = inEmulatorFolder(e, { platform: "win32" });
    assert.equal(f.core, path.join(e, "bin", "e500core.dll"));
    assert.equal(path.basename(f.rom!), "PC-E500(7.2).ROM");
    assert.equal(f.disk, path.join(e, "app", "drive-x"));
    // The one with the debugger, though another comes first.
    const both = emulator(false);
    put(path.join(both, "app", "e500core.dll"), "e500_debug_run");
    assert.equal(inEmulatorFolder(both, { platform: "win32" }).core, path.join(both, "app", "e500core.dll"));
    // An installed copy: its ROMs are the user's.
    const local = folder(), programs = folder(), installed = path.join(programs, "PockeComE500");
    put(path.join(installed, "e500core.dll"), "e500_debug_run"); put(path.join(installed, "PockeComE500.installed"));
    const rom = put(path.join(local, "PockeComE500", "rom", "A.ROM"));
    assert.equal(inEmulatorFolder(installed, { platform: "win32", localAppData: local }).rom, rom);
    assert.equal(emulatorByItself(places({ programFiles: programs })), installed);
    assert.equal(emulatorByItself(places({ programFiles: folder() })), undefined);
    // On macOS and Linux the core is a library of its own name, and the .deb's ROMs are the user's too.
    const mac = folder(), dylib = put(path.join(mac, "libe500core.dylib"), "e500_debug_run"), macRom = put(path.join(mac, "rom", "B.ROM"));
    assert.deepEqual([inEmulatorFolder(mac, { platform: "darwin" }).core, inEmulatorFolder(mac, { platform: "darwin" }).rom], [dylib, macRom]);
    const deb = folder(); const so = put(path.join(deb, "libe500core.so"), "e500_debug_run"); put(path.join(deb, "PockeComE500.installed"));
    assert.deepEqual([inEmulatorFolder(deb, { platform: "linux", localAppData: local }).core, inEmulatorFolder(deb, { platform: "linux", localAppData: local }).rom], [so, rom]);
  });
  it("says everything is there", async () => {
    const e = emulator(), tool = put(path.join(folder(), "e500asm.exe"));
    const checks = await checkSetup(settings({ emulator: e, assembler: tool }), places(), tools);
    assert.deepEqual(new Set(Object.values(states(checks))), new Set(["ok"]), JSON.stringify(checks));
    assert.equal(summary(checks).state, "ok");
    assert.ok(of(checks, "assembler").lines.some(l => l.includes("0.2.0")));
    assert.ok(of(checks, "start").lines[0].includes("7.2"));
  });
  it("uses PATH when the settings are empty, and says where", async () => {
    const e = emulator(), dir = folder(), tool = put(path.join(dir, "e500asm.exe"));
    const onPath = path.join(e, "bin");
    const checks = await checkSetup(settings(), places({ path: at(dir, onPath) }), tools);
    assert.equal(summary(checks).state, "ok", JSON.stringify(checks));
    assert.ok(of(checks, "assembler").lines.includes(`PATH: ${tool}`));
    assert.ok(of(checks, "folder").lines.includes(`PATH: ${onPath}`));
  });
  it("asks for nothing that is not needed, and suggests what the workspace has", async () => {
    const work = folder(), tool = put(path.join(work, "Assembler", "app", "e500asm.exe"));
    put(path.join(work, "Emulator", "bin", "e500core.dll"), "e500_debug_run");
    put(path.join(work, "Emulator", "rom", "A.ROM"), Buffer.alloc(256 * 1024));
    const where = places({ workspace: [work] });
    assert.equal(assemblerInWorkspace(where), tool);
    assert.equal(emulatorInWorkspace(where), path.join(work, "Emulator"));
    const checks = await checkSetup(settings(), where, tools);
    assert.equal(of(checks, "assembler").state, "info");
    assert.deepEqual(of(checks, "assembler").fixes[0], { kind: "use", setting: "pcE500.asm.assemblerPath", value: tool, label: "これを設定に入れる" });
    assert.equal(of(checks, "folder").state, "error");
    assert.ok(of(checks, "folder").fixes.some(f => f.kind === "use" && f.value === path.join(work, "Emulator")));
    assert.equal(of(checks, "start").state, "info");
    assert.equal(summary(checks).state, "error");
  });
  it("says what is wrong", async () => {
    const old = emulator(false), good = emulator();
    const checks = await checkSetup(settings({ emulator: old, assembler: path.join(root, "none.exe"), rom: put(path.join(root, "short.rom"), Buffer.alloc(1000)), disk: path.join(root, "none") }), places({ path: path.join(good, "bin") }), {
      ...tools, runtimes: () => Promise.resolve("Microsoft.NETCore.App 8.0.1 [x]"), start: () => Promise.reject(new Error("no such function\nmore"))
    });
    assert.deepEqual(states(checks), { builtin: "ok", assembler: "error", folder: "ok", core: "error", rom: "error", server: "ok", runtime: "error", disk: "error", start: "error" });
    // One with the debugger is offered.
    assert.ok(of(checks, "folder").fixes.some(f => f.kind === "use" && f.value === path.join(good, "bin")));
    assert.deepEqual(of(checks, "start").lines, ["no such function"]);
    const gone = await checkSetup(settings({ emulator: path.join(root, "gone"), ownServer: path.join(root, "none.exe") }), places(), { ...tools, runtimes: () => Promise.reject(new Error("ENOENT")) });
    assert.deepEqual(states(gone), { builtin: "ok", assembler: "info", folder: "error", core: "error", rom: "error", server: "error", runtime: "error", disk: "info", start: "info" });
    const broken = await checkSetup(settings({ assembler: put(path.join(root, "bad.exe")) }), places(), { ...tools, assemblerVersion: () => Promise.reject(new Error("bad")) });
    assert.equal(of(broken, "assembler").state, "error");
    const linux = await checkSetup(settings({ emulator: good }), places({ platform: "linux" }), tools);
    assert.equal(of(linux, "platform").state, "error");
    assert.ok(!linux.some(c => c.id === "start"));
  });
  it("reads the list of runtimes", () => {
    assert.ok(hasRuntime("Microsoft.AspNetCore.App 10.0.1 [x]\r\nMicrosoft.NETCore.App 10.0.13 [x]\r\n"));
    assert.ok(!hasRuntime("Microsoft.AspNetCore.App 10.0.1 [x]\nMicrosoft.NETCore.App 8.0.13 [x]"));
  });
});
