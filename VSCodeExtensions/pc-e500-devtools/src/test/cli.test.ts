// The command line (bin/e500): run as its users run it, a process of its own. What needs
// the emulator is skipped where there is none.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";
import { lookup, words } from "../cli/lookup";
import { defines, parseArguments, UsageError } from "../cli/options";
import { lcdPng } from "../cli/png";
import { guideText, guideTopics, installSkill, installStub, skillFolder, STUB_MARK } from "../cli/skill";
import { decodeLcd, encodeLcd } from "../lcd/lcdFile";
import { decodeSpr } from "../lcd/sprFile";
import { parseTestFile } from "../emu/testfile";

const extensionRoot = path.resolve(__dirname, "..", "..");
const workspace = path.resolve(extensionRoot, "..", "..", "..");
const server = path.join(extensionRoot, "out", "server", process.platform === "win32" ? "e500dbg.exe" : "e500dbg.dll");
const core = process.env.E500_CORE ?? path.join(workspace, "Emulator", "bin", "e500core.dll");
const rom = process.env.E500_ROM ?? path.join(workspace, "Emulator", "app", "rom", "PC-E500(7.2).ROM");
const available = [server, core, rom].every(f => fs.existsSync(f));

const root = fs.mkdtempSync(path.join(os.tmpdir(), "e500cli-"));
after(() => fs.rmSync(root, { recursive: true, force: true }));
const put = (name: string, text: string): string => { const f = path.join(root, name); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); return f; };
const e500 = (...args: string[]): { code: number | null; out: string; err: string } => {
  const r = spawnSync(process.execPath, [path.join(extensionRoot, "out", "cli", "main.js"), ...args], { encoding: "utf8", cwd: root, env: { ...process.env, E500_LANG: "ja", E500_CORE: core, E500_ROM: rom } });
  return { code: r.status, out: r.stdout, err: r.stderr };
};
const json = (r: { out: string }): any => JSON.parse(r.out);

describe("command line", () => {
  it("takes options with and without values, and refuses unknown ones", () => {
    const a = parseArguments(["a.asm", "--ram", "64", "--rom=8.5", "--json", "-o", "x.BIN", "--define", "N=$10", "--", "--b"], new Set(["ram", "rom", "json", "out", "define"]));
    assert.deepEqual(a.words, ["a.asm", "--b"]);
    assert.deepEqual([...a.options], [["ram", ["64"]], ["rom", ["8.5"]], ["json", [""]], ["out", ["x.BIN"]], ["define", ["N=$10"]]]);
    assert.deepEqual(defines(a), { N: 16 });
    assert.deepEqual(defines(parseArguments(["-D", "N=&H10"], new Set(["define"]))), { N: 16 });
    assert.throws(() => parseArguments(["--nope"], new Set()), UsageError);
    assert.throws(() => parseArguments(["--ram"], new Set(["ram"])), UsageError);
    assert.throws(() => parseArguments(["--ram", "--json"], new Set(["ram", "json"])), UsageError);
    assert.deepEqual([...parseArguments(["--type", "--x"], new Set(["type"])).options], [["type", ["--x"]]]);
    assert.throws(() => defines(parseArguments(["--define", "N=x"], new Set(["define"]))), UsageError);
  });

  it("says what is wrong with the command itself with code 2", () => {
    for (const args of [[], ["nope"], ["lint"], ["lint", "missing.asm"], ["new", "a", "--kind", "nope"], ["new", "minimal", "9a"], ["lint", "--nope", "a.asm"], ["bin"]]) assert.equal(e500(...args).code, 2, args.join(" "));
    assert.equal(e500("--help").code, 0);
    assert.match(e500("--version").out, /^\d+\.\d+\.\d+/);
  });

  it("finds mistakes in assembly and BASIC, of files and folders", () => {
    put("lint/ok.asm", "        ORG $BEC00\n        INCLUDE \"iocs.inc\"\nstart:  MV IL,SCRN_CLEAR\n        RETF\n");
    put("lint/bad.asm", "        ORG $BEC00\nstart:  MV A,IL\n");
    put("lint/node_modules/x.asm", "nonsense");
    put("lint/bad.bas", "10 PRNT 1\n");
    const r = e500("lint", "lint", "--json");
    assert.equal(r.code, 1);
    const { files, errors, issues } = json(r);
    assert.deepEqual([files, errors], [3, 2]);
    assert.deepEqual(issues.map((i: any) => [path.basename(i.file), i.line, i.code]), [["bad.asm", 2, "ASM020"], ["bad.bas", 1, "E500021"]]);
    const one = e500("lint", "lint/ok.asm");
    assert.equal(one.code, 0);
    assert.match(one.out, /1 ファイル、エラー 0 件/);
    assert.match(e500("lint", "lint/bad.bas").out, /bad\.bas:1:4: error E500021/);
  });

  it("has a batch file that takes parentheses and gives the exit code on", { skip: process.platform !== "win32" }, () => {
    // As PowerShell starts it: quotes it finds needless are gone. With and without Node.js on PATH.
    const system = process.env.SystemRoot ?? "C:\\Windows";
    const batch = (line: string, env: NodeJS.ProcessEnv): number | null =>
      spawnSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/c", `""${path.join(extensionRoot, "bin", "e500.cmd")}" ${line}"`], { cwd: root, windowsVerbatimArguments: true, env }).status;
    put("batch/ok.asm", "        ORG $BEC00\nstart:  RETF\n");
    put("batch/bad.bas", "10 PRNT 1\n");
    const base = { ...process.env, E500_LANG: "ja", Path: undefined, PATH: undefined };
    const withNode = { ...base, PATH: `${path.dirname(process.execPath)};${path.join(system, "System32")}` };
    const without = { ...base, PATH: path.join(system, "System32") };
    const code = [process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Programs"), process.env.ProgramFiles].some(d => d && fs.existsSync(path.join(d, "Microsoft VS Code", "Code.exe")));
    for (const env of code ? [withNode, without] : [withNode]) {
      assert.equal(batch("lint batch/ok.asm", env), 0);
      assert.equal(batch("lint batch/bad.bas", env), 1);
      assert.equal(batch("lint missing.asm", env), 2);
      assert.equal(batch("lint (x):2", env), 2);
      assert.equal(batch("lint batch/ok.asm --define (x):2", env), 2);
    }
  });

  it("makes programs from the templates and BIN files, and does not write over them", () => {
    assert.equal(e500("new", "game", "mygame", "made").code, 0);
    assert.deepEqual(fs.readdirSync(path.join(root, "made")).sort(), ["mygame.asm", "mygame.lcd", "mygamep.spr", "mygames.spr"]);
    assert.equal(e500("new", "game", "mygame", "made").code, 2);
    assert.equal(e500("new", "game", "mygame", "made", "--force").code, 0);
    const made = json(e500("bin", "made/mygame.asm", "--json"));
    assert.deepEqual([made.origin, made.load, made.call], ["BE000", "LOAD M \"X:MYGAME.BIN\"", "CALL &HBE000"]);
    assert.equal(fs.statSync(path.join(root, "made", "MYGAME.BIN")).size, made.bytes + 16);
    assert.equal(e500("bin", "lint/bad.asm").code, 1);
  });

  it("assembles as e500asm does, and disassembles back to the same bytes", () => {
    put("asm/inc.inc", "twice:  ADD A,A\n        RET\n");
    const source = put("asm/a.asm", "        ORG $BEC00\nStart:  MV A,N\n        CALL twice\n        RC\n        RETF\n        INCLUDE \"inc.inc\"\ndata:   DB \"HELLO\",0\n        END\n");
    const r = e500("asm", source, "-o", "asm/a.bin", "-l", "asm/a.lst", "-s", "asm/a.sym", "-D", "N=$21");
    assert.equal(r.code, 0, r.err);
    const bytes = fs.readFileSync(path.join(root, "asm", "a.bin"));
    assert.equal(bytes.subarray(0, 5).toString("hex"), "08210407ec");
    assert.match(fs.readFileSync(path.join(root, "asm", "a.lst"), "utf8"), /^Address  Machine code              Source\n[\s\S]*\nBEC00    08 21                     a\.asm\(2\): Start:  MV A,N\n/);
    assert.match(fs.readFileSync(path.join(root, "asm", "a.sym"), "utf8"), /^data EQU \$BEC[0-9A-F]{2}\nN EQU \$21\nStart EQU \$BEC00\ntwice EQU \$BEC07\n$/);
    assert.equal(e500("dis", "asm/a.bin", "--org", "BEC00", "-o", "asm/d.asm").code, 0);
    assert.equal(e500("asm", "asm/d.asm", "-o", "asm/d.bin").code, 0);
    assert.deepEqual(fs.readFileSync(path.join(root, "asm", "d.bin")), bytes);
    // A SAVE M file says where it goes.
    assert.equal(e500("bin", source, "-D", "N=1", "-o", "asm/S.BIN").code, 0);
    assert.match(e500("dis", "asm/S.BIN", "-o", "asm/s.asm").out, /origin=BEC00h/);
    assert.match(e500("asm", source, "-D", "N=1", "-f", "hex").out, /^OK: /);
    assert.match(fs.readFileSync(path.join(root, "asm", "a.hex"), "utf8"), /^:02000004000BEF\n:[\s\S]*:00000001FF\n$/);
    assert.equal(e500("asm", source, "-D", "N=1", "-f", "ce140f", "-o", "asm/M.BIN").code, 0);
    assert.deepEqual(fs.readFileSync(path.join(root, "asm", "M.BIN")), fs.readFileSync(path.join(root, "asm", "S.BIN")));
    // BASIC as the machine's text.
    const bas = put("asm/kana.bas", "10 PRINT \"ｱｲ¥\"\n\nno number\n20 END");
    const made = e500("bin", bas, "-o", "asm/K.BAS");
    assert.equal(made.code, 0, made.err);
    assert.match(made.out, /LOAD "X:K\.BAS"/);
    assert.equal(fs.readFileSync(path.join(root, "asm", "K.BAS")).toString("hex"), Buffer.from("10 PRINT \"").toString("hex") + "b1b25c22" + "0d0a" + Buffer.from("20 END\r\n").toString("hex"));
    assert.equal(e500("bin", bas, "-o", bas).code, 2);
    assert.equal(e500("asm", source, "-D", "N=1", "-o", source).code, 2);
    assert.equal(e500("asm", "lint/bad.asm").code, 1);
    assert.equal(e500("dis", "asm/a.bin").code, 2); // asm/a.asm is a source
    assert.equal(e500("dis", "asm/a.bin", "--force").code, 1); // raw without --org
    assert.equal(e500("dis", "asm/a.bin", "--org", "FFFFFF").code, 2);
  });

  it("never loses a file of the user's", () => {
    const main = put("keep/main.asm", "        ORG $BEC00\nstart:  RC\n        RETF\n        INCLUDE \"part.inc\"\n        INCBIN \"MAIN.BIN\"\n        INCBIN \"pic.dat\"\n");
    put("keep/part.inc", "part:   NOP\n");
    put("keep/MAIN.BIN", "data");
    put("keep/pic.dat", "pic");
    const all = (): string[] => fs.readdirSync(path.join(root, "keep")).sort().map(f => f + "=" + fs.readFileSync(path.join(root, "keep", f), "latin1"));
    const before = all();
    for (const target of ["keep/part.inc", "keep/pic.dat", "keep/main.asm"]) {
      assert.equal(e500("asm", main, "-o", target).code, 2, target);
      assert.equal(e500("asm", main, "-o", "keep/x.bin", "-l", target).code, 2, target);
      assert.equal(e500("bin", main, "-o", target).code, 2, target);
    }
    assert.equal(e500("bin", main).code, 2); // MAIN.BIN is in the program
    assert.equal(e500("bin", main, "--force").code, 2);
    assert.deepEqual(all(), before);
    // A default name does not replace what the command did not make.
    const own = put("keep2/game.asm", "        ORG $BEC00\nstart:  RC\n        RETF\n");
    put("keep2/GAME.BIN", "mine");
    assert.equal(e500("bin", own).code, 2);
    assert.equal(e500("bin", own, "--force").code, 0);
    assert.equal(e500("bin", own).code, 0); // its own again
    put("keep2/game.asm", "        ORG $BE000\nstart:  RC\n        RETF\n");
    assert.equal(e500("bin", own).code, 0); // at another address too
    // Two sources that get one name.
    const ja = put("keep3/迷路.asm", "        ORG $BE000\nstart:  RC\n        RETF\n");
    assert.equal(e500("bin", ja).code, 0);
    assert.equal(e500("bin", ja).code, 0);
    put("keep3/時計.asm", "        ORG $BE000\nstart:  NOP\n        RC\n        RETF\n");
    const first = fs.readFileSync(path.join(root, "keep3", "PROGRAM.BIN"));
    assert.equal(e500("bin", "keep3/時計.asm").code, 2);
    assert.deepEqual(fs.readFileSync(path.join(root, "keep3", "PROGRAM.BIN")), first);
    assert.equal(e500("bin", "keep3/時計.asm", "-o", "keep3/CLOCK.BIN").code, 0);
    const text = put("keep2/my_long_program.bas", "10 END\n");
    assert.equal(e500("bin", text).code, 0);
    put("keep2/my_long_program.bas", "10 PRINT 1\n20 END\n");
    assert.equal(e500("bin", text).code, 0);
    put("keep2/GAME.asm", fs.readFileSync(own, "utf8")); // the same file where names have no case
    assert.equal(e500("dis", "keep2/GAME.BIN").code, 2);
    assert.match(fs.readFileSync(own, "utf8"), /start:/);
    // All of the outputs, or none.
    fs.mkdirSync(path.join(root, "keep2", "dir"));
    assert.equal(e500("asm", own, "-o", "keep2/new.bin", "-l", "keep2/dir").code, 2);
    assert.ok(!fs.existsSync(path.join(root, "keep2", "new.bin")));
    assert.ok(!fs.readdirSync(path.join(root, "keep2")).some(f => f.endsWith(".tmp")));
  });

  it("warns of a program that is not in the machine-code area, and answers in JSON when it fails", () => {
    put("out/low.asm", "start:  RC\n        RETF\n");
    const low = e500("bin", "out/low.asm", "--json");
    assert.match(low.err, /機械語エリア/);
    assert.equal(json(low).outside, true);
    assert.ok(json(e500("bin", "missing.asm", "--json")).error);
    assert.ok(Array.isArray(json(e500("run", put("out/bad.asm", "        MV A,IL\n"), "--json")).issues));
    assert.equal(e500("asm", "out/low.asm", "--out", "--force").code, 2); // an option is no value
  });

  it("refuses test files that would check nothing", () => {
    const t = (body: string): string => `{ "program": "x.asm", "tests": [ ${body} ] }`;
    parseTestFile(t('{ "name": "a", "call": "x", "expect": { "memory": { "x": [1, 255], "y": "AB" } } }'));
    parseTestFile(t('{ "name": "a", "basic": "PRINT 1", "keys": [] }'));
    const b = (body: string): string => `{ "program": "x.bas", "tests": [ ${body} ] }`;
    parseTestFile(b('{ "name": "a", "call": 100, "variables": { "A": 1, "B$": "x", "P(1)": 2 }, "expect": { "variables": { "D#": 1.5 }, "state": "ended" } }'));
    for (const bad of ['{ "name": "a", "registers": { "A": 1 } }', '{ "name": "a", "return": "near" }', '{ "name": "a", "call": "x+1" }', '{ "name": "a", "variables": { "A": "x" } }', '{ "name": "a", "variables": { "A B": 1 } }', '{ "name": "a", "expect": { "state": "done" } }', '{ "name": "a", "expect": { "registers": { "A": 1 } } }']) assert.throws(() => parseTestFile(b(bad)), Error, bad);
    for (const bad of ['{ "name": "a", "registers": 5 }', '{ "name": "a", "expect": { "registers": { "Q": 1 } } }', '{ "name": "a", "keys": ["A"] }', '{ "name": "a", "basic": "CLS", "call": "x" }', '{ "name": "a", "basic": 5 }', '{ "name": "a", "maxCycles": 1.5 }']) assert.throws(() => parseTestFile(t(bad)), Error, bad);
    for (const bad of ['{ "name": "a", "call": 100 }', '{ "name": "a", "type": "x" }', '{ "name": "a", "call": "x", "expect": { "variables": { "A": 1 } } }']) assert.throws(() => parseTestFile(t(bad)), Error, bad);
    for (const bad of ['{ "name": "a", "expects": {} }', '{ "name": "a", "expect": { "register": {} } }', '{ "name": "a", "expect": { "memory": { "x": [256] } } }', '{ "name": "a", "expect": { "memory": { "x": [] } } }', '{ "name": "a", "return": "long" }', '{ "name": "a" }, { "name": "a" }', '{ "name": "a", "maxCycles": 0 }', '{ "name": "a", "expect": { "screen": 5 } }']) assert.throws(() => parseTestFile(t(bad)), Error, bad);
  });

  it("makes a program from its name, of the kind that fits or the one named", () => {
    const made = (...args: string[]): string[] => { const r = e500("new", ...args); assert.equal(r.code, 0, r.err); return r.out.trim().split(/\r?\n/).map(f => path.basename(f)); };
    fs.mkdirSync(path.join(root, "nw"));
    assert.deepEqual(made("mytool"), ["mytool.bas", "mytool.e500test.json"]);
    assert.match(fs.readFileSync(path.join(root, "mytool.bas"), "utf8"), /MENU/);
    assert.deepEqual(made("mygame"), ["mygame.bas", "mygame.e500test.json"]);
    assert.match(fs.readFileSync(path.join(root, "mygame.bas"), "utf8"), /CATCH/);
    // A name that is also a kind is a name.
    assert.deepEqual(made("text"), ["text.bas", "text.e500test.json"]);
    assert.deepEqual(made("fast", "--kind", "app"), ["fast.asm", "fast.e500test.json"]);
    assert.deepEqual(made("nw/tool.asm"), ["tool.asm", "tool.e500test.json"]);
    assert.deepEqual(made("list", "nw"), ["list.bas", "list.e500test.json"]);
    assert.deepEqual(made("minimal", "mini", "nw"), ["mini.asm"]);
    assert.equal(e500("new").code, 2);
    assert.equal(e500("new", "text").code, 2); // it is there
    assert.equal(e500("new", "toolongname").code, 2);
    assert.equal(e500("new", "abc", "--kind", "nope").code, 2);
    assert.deepEqual(made("game", "nw", "--kind", "app"), ["game.asm", "game.e500test.json"]);
    assert.ok(fs.existsSync(path.join(root, "nw", "game.asm")));
    assert.equal(e500("new", "x.bas", "--kind", "app").code, 2);
    assert.equal(e500("new", "a", "b", "c").code, 2);
    assert.equal(e500("new", "a", "mytool.bas").code, 2);
  });

  it("looks words up", () => {
    assert.match(lookup("mvl").join("\n"), /MVL \(m\),\(n\)/);
    assert.match(lookup("SCRN_PUTS").join("\n"), /EQU \$42[\s\S]*\(BL\)/);
    assert.match(lookup("DEV_SCRN").join("\n"), /SCRN_CLEAR/);
    assert.match(lookup("WHILE").join("\n"), /ROM 8\.3/);
    assert.match(lookup(".ORG").join("\n"), /ORG/);
    assert.match(lookup("sprite_draw").join("\n"), /sprite\.inc[\s\S]*コマ/);
    assert.match(lookup("random_seed").join("\n"), /random\.inc/);
    assert.match(lookup("PAD_LEFT").join("\n"), /EQU/);
    for (const n of ["game_start", "game_end", "game_wait", "sound_on", "sound_off", "screen_load", "screen_keep", "screen_restore", "screen_clear", "screen_show", "screen_part", "sprite_draw", "box_hit", "pad_read", "text_draw", "text_put", "number_draw", "random", "random_below"]) assert.ok(lookup(n).length > 0, n);
    assert.deepEqual(lookup("NOSUCH"), []);
    for (const [kind, list] of words()) for (const w of list) assert.ok(lookup(w).length > 0, `${kind} ${w}`);
    assert.equal(e500("help", "NOSUCH").code, 1);
  });

  it("writes PNG files of the screen", () => {
    const bits = new Uint8Array(960);
    bits[0] = 0x80;
    const png = lcdPng(bits, 2);
    assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]);
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [480, 64]);
  });

  it("prints the skill, its links turned into commands", () => {
    const text = guideText(extensionRoot) ?? "";
    assert.ok(!text.startsWith("---") && text.includes("BASIC か機械語か"));
    assert.ok(!/\]\((references\/)?[a-z]+\.md/.test(text), "a link to a reference is left");
    assert.ok(text.includes("`e500 guide basic`"));
    assert.deepEqual(guideTopics(extensionRoot), ["app", "assembly", "basic", "game", "hardware", "manual", "testing"]);
    for (const t of guideTopics(extensionRoot)) assert.ok(!/\]\([a-z]+\.md/.test(guideText(extensionRoot, t) ?? "x"), t);
    assert.equal(guideText(extensionRoot, "../SKILL"), undefined);
    const r = e500("guide", "basic");
    assert.equal(r.code, 0); assert.match(r.out, /DATA/);
    assert.equal(e500("guide", "nothing").code, 2);
  });

  it("puts the entry of the skill into a home folder", () => {
    const home = path.join(root, "home");
    const r = e500("setup", "--home", home);
    assert.equal(r.code, 0, r.err);
    const description = /description: .*/.exec(fs.readFileSync(path.join(skillFolder(extensionRoot), "SKILL.md"), "utf8"))?.[0];
    for (const place of [".claude", ".agents"]) {
      const t = fs.readFileSync(path.join(home, place, "skills", "pc-e500", "SKILL.md"), "utf8");
      assert.match(t, /^---\nname: pc-e500\ndescription: \S/);
      assert.ok(description && t.includes(description) && t.includes(STUB_MARK) && t.includes("npx -y pc-e500-tools@latest guide"));
    }
    assert.deepEqual(installStub(home, extensionRoot, false), { written: [], kept: [] });
    // A whole skill that someone put there stays, unless --force.
    const other = path.join(home, ".agents", "skills", "pc-e500");
    fs.writeFileSync(path.join(other, "SKILL.md"), "---\nname: pc-e500\n---\nmine");
    fs.mkdirSync(path.join(other, "references")); fs.writeFileSync(path.join(other, "references", "old.md"), "old");
    assert.deepEqual(installStub(home, extensionRoot, false).kept, [path.join(other, "SKILL.md")]);
    installStub(home, extensionRoot, true);
    assert.ok(fs.readFileSync(path.join(other, "SKILL.md"), "utf8").includes(STUB_MARK) && !fs.existsSync(path.join(other, "references")));
    assert.equal(e500("setup", "somewhere").code, 2);
  });

  it("puts the skill into a project, keeping files that were changed", () => {
    const project = path.join(root, "project");
    const done = installSkill(project, extensionRoot, false);
    assert.ok(done.written.length >= 10);
    for (const place of [".claude", ".agents"]) assert.match(fs.readFileSync(path.join(project, place, "skills", "pc-e500", "SKILL.md"), "utf8"), /^---\r?\nname: pc-e500\r?\ndescription: \S/);
    assert.deepEqual(installSkill(project, extensionRoot, false), { written: [], kept: [] });
    const mine = path.join(project, ".claude", "skills", "pc-e500", "SKILL.md");
    fs.writeFileSync(mine, "mine");
    assert.deepEqual(installSkill(project, extensionRoot, false), { written: [], kept: [mine] });
    assert.equal(fs.readFileSync(mine, "utf8"), "mine");
    installSkill(project, extensionRoot, true);
    assert.notEqual(fs.readFileSync(mine, "utf8"), "mine");
  });
});

describe("skill", () => {
  const skill = skillFolder(extensionRoot);
  const text = (f: string): string => fs.readFileSync(path.join(skill, f), "utf8");

  it("links to files it has, and names commands there are", () => {
    for (const f of ["SKILL.md", "references/assembly.md", "references/game.md", "references/basic.md", "references/testing.md", "references/hardware.md", "references/app.md", "references/manual.md"])
      for (const [, to] of text(f).matchAll(/\]\((?!https?:)([^)#]+)\)/g)) assert.ok(fs.existsSync(path.join(skill, path.dirname(f), to)), `${f}: ${to}`);
    // The documents of the repository it names, and their headings: no section numbers, which change.
    const repository = path.resolve(extensionRoot, "..", "..");
    let named = 0;
    for (const f of ["SKILL.md", "references/assembly.md", "references/game.md", "references/basic.md", "references/testing.md", "references/hardware.md", "references/app.md", "references/manual.md"]) {
      assert.doesNotMatch(text(f), /§/, f);
      for (const [, to, headings] of text(f).matchAll(/`((?:docs|Samples)\/[\w\/.-]+)`((?:「[^」]+」)*)/g)) {
        const file = path.join(repository, to);
        assert.ok(fs.existsSync(file), `${f}: ${to}`);
        named++;
        for (const [, heading] of headings.matchAll(/「([^」]+)」/g))
          assert.ok(fs.readFileSync(file, "utf8").split(/\r?\n/).some(l => /^#+ /.test(l) && l.includes(heading)), `${f}: ${to} ${heading}`);
      }
    }
    assert.ok(named > 40);
    const usage = e500("--help").out;
    for (const [, c] of text("SKILL.md").matchAll(/`e500 (\w+)/g)) assert.ok(usage.includes(`e500 ${c}`), c);
  });

  it("has examples without mistakes", () => {
    let n = 0;
    for (const f of ["assembly", "basic", "app"]) for (const [, kind, code] of text(`references/${f}.md`).matchAll(/```(asm|basic)\r?\n([\s\S]*?)```/g)) {
      if (code.includes("…")) continue;
      const file = put(`skill/${f}${n++}.${kind === "asm" ? "asm" : "bas"}`, code);
      const r = e500("lint", file);
      assert.equal(r.code, 0, r.out);
    }
    assert.ok(n >= 6);
  });

  it("describes the pictures as they are", () => {
    // The Python of references/game.md, here in TypeScript: the same arithmetic.
    const dots = Uint8Array.from({ length: 7680 }, (_, i) => (i * 7919 >> 5) & 1);
    const b = new Uint8Array(1024);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 240; x++) if (dots[y * 240 + x]) {
      const c = x < 64 || x >= 176 ? 1 : 0, col = x < 64 ? x : x < 120 ? x - 64 : x < 176 ? 175 - x : 239 - x, row = y + (x >= 120 ? 32 : 0);
      b[c * 512 + (row >> 3) * 64 + col] |= 1 << (row & 7);
    }
    assert.deepEqual(decodeLcd(Buffer.from(b))?.dots, dots);
    assert.deepEqual(Buffer.from(encodeLcd(dots)), Buffer.from(b));
    assert.deepEqual([...decodeSpr(Buffer.from([2, 1, 1, 1, 0x01, 0x01, 0x82, 0x80]))!.frames[0]].slice(0, 4), [1, 0, 0, 2]);
  });
});

describe("command line with the emulator", { skip: available ? false : "e500dbg, e500core.dll or the ROM not found" }, () => {
  it("runs assembly programs and says how they ended", () => {
    const run = (name: string, body: string, ...more: string[]): any => { const r = e500("run", put(`run/${name}.asm`, `        ORG $BEC00\n${body}`), "--json", ...more); return { ...json(r), code: r.code }; };
    const ended = run("ok", "start:  MV A,5\n        MV [$BEC20],A\n        RC\n        RETF\n", "--memory", "$BEC20:1", "--png", path.join(root, "screens", "a", "s.png"));
    assert.deepEqual([ended.state, ended.code, ended.memory], ["ended", 0, { "$BEC20:1": "05" }]);
    assert.ok(fs.statSync(path.join(root, "screens", "a", "s.png")).size > 60);
    const loop = run("loop", "start:  MV ($00),7\n        JR start\n", "--seconds", "1", "--memory", "($00):1");
    assert.deepEqual([loop.state, loop.code, loop.memory], ["running", 0, { "($00):1": "07" }]);
    const error = run("error", "start:  MV A,$15\n        SC\n        RETF\n");
    assert.deepEqual([error.state, error.code, error.error], ["error", 1, "Division by Zero"]);
    const menu = run("ret", "start:  RC\n        RET\n");
    assert.deepEqual([menu.state, menu.code], ["menu", 1]);
    // Where a RET ends depends on the RAM: the main menu, or NO MEMORY.
    for (const ram of ["32", "256"]) assert.equal(run("ret" + ram, "start:  RC\n        RET\n", "--ram", ram).state, "menu");
  });

  it("runs BASIC programs: errors, input, variables", () => {
    const error = e500("run", put("run/e.bas", "10 A=3\n20 PRINT 1/0\n"));
    assert.equal(error.code, 1);
    assert.match(error.out, /Division by Zero in 20[\s\S]*state: error\s*$/);
    const input = json(e500("run", put("run/i.bas", "10 INPUT \"N=\";N\n20 PRINT N*2\n"), "--type", "21\\n", "--seconds", "2", "--json"));
    assert.equal(input.state, "ended");
    assert.match(input.screen, /42/);
    assert.ok(input.variables.includes("N=21"));
    const state = (name: string, text: string, ...more: string[]): string => json(e500("run", put(`run/${name}.bas`, text), "--seconds", "2", "--json", ...more)).state;
    assert.equal(state("go", "10 PRINT \"> GO\":GOTO 10\n"), "running");
    assert.equal(state("mm", "10 PRINT \"MAIN MENU\"\n20 GOTO 20\n"), "running");
    assert.equal(state("goerr", "10 CLS:PRINT \"> GO\":PRINT 1/0\n"), "error");
    assert.equal(state("below", "10 LOCATE 0,3:PRINT \"ABC\";:LOCATE 0,0\n"), "ended");
    // Text that only looks like an error, one that the program handles, and what is typed after the end.
    assert.equal(state("text", "10 PRINT \"BOUGHT 5 in 10\"\n"), "ended");
    assert.equal(state("handled", "10 ON ERROR GOTO 100\n20 PRINT 1/0\n30 END\n100 PRINT \"ERR\";ERN;\" in\";ERL\n110 RESUME 30\n"), "ended");
    assert.equal(state("calc", "10 END\n", "--type", "1+2\\n"), "ended");
    put("run/keys.txt", "PRINT \"a>b&c\"\n");
    assert.match(json(e500("run", put("run/f.bas", "10 END\n"), "--type-file", "run/keys.txt", "--seconds", "2", "--json")).screen, /^a>b&c$/m);
    assert.equal(state("break", "10 GOTO 10\n", "--keys", "ON/BRK"), "ended");
    assert.equal(state("stop", "10 PRINT \"A\":STOP\n"), "error");
    // Break is in reverse video, and this ROM has a character that is all black.
    if (fs.existsSync(path.join(path.dirname(rom), "PC-E500S(8.3).ROM"))) assert.equal(state("stop", "10 STOP\n", "--rom", path.join(path.dirname(rom), "PC-E500S(8.3).ROM")), "error");
    assert.equal(state("key", "10 INPUT A\n20 PRINT 1/A\n", "--keys", "0,ENTER"), "error");
    // A program draws over the lamps of the LCD.
    assert.equal(e500("new", "screen", "DRAW", "run/draw").code, 0);
    assert.equal(json(e500("run", "run/draw/DRAW.asm", "--seconds", "2", "--json")).state, "running");
  });

  it("runs the tests of a folder", () => {
    put("tests/add.asm", "        ORG $BEC00\nadd2:   ADD A,IL\n        RET\n");
    const spec = (a: number): string => `{ "program": "add.asm", "tests": [ { "name": "one", "call": "add2", "return": "near", "registers": { "A": 1, "IL": 2 }, "expect": { "registers": { "A": ${a} } } }, { "name": "two", "call": "add2", "return": "near" } ] }`;
    put("tests/add.e500test.json", spec(3));
    const good = e500("test", "tests");
    assert.equal(good.code, 0);
    assert.match(good.out, /成功 2 件、失敗 0 件/);
    put("tests/add.e500test.json", spec(4));
    const bad = json(e500("test", "tests", "--json"));
    assert.deepEqual([bad.passed, bad.failed], [1, 1]);
    assert.match(bad.tests[0].messages[0], /A: 期待 4/);
    assert.equal(e500("test", "tests", "--only", "two").code, 0);
    assert.equal(e500("test", "tests", "--only", "nope").code, 2);
    // Internal RAM, and a line longer than the time to type it in five seconds.
    put("tests/in.asm", "        ORG $BEC00\nv       EQU $20\ntwice:  MV A,(v)\n        ADD A,A\n        MV (v+1),A\n        RET\n");
    put("tests/in.e500test.json", `{ "program": "in.asm", "tests": [ { "name": "in", "call": "twice", "return": "near", "memory": { "(v)": [21] }, "expect": { "memory": { "(v+1)": [42] } } },
      { "name": "long", "basic": "CLS:A=0:B=1:${"A=A+B:".repeat(20)}PRINT \\"N=\\";A", "expect": { "screen": "N= 20" } },
      { "name": "busy", "basic": "CLS:FOR I=1 TO 1E9:NEXT I", "maxCycles": 768000, "expect": { "screen": "nope" } } ] }`);
    const more = json(e500("test", "tests/in.e500test.json", "--json"));
    assert.deepEqual(more.tests.map((t: any) => t.passed), [true, true, false]);
    assert.match(more.tests[2].messages[0], /まだ実行中/);
    // BASIC: the templates with their tests, and what a test says when it fails.
    for (const kind of ["app", "basicapp", "basicgame"]) {
      assert.equal(e500("new", "T" + kind.slice(-6), "bastests", "--kind", kind).code, 0);
      assert.equal(e500("lint", "bastests").code, 0);
    }
    const bas = json(e500("test", "bastests", "--json"));
    assert.deepEqual([bas.failed, bas.passed >= 28], [0, true], JSON.stringify(bas.tests.filter((t: any) => !t.passed)));
    put("bas/p.bas", "10 INPUT \"N=\";N\n20 GOSUB 100\n30 PRINT \"R=\";R\n40 END\n100 R=N*2:B$=\"hi\":RETURN\n200 PRINT 1/0\n210 RETURN\n");
    put("bas/p.e500test.json", JSON.stringify({ program: "p.bas", tests: [
      { name: "ok", type: "21\n", expect: { state: "ended", screen: "R= 42", variables: { R: 42, B$: "hi" } } },
      { name: "wrong", call: 100, variables: { N: 4 }, expect: { variables: { R: 9 } } },
      { name: "error", call: "200" },
      { name: "error wanted", call: 200, expect: { error: "Division by Zero" } },
      { name: "waits", expect: { state: "running" } },
      { name: "wrong state", expect: { state: "ended" } },
      { name: "no such", call: 100, expect: { variables: { "Q1": 1 } } }
    ] }));
    const own = json(e500("test", "bas", "--json"));
    assert.deepEqual(own.tests.map((t: any) => t.passed), [true, false, false, true, true, false, false], JSON.stringify(own.tests));
    assert.match(own.tests[1].messages[0], /R: 期待 9、実際 8/);
    const one = (name: string, program: string, ...tests: object[]): boolean[] => {
      put(`one/${name}.bas`, program);
      put(`one/${name}.e500test.json`, JSON.stringify({ program: `${name}.bas`, tests: tests.map((t, i) => ({ name: String(i), ...t })) }));
      return json(e500("test", `one/${name}.e500test.json`, "--json")).tests.map((t: any) => t.passed);
    };
    // The lines put in for "call" are not run by the program.
    assert.deepEqual(one("noend", "10 S=0:GOTO 100\n20 S=S+1:RETURN\n100 GOSUB 20\n110 PRINT S\n", { expect: { variables: { S: 1 } } }, { call: 20, variables: { S: 4 }, expect: { variables: { S: 5 } } }), [true, true]);
    // An error is seen beside what the program has drawn; text like one is none.
    assert.deepEqual(one("drawn", "10 CLS:LOCATE 0,1:PRINT \"HP 100 LEVEL 5 ENEMY 33 GOLD 1234 XYZ\":LOCATE 0,1\n20 A=1/0\n", { expect: { state: "ended" } }, { expect: { error: "Division by Zero in 20" } }), [false, true]);
    assert.deepEqual(one("like", "10 CLS:PRINT \"Verify error in 10\":END\n", { expect: { state: "ended" } }), [true]);
    // Variables that cannot be set fail; kana, quotes and control codes can.
    assert.deepEqual(one("vars", "10 END\n100 REM\n110 S=0:IF X=10 THEN S=1\n120 RETURN\n", { call: 100, variables: { X: 1e100 }, expect: {} }, { call: 100, variables: { TOTAL: 99 } }, { call: 100, variables: { "P(30)": 7 } },
      { call: 100, variables: { C$: "ｱ\"\u000eb", X: -1.5 }, expect: { variables: { C$: "ｱ\"\u000eb", X: -1.5, S: 0 } } }), [false, false, false, true]);
    // A crash, and a subroutine that does not come back.
    assert.deepEqual(one("crash", "10 CALL &HBEC00\n100 GOTO 100\n", { memory: { "&HBEC00": [0x9f, 6] }, maxCycles: 7680000, expect: {} }, { call: 100, maxCycles: 768000 }), [false, false]);
    // Each test has X: as it was, and answers are typed as they are written.
    // A subroutine that ends the program, an error that was handled and shown, and a crash of a machine-code program.
    assert.deepEqual(one("ends", "10 END\n100 END\n200 RETURN\n", { call: 100 }, { call: 200 }), [false, true]);
    assert.deepEqual(one("shown", "10 ON ERROR GOTO 30\n20 A=1/0\n30 CLS:PRINT \"Division by Zero in\";ERL:END\n", { expect: { state: "ended" } }), [true]);
    put("one/c.asm", "        ORG $BE000\nstart:  RC\n        RET\n");
    put("one/c.e500test.json", JSON.stringify({ program: "c.asm", tests: [{ name: "crash", basic: "CALL &HBE000" }] }));
    assert.equal(json(e500("test", "one/c.e500test.json", "--json")).failed, 1);
    assert.deepEqual(one("disk", "10 OPEN \"X:T.DAT\" FOR APPEND AS #1:PRINT #1,\"A\":CLOSE\n20 N=0:OPEN \"X:T.DAT\" FOR INPUT AS #1\n30 IF EOF 1 THEN 50\n40 INPUT #1,A$:N=N+1:GOTO 30\n50 CLOSE:END\n", { expect: { variables: { N: 1 } } }, { expect: { variables: { N: 1 } } }), [true, true]);
    assert.deepEqual(one("type", "10 INPUT \"N=\";N$\n", { type: "Hello World\n", expect: { variables: { N$: "Hello World" } } }, { type: "ｱ\n" }), [true, false]);
    put("bas/p.bas", "10 PRNT 1\n");
    assert.match(json(e500("test", "bas", "--json")).tests[0].messages[0], /PRNT/);
    // What cannot be run is a failure of that file, and not of the command.
    put("tests/none.e500test.json", `{ "program": "gone.asm", "tests": [ { "name": "x", "call": "y" } ] }`);
    put("tests/empty.e500test.json", `{ "program": "in.asm", "tests": [] }`);
    for (const f of ["none", "empty"]) { const r = json(e500("test", `tests/${f}.e500test.json`, "--json")); assert.deepEqual([r.passed, r.failed], [0, 1], f); }
  });
});
