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
import { installSkill } from "../cli/skill";
import { decodeLcd, encodeLcd } from "../lcd/lcdFile";
import { decodeSpr } from "../lcd/sprFile";

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
    assert.throws(() => parseArguments(["--nope"], new Set()), UsageError);
    assert.throws(() => parseArguments(["--ram"], new Set(["ram"])), UsageError);
    assert.throws(() => defines(parseArguments(["--define", "N=x"], new Set(["define"]))), UsageError);
  });

  it("says what is wrong with the command itself with code 2", () => {
    for (const args of [[], ["nope"], ["lint"], ["lint", "missing.asm"], ["new", "nope", "a"], ["new", "minimal", "9a"], ["lint", "--nope", "a.asm"], ["bin"]]) assert.equal(e500(...args).code, 2, args.join(" "));
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
    assert.equal(e500("dis", "asm/a.bin").code, 1);
    assert.equal(e500("dis", "asm/a.bin", "--org", "FFFFFF").code, 2);
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
    for (const n of ["game_start", "game_end", "game_wait", "sound_on", "sound_off", "screen_load", "screen_keep", "screen_restore", "screen_clear", "screen_show", "sprite_draw", "box_hit", "pad_read", "text_draw", "text_put", "number_draw", "random", "random_below"]) assert.ok(lookup(n).length > 0, n);
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

  it("puts the skill into a project, keeping files that were changed", () => {
    const project = path.join(root, "project");
    const done = installSkill(project, extensionRoot, false);
    assert.ok(done.length >= 10);
    for (const place of [".claude", ".agents"]) assert.match(fs.readFileSync(path.join(project, place, "skills", "pc-e500", "SKILL.md"), "utf8"), /^---\r?\nname: pc-e500\r?\ndescription: \S/);
    assert.equal(installSkill(project, extensionRoot, false).length, 1);
    const mine = path.join(project, ".claude", "skills", "pc-e500", "SKILL.md");
    fs.writeFileSync(mine, "mine");
    installSkill(project, extensionRoot, false);
    assert.equal(fs.readFileSync(mine, "utf8"), "mine");
    installSkill(project, extensionRoot, true);
    assert.notEqual(fs.readFileSync(mine, "utf8"), "mine");
  });
});

describe("skill", () => {
  const skill = path.join(extensionRoot, "skills", "pc-e500");
  const text = (f: string): string => fs.readFileSync(path.join(skill, f), "utf8");

  it("links to files it has, and names commands there are", () => {
    for (const f of ["SKILL.md", "references/assembly.md", "references/game.md", "references/basic.md", "references/testing.md"])
      for (const [, to] of text(f).matchAll(/\]\((?!https?:)([^)#]+)\)/g)) assert.ok(fs.existsSync(path.join(skill, path.dirname(f), to)), `${f}: ${to}`);
    const usage = e500("--help").out;
    for (const [, c] of text("SKILL.md").matchAll(/`e500 (\w+)/g)) assert.ok(usage.includes(`e500 ${c}`), c);
  });

  it("has examples without mistakes", () => {
    let n = 0;
    for (const f of ["assembly", "basic"]) for (const [, kind, code] of text(`references/${f}.md`).matchAll(/```(asm|basic)\r?\n([\s\S]*?)```/g)) {
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
    const ended = run("ok", "start:  MV A,5\n        MV [$BEC20],A\n        RC\n        RETF\n", "--memory", "$BEC20:1", "--png", path.join(root, "s.png"));
    assert.deepEqual([ended.state, ended.code, ended.memory], ["ended", 0, { "$BEC20:1": "05" }]);
    assert.ok(fs.statSync(path.join(root, "s.png")).size > 60);
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
  });
});
