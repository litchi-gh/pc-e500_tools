import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it } from "node:test";
import { assemblerInvocation } from "../asm/invocation";

describe("assembler invocation", () => {
  it("runs an .exe directly with its arguments", () => {
    assert.deepEqual(assemblerInvocation("C:\\t\\e500asm.exe", ["a&b.asm"]), { file: "C:\\t\\e500asm.exe", args: ["a&b.asm"], verbatim: false });
  });

  it("quotes every argument for cmd.exe", () => {
    const result = assemblerInvocation("C:\\t\\e500asm.cmd", ["a&b.asm", "-D", "X=1"], "C:\\Windows\\System32\\cmd.exe");
    assert.deepEqual(result, { file: "C:\\Windows\\System32\\cmd.exe", args: ["/d", "/s", "/c", '""C:\\t\\e500asm.cmd" "a&b.asm" "-D" "X=1""'], verbatim: true });
  });

  it("refuses an argument that could end the quoting", () => {
    assert.throws(() => assemblerInvocation("e500asm.bat", ['a"&calc&"b.asm']));
    assert.throws(() => assemblerInvocation("e500asm.cmd", ["a\nb.asm"]));
  });

  it("does not run commands hidden in file names", { skip: process.platform !== "win32" }, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "e500asm-invocation-"));
    try {
      const wrapper = path.join(dir, "wrapper with space&.cmd");
      fs.writeFileSync(wrapper, "@echo off\r\necho ARGS=%*\r\n");
      for (const source of ["a&echo,x>INJECTED&.asm", "a|echo,x>INJECTED|.asm", "(a)^&echo,x>INJECTED.asm", "C:\\R&D\\prog.asm"]) {
        const invocation = assemblerInvocation(wrapper, [source, "-D", "NAME=1"]);
        const result = spawnSync(invocation.file, [...invocation.args], { cwd: dir, windowsHide: true, windowsVerbatimArguments: invocation.verbatim, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 10000 });
        assert.equal(result.stdout.trim(), `ARGS="${source}" "-D" "NAME=1"`);
        assert.ok(!fs.existsSync(path.join(dir, "INJECTED")), source);
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
