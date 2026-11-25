import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DIRECTIVES } from "../asm/assembler";
import { completionContext } from "../asm/completion";
import { InstructionEncoder, MNEMONICS } from "../asm/encoder";
import { evaluate } from "../asm/expression";
import { DIRECTIVE_INFO, INSTRUCTIONS, legend } from "../asm/instructions";

const at = (line: string): string => {
  const c = completionContext(line);
  return c ? `${c.kind} ${c.op ?? ""} "${c.prefix}"@${c.start} ${c.registers.join(" ")}`.trim() : "none";
};

describe("assembly completion", () => {
  it("has every instruction and directive, and no other", () => {
    assert.deepEqual(Object.keys(INSTRUCTIONS).sort(), [...MNEMONICS].sort());
    assert.deepEqual(Object.keys(DIRECTIVE_INFO).sort(), [...DIRECTIVES].sort());
    for (const name of MNEMONICS) legend(name);
  });

  it("lists only forms the assembler takes, with every register they say", () => {
    const groups: Record<string, string[]> = {
      r: ["A", "IL", "BA", "I", "X", "Y", "U", "S"], q: ["A", "IL", "BA", "I", "X", "Y", "U"], w: ["BA", "I", "X", "Y", "U", "S"], v: ["A", "IL", "BA", "I"],
      r2: ["BA", "I"], r3: ["X", "Y", "U", "S"], "[p]": ["[X]", "[Y++]", "[--U]", "[S+1]", "[X-1]", "[($20)]", "[($20)+1]", "[($20)-1]"],
      n: ["5"], imm: ["5"], mn: ["$1234"], lmn: ["$BEC00"], label: ["$BEC10"], "[lmn]": ["[$BEC00]"], "(n)": ["($20)", "(BP+1)"], "(m)": ["($21)", "(PX+1)"]
    };
    let count = 0;
    for (const [name, info] of Object.entries(INSTRUCTIONS)) {
      for (const form of info.forms) {
        let lines: string[][] = [[]];
        for (const operand of form === "" ? [] : form.split(",")) {
          const values = name === "PRE" ? ["$30"] : groups[operand] ?? operand.split("/");
          lines = lines.flatMap(l => values.map(v => [...l, v]));
        }
        for (const args of lines) {
          const pc = 0xbec00;
          // PX is only for the first internal RAM operand; that is not what is being listed.
          if (args.some((a, i) => a.startsWith("(PX") && args.slice(0, i).some(b => b.includes("(")))) continue;
          const encoder = new InstructionEncoder(e => evaluate(e, n => { throw new Error(n); }, pc), pc, true);
          assert.ok(encoder.encode(name, args).length > 0, `${name} ${args.join(",")}`);
          count++;
        }
      }
    }
    assert.ok(count > 500, String(count));
  });

  it("knows where an instruction goes", () => {
    assert.equal(at(""), "op  \"\"@0");
    assert.equal(at("        MV"), "op  \"MV\"@8");
    assert.equal(at("start:  ca"), "op  \"ca\"@8");
    assert.equal(at("start:"), "op  \"\"@6");
    assert.equal(at("WORK "), "equ  \"\"@5");
    assert.equal(at("WORK E"), "equ  \"E\"@5");
  });

  it("offers the registers that fit the operand", () => {
    assert.equal(at("        MV "), "operand MV \"\"@11 A IL BA I X Y U S B");
    assert.equal(at("        CMP "), "operand CMP \"\"@12 A");
    assert.equal(at("        CMPP ($20),"), "operand CMPP \"\"@19 X Y U S");
    assert.equal(at("        pushu i"), "operand PUSHU \"i\"@14 A IL BA I X Y F IMR");
    assert.equal(at("        MV A,["), "operand MV \"\"@14 X Y U S");
    assert.equal(at("        MV A,[--"), "operand MV \"\"@16 X Y U S");
    assert.equal(at("        MV A,(B"), "operand MV \"B\"@14 BP PX PY");
    assert.equal(at("        MV A,(BP+"), "operand MV \"\"@17 PX PY");
    assert.equal(at("        MV A,[X+co"), "operand MV \"co\"@16", "a displacement: names only");
    assert.equal(at("        JRNZ lo"), "operand JRNZ \"lo\"@13", "a branch: names only");
    assert.equal(at("        CMP A,"), "operand CMP \"\"@14", "there is no CMP A,A");
    assert.equal(at("        CMP (BP+1),"), "operand CMP \"\"@19 A");
    assert.equal(at("        MV A,"), "operand MV \"\"@13 B");
    assert.equal(at("        MV x,"), "operand MV \"\"@13 BA I X Y U S");
    assert.equal(at("        MV [X],"), "operand MV \"\"@15 A IL BA I X Y U S");
    assert.equal(at("        ADD IL,"), "operand ADD \"\"@15 A IL");
    assert.equal(at("        JP "), "operand JP \"\"@11 X Y U S");
    assert.equal(at("loop:   ADD X,"), "operand ADD \"\"@14 A IL BA I X Y U S");
    assert.equal(at("        DW ms"), "operand DW \"ms\"@11");
    assert.equal(at("SIZE EQU ms"), "operand EQU \"ms\"@9");
    assert.equal(at("SIZE = ms"), "operand EQU \"ms\"@7");
    assert.equal(at("        .DB "), "operand DB \"\"@12");
  });

  it("stays out of the way", () => {
    for (const line of ["        RET ", "        ; MV A", "        DB \"st", "        MV A,$BE", "        MV A,&HB", "        MV A,0B", "        MV A,(BP+1) ", "        MV A ", "        INCLUDE ", "        END "]) assert.equal(at(line), "none", line);
  });
});
