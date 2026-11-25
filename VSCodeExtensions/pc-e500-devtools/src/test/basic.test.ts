import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { driveName, encodeNumber, encodeSource, encodeString, encodeValue, findVariable, formatNumber, isShown, parseProgram, parseVariables, sourceLineNumbers, usedLetters } from "../emu/basic";

const bytes = (hex: string): Uint8Array => Uint8Array.from(hex.trim().split(/\s+/).map(h => parseInt(h, 16)));

// A DATA block: 22h bytes of block header, FF 00 01 00, ten section positions, the sections.
function dataBlock(sections: Record<number, string>): Uint8Array {
  const head = 0x22 + 4 + 30 + 8;
  const parts: Uint8Array[] = [];
  const at: number[] = [];
  let pos = head;
  for (let i = 0; i < 10; i++) {
    at.push(pos);
    if (i === 2 || i === 7) continue; // the same place as the next section
    const b = sections[i] ? bytes(sections[i]) : new Uint8Array(0);
    parts.push(b); pos += b.length;
  }
  at[2] = at[3]; at[7] = at[8];
  const block = new Uint8Array(pos);
  block.set([0xff, 0, 1, 0], 0x22);
  at.forEach((p, i) => block.set([p & 255, (p >> 8) & 255, p >> 16], 0x26 + i * 3));
  let w = head;
  for (const p of parts) { block.set(p, w); w += p.length; }
  return block;
}

describe("BASIC in RAM", () => {
  it("formats numbers as BASIC keeps them (15_BASIC_INTERNALS.md §15.1.1)", () => {
    assert.equal(formatNumber(bytes("00 00 15 00 00 00 00")), "1.5");
    assert.equal(formatNumber(bytes("08 02 12 34 56 00 00")), "-123.456");
    assert.equal(formatNumber(bytes("00 63 10 00 00 00 00")), "1E+99");
    assert.equal(formatNumber(bytes("08 9D 10 00 00 00 00")), "-1E-99");
    assert.equal(formatNumber(bytes("00 00 00 00 00 00 00")), "0");
    assert.equal(formatNumber(bytes("00 09 12 34 56 78 90")), "1234567890");
    assert.equal(formatNumber(bytes("00 FF 33 33 33 33 33")), "0.3333333333");
    assert.equal(formatNumber(bytes("01 FF 33 33 33 33 33 33 33 33 33 33")), "0.33333333333333333333");
  });

  it("reads the lines of a program block", () => {
    // 10 PRINT "HI" / 20 END, as in 15_BASIC_INTERNALS.md §15.3, behind a 22h-byte block header.
    const file = bytes("FF 00 00 00 34 00 00 45 00 00 00 00 00 00 00 00 00 00 0D 00 0A 07 FE 60 22 48 49 22 0D 00 14 03 FE 5A 0D FF");
    const block = new Uint8Array(0x22 + file.length);
    block.set(file, 0x22);
    const lines = parseProgram(block, 0xbf000);
    assert.deepEqual(lines.map(l => [l.number, l.address, l.first]), [[10, 0xbf035, 0xbf038], [20, 0xbf03f, 0xbf042]]);
  });

  it("reads variables, strings and arrays (as dumped from the emulator)", () => {
    const block = dataBlock({
      // DIM P(2): P(1)=7 ; DIM S(1,2): S(0,1)=1, S(1,0)=2, S(1,2)=3
      0: "01 1D 00 00 50 01 02 00 00 00 00 00 00 00 00 00 00 70 00 00 00 00 00 00 00 00 00 00 00" +
        " 01 34 00 00 53 02 01 00 02 00" + " 00 00 00 00 00 00 00 00 00 10 00 00 00 00 00 00 00 00 00 00 00 00 00 20 00 00 00 00 00 00 00 00 00 00 00 00 00 30 00 00 00 00",
      // DIM R$(1): R$(1)="Q" (base 0, R$(1) at 0 for 1)
      3: "01 11 00 00 52 01 01 00 00 00 00 00 00 00 00 00 01",
      // A=1.5, C=-2
      4: "01 0C 00 00 41 00 00 15 00 00 00 00 01 0C 00 00 43 08 00 20 00 00 00 00",
      5: "02 0D 00 00 58 59 00 00 30 00 00 00 00",
      6: "01 11 00 00 44 01 FF 33 33 33 33 33 00 00 00 00 00",
      // B$="HI" at 1, Z$="Z" at 3
      8: "01 09 00 00 42 01 00 00 02 01 09 00 00 5A 03 00 00 01",
      9: "51 48 49 5A"
    });
    const vars = parseVariables(block);
    const by = new Map(vars.map(v => [v.name, v]));
    assert.equal(by.get("A")?.value, "1.5");
    assert.equal(by.get("A")?.fixed, true);
    assert.equal(by.get("C")?.value, "-2");
    assert.equal(by.get("XY")?.value, "3");
    assert.equal(by.get("D#")?.value, "0.3333333333");
    assert.equal(by.get("B$")?.value, "\"HI\"");
    assert.equal(by.get("Z$")?.value, "\"Z\"");
    assert.deepEqual(by.get("P()")?.elements?.map(e => e.value), ["0", "7", "0"]);
    assert.deepEqual(by.get("S()")?.elements?.map(e => `${e.index}=${e.value}`), ["(0,0)=0", "(0,1)=1", "(0,2)=0", "(1,0)=2", "(1,1)=0", "(1,2)=3"]);
    assert.deepEqual(by.get("R$()")?.elements?.map(e => e.value), ["\"\"", "\"Q\""]);
  });

  it("finds the letters a program uses as variables (lines as ROM 7.2 stored them)", () => {
    const tokens = [
      "FE 59 1E 05 51 20 57 0D", // REM Q W
      "53 3D 1D 00 00 10 00 00 00 00 3A 3A 27 1E 06 20 56 20 55 0D", // S=1:' V U
      "FE 60 22 58 20 59 22 3B 4C 3A 42 24 3D 22 5A 22 0D", // PRINT "X Y";L:B$="Z"
      "FE 5E 4B 2C 22 4A 22 2C 35 0D", // DATA K,"J",5
      // *MAIN:AB=&HEF+N#+P(1)+1.5#
      "2A 4D 41 49 4E 3A 41 42 3D 26 48 45 46 2B 4E 23 2B 50 28 1D 00 00 10 00 00 00 00 29 2B 1D 01 00 15 00 00 00 00 00 00 00 00 00 0D",
      "FE 2B 2A 1C 00 00 4D 41 49 4E 0D", // GOTO *MAIN
      "FE 5E 4B 3A 44 3D 45 0D" // DATA K:D=E
    ].map(bytes);
    const file = [...bytes("FF 00 00 00 34 00 00 00 00 00 00 00 00 00 00 00 00 00 0D")];
    tokens.forEach((t, i) => file.push(0, (i + 1) * 10, t.length, ...t));
    file.push(0xff);
    const block = new Uint8Array(0x22 + file.length);
    block.set(file, 0x22);
    const letters = usedLetters(block);
    assert.deepEqual([...letters].sort(), ["D", "E", "L", "S"]);
    // Shown: a letter the program uses even at 0, one that is not 0, and every other variable.
    assert.ok(isShown({ name: "L", kind: "number", fixed: true, value: "0" }, letters));
    assert.ok(isShown({ name: "Q", kind: "number", fixed: true, value: "5" }, letters));
    assert.ok(!isShown({ name: "Q", kind: "number", fixed: true, value: "0" }, letters));
    assert.ok(isShown({ name: "AB", kind: "number", value: "0" }, letters));
  });

  it("encodes numbers and strings as BASIC keeps them", () => {
    const hex = (b: Uint8Array): string => [...b].map(x => x.toString(16).toUpperCase().padStart(2, "0")).join(" ");
    // The values of 15_BASIC_INTERNALS.md §15.1.1 and zeros as the emulator has them.
    for (const [typed, want] of [["1.5", "00 00 15 00 00 00 00"], ["-123.456", "08 02 12 34 56 00 00"], ["1E99", "00 63 10 00 00 00 00"], ["-1E-99", "08 9D 10 00 00 00 00"],
      ["0", "00 00 00 00 00 00 00"], ["-0.0", "00 00 00 00 00 00 00"], ["1234567890", "00 09 12 34 56 78 90"], [".3333333333", "00 FF 33 33 33 33 33"], ["&HFF", "00 02 25 50 00 00 00"],
      ["99999999995", "00 0B 10 00 00 00 00"], ["007", "00 00 70 00 00 00 00"]]) assert.equal(hex(encodeNumber(typed, false)), want, typed);
    assert.equal(hex(encodeNumber("1.5#", true)), "01 00 15 00 00 00 00 00 00 00 00 00");
    assert.equal(hex(encodeNumber("-2", true)), "09 00 20 00 00 00 00 00 00 00 00 00");
    assert.equal(hex(encodeNumber("0", true)), "01 00 00 00 00 00 00 00 00 00 00 00");
    for (const bad of ["", ".", "abc", "1E100", "1E-100", "1 2", "--1"]) assert.throws(() => encodeNumber(bad, false), Error, bad);
    // What the list shows can be typed back.
    for (const shown of ["1E+99", "-1E-99", "0.3333333333", "-123.456"]) assert.equal(formatNumber(encodeNumber(shown, false)), shown);
    assert.equal(hex(encodeString("\"HI\"")), "48 49");
    assert.equal(hex(encodeString("ｱ¥ ")), "B1 5C 20");
    assert.equal(hex(encodeString("\"\\\\x0dA\"")), "0D 41");
    assert.throws(() => encodeString("漢"));
    assert.throws(() => encodeValue({ offset: 0, length: 2, type: "string" }, "ABC"), /今は 2 文字、入力は 3 文字/);
    const vars = parseVariables(dataBlock({ 3: "01 11 00 00 52 01 01 00 00 00 00 00 00 00 00 00 01", 4: "01 0C 00 00 41 00 00 15 00 00 00 00", 9: "5C" }));
    assert.equal(findVariable(vars, "a")?.place?.length, 7);
    assert.equal(findVariable(vars, "r$( 1 )")?.value, "\"¥\"");
    assert.equal(findVariable(vars, "R$(2)"), undefined);
  });

  it("prepares source text for LOAD", () => {
    const { bytes: b, unsupported } = encodeSource("﻿10 PRINT \"ｱｲ¥\"\n20 END\n\n");
    assert.equal(Buffer.from(b).toString("latin1"), "10 PRINT \"\xb1\xb2\x5c\"\r\n20 END\r\n");
    assert.equal(unsupported, "");
    assert.equal(encodeSource("10 PRINT \"漢\"").unsupported, "漢");
    const gaps = encodeSource("10 A=1\n\nREM no number\n20 B=2\n");
    assert.equal(Buffer.from(gaps.bytes).toString("latin1"), "10 A=1\r\n20 B=2\r\n");
    assert.equal(gaps.skipped, 1);
    assert.deepEqual(sourceLineNumbers("10 A=1\r\n  20 B=2\r\nREM\n"), [10, 20, undefined, undefined]);
    assert.equal(driveName("star run.bas"), "STARRUN.BAS");
    assert.equal(driveName("日本.bas"), "PROGRAM.BAS");
  });
});
