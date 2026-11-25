import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { basicContext, basicNames, basicWordAt, keywordsFor } from "../basic/completion";
import { BASIC_HELP, forms, keywordOf, notes, UNKNOWN } from "../basic/help";
import { pcE500Dialect } from "../dialects/pcE500";
import { setLanguage } from "../l10n";

const at = (line: string): string => {
  const c = basicContext(line);
  return c ? `${c.kind} "${c.prefix}"@${c.start}` : "none";
};

describe("BASIC completion and hover", () => {
  it("explains every keyword of the dictionary, and no other", () => {
    const all = new Set([...pcE500Dialect.statements, ...pcE500Dialect.functions]);
    for (const k of all) if (!UNKNOWN.has(k)) assert.ok(keywordOf(k), k);
    for (const k of Object.keys(BASIC_HELP)) assert.ok(all.has(k), k);
    for (const [k, h] of Object.entries(BASIC_HELP)) {
      for (const kind of h.kinds) {
        // A statement here is one for the checker, and the other way round.
        if (kind === "statement") assert.ok(pcE500Dialect.statements.has(k), `${k} statement`);
        if (kind === "function" && !["INPUT", "OPEN", "KEY", "MEM$"].includes(k)) assert.ok(pcE500Dialect.functions.has(k), `${k} function`);
      }
      assert.ok(h.forms.some(f => f.includes(k)), `${k} in its form`);
      assert.equal(h.noteJa === undefined, h.noteEn === undefined, k);
    }
  });
  it("says it all in English too", () => {
    setLanguage("en");
    try {
      for (const [k, h] of Object.entries(BASIC_HELP)) {
        const text = forms(h).join("\n") + notes(h);
        assert.doesNotMatch(text, /[　-ヿ一-鿿＀-￯]/, k);
      }
    } finally { setLanguage("ja"); }
    for (const [k, h] of Object.entries(BASIC_HELP)) assert.match(notes(h), /[぀-ヿ一-鿿]/, k);
  });
  it("knows where a statement, a value and a line to go to are typed", () => {
    assert.equal(at("10 PR"), "statement \"PR\"@3");
    assert.equal(at("10 "), "statement \"\"@3");
    assert.equal(at("10PR"), "statement \"PR\"@2");
    assert.equal(at("10 A=1:pr"), "statement \"pr\"@7");
    assert.equal(at("10 *LOOP PR"), "statement \"PR\"@9");
    assert.equal(at("10 IF A=1 THEN PR"), "statement \"PR\"@15");
    assert.equal(at("10 PRINT CH"), "value \"CH\"@9");
    assert.equal(at("10 PRINT LEFT$"), "value \"LEFT$\"@9");
    assert.equal(at("10 A=S"), "value \"S\"@5");
    assert.equal(at("10 GOTO "), "target \"\"@8");
    assert.equal(at("10 GOTO 1"), "target \"1\"@8");
    assert.equal(at("10 GOSUB *L"), "target \"*L\"@9");
    assert.equal(at("10 ON A GOTO 100,2"), "target \"2\"@17");
    assert.equal(at("10 IF A THEN 1"), "target \"1\"@13");
    assert.equal(at("10 A=B*C"), "value \"C\"@7");
    assert.equal(at("10 PRINT \"PR"), "none");
    assert.equal(at("10 PRINT \"A\":PR"), "statement \"PR\"@13");
    assert.equal(at("10 REM PR"), "none");
    assert.equal(at("10 A=1:REM PR"), "none");
    assert.equal(at("10 ' PR"), "none");
    assert.equal(at("10 DATA PR"), "none");
    assert.equal(at("10 POKE &HBE"), "none");
    assert.equal(at("10"), "none");
    assert.equal(at("10 A=12"), "none");
  });
  it("finds the lines, labels and variables", () => {
    const n = basicNames("10 *START A=1:B$=\"X Y\"\n20 DIM T(5),N$(3)*10\n30 FOR I=1 TO 10 STEP 2:T(I)=A*C:NEXT I\n40 GOTO *START\n50 REM ZZ\n60 DATA QQ,WW\n70 PRINT &HBE00;1.5E3;CHR$ 65;D#\n");
    assert.deepEqual([...n.lines.keys()], [10, 20, 30, 40, 50, 60, 70]);
    assert.deepEqual([...n.labels], [["START", 0]]);
    assert.deepEqual([...n.variables].sort(), ["A", "B$", "C", "D#", "I", "N$(", "T("]);
  });
  it("finds the word under the mouse", () => {
    const word = (line: string, column: number): string | undefined => basicWordAt(line, column)?.word;
    assert.equal(word("10 PRINT CHR$ 65", 5), "PRINT");
    assert.equal(word("10 PRINT CHR$ 65", 10), "CHR$");
    assert.equal(word("10 INPUT#1,A", 5), "INPUT#");
    assert.equal(word("10 GOTO 100", 9), "100");
    assert.equal(word("10 GOTO *LOOP", 10), "*LOOP");
    assert.equal(word("10 A=B*SIN 1", 8), "SIN");
    assert.equal(word("10 PRINT \"GOTO\"", 11), undefined);
    assert.equal(word("10 REM GOTO", 8), undefined);
    assert.equal(keywordOf("load?"), "LOAD");
    assert.equal(keywordOf("A$"), undefined);
    assert.equal(keywordOf("toString"), undefined);
  });
  it("gives statements where one starts, and the rest inside", () => {
    assert.ok(keywordsFor("statement").includes("PRINT") && !keywordsFor("statement").includes("SIN"));
    assert.ok(keywordsFor("value").includes("SIN") && keywordsFor("value").includes("TO") && !keywordsFor("value").includes("CLS"));
  });
});
