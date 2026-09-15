import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pcE500Dialect } from "../dialects";
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
});
