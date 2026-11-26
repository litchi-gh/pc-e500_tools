import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { asmWordAt, OPERATIONS, REGISTERS } from "../asm/hover";
import { INSTRUCTIONS } from "../asm/instructions";

const at = (line: string, column: number): string => {
  const w = asmWordAt(line, column);
  return w ? `${w.kind} ${w.name}` : "none";
};

describe("assembly hover", () => {
  it("tells instructions, directives, registers and names apart", () => {
    const line = "start:  MV    A,[table]      ; MV here";
    assert.equal(at(line, 2), "name start");
    assert.equal(at(line, 8), "instruction MV");
    assert.equal(at(line, 14), "register A");
    assert.equal(at(line, 19), "name table");
    assert.equal(at(line, 32), "none");
    assert.equal(at("        mv    a,5", 9), "instruction MV");
    assert.equal(at("        .ORG  $BEC00", 10), "directive ORG");
    assert.equal(at("WORK    EQU   $20", 1), "name WORK");
    assert.equal(at("WORK    EQU   $20", 9), "directive EQU");
    assert.equal(at("S:      RC", 0), "name S");
    assert.equal(at("IR      EQU   5", 1), "name IR");
    assert.equal(at("        MV    (BP+1),A", 15), "register BP");
    assert.equal(at("        JP    loop", 15), "name loop");
    assert.equal(at("        DB    \"MV A\"", 16), "none");
    assert.equal(at("        MV    A,$BA", 17), "none");
  });
  it("describes only what there is", () => {
    for (const name of Object.keys(OPERATIONS)) assert.ok(name in INSTRUCTIONS, name);
    for (const r of Object.values(REGISTERS)) assert.ok(r.ja && r.en);
  });
});
