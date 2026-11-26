import assert from "node:assert/strict";
import * as path from "node:path";
import { describe, it } from "node:test";
import { AsmHost } from "../asm/assembler";
import { definitionAt, definitions, nameAt } from "../asm/definition";

const root = path.resolve("defs");
const files: Record<string, string> = {
  "main.asm": [
    "        ORG $BEC00",
    "WORK    EQU $BED00      ; not here: start",
    "size = 4",
    "        INCLUDE \"sub/lib.inc\"",
    "start:  MV X,msg+size",
    "        MV A,[WORK+1]",
    "        CALL Helper     ; start",
    "        MV [$BED00],A",
    "        DB \"start\",size",
    "        JRNZ START",
    ".loop:  JR .loop",
    "msg:    DB \"it's; start\"",
    "        MV A,(BP+WORK2)",
    "WORK2   .EQU 5"
  ].join("\r\n"),
  "sub/lib.inc": "helper: MV A,size\r\n        RETF\r\n        INCLUDE \"main.asm\"\r\n"
};
const host: AsmHost = {
  readText: f => files[path.relative(root, f).replace(/\\/g, "/")],
  readBinary: () => undefined
};
const main = path.join(root, "main.asm");
// Where the name under the first `word` of a line of main.asm is defined, as file:line:column.
const go = (line: number, word: string, offset = 0, file = "main.asm"): string => {
  const column = files[file].split("\r\n")[line].indexOf(word) + offset;
  const found = definitionAt(path.join(root, file), line, column, { host });
  return found === undefined ? "none" : found.targets.map(t => `${path.relative(root, t.file).replace(/\\/g, "/")}:${t.line}:${t.start}`).join(" ");
};

describe("assembly definitions", () => {
  it("finds labels, constants and included files", () => {
    assert.equal(go(4, "msg"), "main.asm:11:0");
    assert.equal(go(4, "size"), "main.asm:2:0");
    assert.equal(go(5, "WORK", 2), "main.asm:1:0");
    assert.equal(go(5, "WORK", 4), "main.asm:1:0", "just after the name, where the cursor stands");
    assert.equal(go(6, "Helper"), "sub/lib.inc:0:0", "in an included file, in any case");
    assert.equal(go(9, "START"), "main.asm:4:0");
    assert.equal(go(10, "JR .loop", 4), "main.asm:10:0");
    assert.equal(go(12, "WORK2"), "main.asm:13:0", "defined further down");
    assert.equal(go(3, "lib"), "sub/lib.inc:0:0");
    assert.equal(go(4, "start"), "main.asm:4:0", "on the definition itself");
    const names = definitions(main, { host });
    const what = (name: string): unknown[] => { const d = names.get(name)![0]; return [d.name, d.value, d.comment]; };
    assert.deepEqual(what("WORK"), ["WORK", "$BED00", "not here: start"]);
    assert.deepEqual(what("SIZE"), ["size", "4", undefined]);
    assert.deepEqual(what("HELPER"), ["helper", undefined, undefined]);
  });
  it("leaves comments, strings, numbers and instructions alone", () => {
    assert.equal(go(1, "start"), "none");
    assert.equal(go(6, "start"), "none");
    assert.equal(go(8, "start"), "none");
    assert.equal(go(11, "start"), "none");
    assert.equal(go(7, "BED00"), "none");
    assert.equal(go(9, "JRNZ"), "", "a name, but not one that is defined");
    assert.equal(nameAt("        MV A,0BED0h", 15), undefined);
    assert.equal(nameAt("        MV X,&HBED00", 16), undefined);
  });
  it("sees the same names from an included file through the one that includes it", () => {
    assert.equal(go(0, "size", 0, "sub/lib.inc"), "", "the file itself does not define it");
    const seen = new Set<string>();
    const names = definitions(main, { host }, new Map(), seen);
    assert.equal(names.get("SIZE")?.length, 1, "a recursive INCLUDE is read once");
    assert.ok(seen.has(path.join(root, "sub", "lib.inc").toLowerCase()));
  });
  it("knows every label and constant the assembler does in the examples", () => {
    const { assemble } = require("../asm/assembler") as typeof import("../asm/assembler.js");
    const fs = require("node:fs") as typeof import("node:fs");
    const real: AsmHost = { readText: f => { try { return fs.readFileSync(f, "utf8"); } catch { return undefined; } }, readBinary: f => { try { return fs.readFileSync(f); } catch { return undefined; } } };
    const examples = path.resolve(__dirname, "..", "..", "examples");
    for (const name of ["hello.asm", "sample.asm"]) {
      const file = path.join(examples, name);
      const symbols = [...assemble(fs.readFileSync(file, "utf8"), { filePath: file, host: real }).symbols.keys()].sort();
      assert.deepEqual([...definitions(file, { host: real }).keys()].sort(), symbols, name);
    }
  });
});
