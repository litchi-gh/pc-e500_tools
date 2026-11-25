import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pcE500Dialect } from "../dialects/pcE500";
import { lint } from "../linter/parser";

const options = { requireLineNumbers: true, checkMissingTargets: true };

describe("PC-E500 linter", () => {
  it("accepts representative decoded programs", () => {
    const source = [
      "10 CLEAR",
      "20 FOR I=1 TO 10",
      "30 PRINT I",
      "40 NEXT I",
      "50 GOSUB *SUB: END",
      "100 *SUB A=A+1: RETURN"
    ].join("\n");
    assert.deepEqual(lint(source, pcE500Dialect, options), []);
  });

  it("reports lexical, structural, and reference errors", () => {
    const source = [
      "10 FOR I=1",
      "20 PRONT \"oops",
      "30 GOTO 999",
      "40 WEND"
    ].join("\n");
    const codes = lint(source, pcE500Dialect, options).map(item => item.code);
    assert.ok(codes.includes("E500010"));
    assert.ok(codes.includes("E500021"));
    assert.ok(codes.includes("E500022"));
    assert.ok(codes.includes("E500030"));
    assert.ok(codes.includes("E500031"));
    assert.ok(codes.includes("E500040"));
  });

  it("ignores colons and keywords inside strings and comments", () => {
    const source = "10 PRINT \"GOTO 999:REM\":' GOTO 888";
    assert.deepEqual(lint(source, pcE500Dialect, options), []);
  });

  it("does not treat ordinary numeric arguments or DATA as branch syntax", () => {
    const source = [
      "10 LOCATE 12,3: BEEP 2,50,100",
      "20 DATA text,(,1,2",
      "30 END"
    ].join("\n");
    assert.deepEqual(lint(source, pcE500Dialect, options), []);
  });

  it("takes the manual's PRINT# and INPUT# as well as PRINT #", () => {
    assert.deepEqual(lint("10 PRINT# 1,A\n20 INPUT# 1,B$\n30 PRINT #1,A", pcE500Dialect, options), []);
  });

  it("does not count quotes in comments, and takes a line number with no space after it", () => {
    assert.deepEqual(lint("10 REM 5\" DISK\n20 ' SAY \"\n30PRINT \"A\"", pcE500Dialect, options), []);
    assert.deepEqual(lint("10 PRINT \"A", pcE500Dialect, options).map(i => i.code), ["E500010"]);
  });
});
