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

  // Each of these runs on the machine (ROM 7.2).
  it("takes what the machine takes", () => {
    for (const source of [
      "10FORI=1TO3:PRINTI:NEXTI", "10 FOR I=1TO 3:PRINT I:NEXT I", "10 ON 2GOTO 20,30\n20 END\n30 END", "10 DIM A(5),B(5)\n20 A(B(1)+1)=3\n30 B$(1,A(0)+1)=\"Q\"\n40 B(VAL(\")3\"))=1",
      "10 A=1:GOTO30\n30 DIMA(3):READA,B$:BEEP1,10,10:WAIT0", "10 P.\"HI\":D!=123", "10 REMARK \"((\"\n20 REM\"UNCLOSED\n30 REM---- TEST ----", "10 GOTO \"AB\"\n20 END\n30 \"AB\":PRINT \"YES\"\n40 \"CD\"PRINT 1",
      "10 ON ERROR GOTO 0", "10 DATA IT\"S", "10 PRINT 1\r20 PRINT 2\n\u001a", "10 IF A=1 THEN FOR I=1 TO 3:PRINT I:NEXT I", "10 IF A=5THEN30\n30 END", "10 A=0\n20 WHILEA=0\n30 A=1\n40 WEND\n50 REPEAT:A=A+1:UNTILA=3", "10 PRINT \"OK\":DATA A(B,C", "10 REPEAT:A=A-1:UNTIL (A)=0\n20 WHILE (A)=3:A=1:WEND", "10 REPEAT:I=I+1:IF I=2 THEN UNTIL I>9\n20 UNTIL I>5", `      10 PRINT "${"A".repeat(230)}"${" ".repeat(20)}`
    ]) assert.deepEqual(lint(source, pcE500Dialect, options), [], source);
    // Doubtful, and no reason not to run it.
    for (const [source, code] of [["10 FOR I=1 TO 3\n20 IF I=2 THEN 40\n30 NEXT I:GOTO 50\n40 NEXT I\n50 END", "E500030"], ["10 A$=\"ABC", "E500010"], ["10 PRINT 1\n10 PRINT 2", "E500003"], ["10 A$=\"あ\"", "E500008"], ["10 IF A=2 THEN 999", "E500040"], ["10 IF A=2 GOTO *NO", "E500041"]]) {
      const issues = lint(source, pcE500Dialect, options);
      assert.deepEqual(issues.map(i => [i.code, i.severity]), [[code, "warning"]], source);
    }
  });

  it("refuses what LOAD does not take or would change", () => {
    for (const [source, code] of [["10 PRINT 1\n15\n20 END", "E500006"], [`10 PRINT "${"A".repeat(250)}"`, "E500007"], ["10 PRINT A×3", "E500008"], ["10 A$=\"\ufffd\"", "E500008"], ["10 INPUT \"NAME", "E500010"], ["10 PRNT 1", "E500021"], ["10 ?5", "E500020"]])
      assert.deepEqual(lint(source, pcE500Dialect, options).map(i => [i.code, i.severity]), [[code, "error"]], source);
  });

  it("does not count quotes in comments, and takes a line number with no space after it", () => {
    assert.deepEqual(lint("10 REM 5\" DISK\n20 ' SAY \"\n30PRINT \"A\"", pcE500Dialect, options), []);
    assert.deepEqual(lint("10 PRINT \"A", pcE500Dialect, options).map(i => i.code), ["E500010"]);
  });
});
