import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as path from "node:path";
import { AsmHost, assemble, lintAsm } from "../asm/assembler";

function hex(bytes: Uint8Array): string {
  return [...bytes].map(b => b.toString(16).toUpperCase().padStart(2, "0")).join("");
}

function golden(source: string, expected: string): void {
  const result = assemble(source);
  assert.deepEqual(result.issues, [], `${source}: unexpected diagnostics ${JSON.stringify(result.issues)}`);
  assert.equal(hex(result.binary), expected.replace(/ /g, "").toUpperCase(), source);
}

function reject(source: string, code: string, fragment?: string): void {
  const issues = lintAsm(source);
  assert.ok(issues.length > 0, `expected rejection: ${source}`);
  assert.ok(issues.some(i => i.code === code && (fragment === undefined || i.message.includes(fragment))), `${source}: got ${JSON.stringify(issues)}`);
}

// Golden vectors mirror Assembler/tests/E500Assembler.Tests/Program.cs (Sharp ESR-L Instruction Manual pp. 74-88).
describe("SC62015 encoder", () => {
  it("encodes fixed opcodes", () => {
    for (const [m, code] of [["NOP", "00"], ["RETI", "01"], ["RET", "06"], ["RETF", "07"], ["SC", "97"], ["RC", "9F"], ["TCL", "CE"], ["HALT", "DE"], ["OFF", "DF"], ["WAIT", "EF"], ["INT", "FE"], ["IR", "FE"], ["RESET", "FF"], ["SWAP A", "EE"], ["PUSHS F", "4F"], ["POPS F", "5F"]]) golden(m, code);
  });

  it("encodes register transfers for every register", () => {
    const regs = ["A", "IL", "BA", "I", "X", "Y", "U", "S"];
    const h = (n: number): string => n.toString(16).toUpperCase().padStart(2, "0");
    for (let r = 0; r < 8; r += 1) {
      const value = r < 2 ? "$12" : r < 4 ? "$1234" : "$ABCDE";
      const immediate = r < 2 ? "12" : r < 4 ? "3412" : "DEBC0A";
      golden(`MV ${regs[r]},${value}`, `${h(8 + r)}${immediate}`);
      golden(`MV ${regs[r]},($23)`, `30${h(0x80 + r)}23`);
      golden(`MV ($23),${regs[r]}`, `30${h(0xa0 + r)}23`);
      golden(`MV ${regs[r]},[$ABCDE]`, `${h(0x88 + r)}DEBC0A`);
      golden(`MV [$ABCDE],${regs[r]}`, `${h(0xa8 + r)}DEBC0A`);
      golden(`INC ${regs[r]}`, `6C${h(r)}`);
      golden(`DEC ${regs[r]}`, `7C${h(r)}`);
      if (r < 7) {
        golden(`MV ${regs[r]},[X]`, `${h(0x90 + r)}04`);
        golden(`MV [Y++],${regs[r]}`, `${h(0xb0 + r)}25`);
        golden(`MV ${regs[r]},[--U]`, `${h(0x90 + r)}36`);
        golden(`MV ${regs[r]},[S+$42]`, `${h(0x90 + r)}8742`);
        golden(`MV [X-$42],${regs[r]}`, `${h(0xb0 + r)}C442`);
        golden(`MV ${regs[r]},[($23)]`, `30${h(0x98 + r)}0023`);
        golden(`MV [($23)-5],${regs[r]}`, `30${h(0xb8 + r)}C02305`);
      }
      const stackReg = r < 6 ? regs[r] : r === 6 ? "F" : "IMR";
      golden(`PUSHU ${stackReg}`, h(0x28 + r));
      golden(`POPU ${stackReg}`, h(0x38 + r));
    }
  });

  it("encodes the remaining instruction forms", () => {
    const cases: Array<[string, string]> = [
      ["MV A,B", "74"], ["MV B,A", "75"], ["MV X,Y", "FD45"], ["MV BA,X", "FD24"],
      ["JP $1234", "023412"], ["JPF $ABCDE", "03DEBC0A"], ["CALL $1234", "043412"], ["CALLF $ABCDE", "05DEBC0A"],
      ["JP ($20)", "301020"], ["JP U", "1106"], ["JPZ $1234", "143412"], ["JPNZ $1234", "153412"], ["JPC $1234", "163412"], ["JPNC $1234", "173412"],
      ["JR +255", "12FF"], ["JR -255", "13FF"], ["JRZ +3", "1803"], ["JRZ -3", "1903"], ["JRNZ +3", "1A03"], ["JRNZ -3", "1B03"], ["JRC +3", "1C03"], ["JRC -3", "1D03"], ["JRNC +3", "1E03"], ["JRNC -3", "1F03"],
      ["ADD BA,A", "4420"], ["ADD X,I", "4543"], ["ADD A,IL", "4601"], ["SUB I,BA", "4C32"], ["SUB S,X", "4D74"], ["SUB IL,A", "4E10"],
      ["PMDF ($23),$45", "30472345"], ["PMDF ($23),A", "305723"],
      ["INC ($23)", "306D23"], ["DEC ($23)", "307D23"],
      ["MV ($23),$45", "30CC2345"], ["MVW ($23),$1234", "30CD233412"], ["MVP ($23),$ABCDEF", "30DC23EFCDAB"],
      ["EX A,B", "DD"], ["EX BA,I", "ED23"], ["EX X,S", "ED47"],
      ["CMPW ($23),BA", "30D60223"], ["CMPP ($23),X", "30D70423"],
      ["ROR A", "E4"], ["ROR ($23)", "30E523"], ["ROL A", "E6"], ["ROL ($23)", "30E723"],
      ["SHR A", "F4"], ["SHR ($23)", "30F523"], ["SHL A", "F6"], ["SHL ($23)", "30F723"], ["DSLL ($23)", "30EC23"], ["DSRL ($23)", "30FC23"],
      ["MVL ($23),[X+5]", "3056842305"], ["MVL [Y-5],($23)", "305EC52305"],
      ["MVL ($23),[X]", "3056842300"], ["MVL [Y],($23)", "305E852300"]
    ];
    for (const [src, expected] of cases) golden(src, expected);
    const h = (n: number): string => n.toString(16).toUpperCase().padStart(2, "0");
    for (const [m, op] of [["ADD", 0x40], ["SUB", 0x48], ["ADC", 0x50], ["SBC", 0x58]] as Array<[string, number]>) {
      golden(`${m} A,$45`, `${h(op)}45`); golden(`${m} ($23),$45`, `30${h(op + 1)}2345`);
      golden(`${m} A,($23)`, `30${h(op + 2)}23`); golden(`${m} ($23),A`, `30${h(op + 3)}23`);
    }
    for (const [m, op] of [["CMP", 0x60], ["TEST", 0x64], ["XOR", 0x68], ["AND", 0x70], ["OR", 0x78]] as Array<[string, number]>) {
      golden(`${m} A,$45`, `${h(op)}45`); golden(`${m} ($23),$45`, `30${h(op + 1)}2345`);
      golden(`${m} [$ABCDE],$45`, `${h(op + 2)}DEBC0A45`); golden(`${m} ($23),A`, `30${h(op + 3)}23`);
      if (m !== "TEST") golden(`${m} ($23),($45)`, `32${h(m === "CMP" ? 0xb7 : op + 6)}2345`);
      if (["XOR", "AND", "OR"].includes(m)) golden(`${m} A,($23)`, `30${h(op + 7)}23`);
    }
    for (const [m, op] of [["EX", 0xc0], ["EXW", 0xc1], ["EXP", 0xc2], ["EXL", 0xc3], ["ADCL", 0x54], ["SBCL", 0x5c], ["DADL", 0xc4], ["DSBL", 0xd4], ["CMPW", 0xc6], ["CMPP", 0xc7], ["MVLD", 0xcf]] as Array<[string, number]>) {
      golden(`${m} ($23),($45)`, `32${h(op)}2345`);
      if (["ADCL", "SBCL", "DADL", "DSBL"].includes(m)) golden(`${m} ($23),A`, `30${h(op + 1)}23`);
    }
    for (let w = 0; w < 4; w += 1) {
      const m = ["MV", "MVW", "MVP", "MVL"][w];
      golden(`${m} ($23),($45)`, `32${h(0xc8 + w)}2345`);
      golden(`${m} ($23),[$ABCDE]`, `30${h(0xd0 + w)}23DEBC0A`);
      golden(`${m} [$ABCDE],($23)`, `30${h(0xd8 + w)}DEBC0A23`);
      golden(`${m} ($23),[X++]`, `30${h(0xe0 + w)}2423`);
      golden(`${m} [--Y],($23)`, `30${h(0xe8 + w)}3523`);
      golden(`${m} ($23),[($45)+6]`, `32${h(0xf0 + w)}80234506`);
      golden(`${m} [($23)-6],($45)`, `32${h(0xf8 + w)}C0234506`);
    }
  });

  it("generates every PRE byte for internal RAM addressing pairs", () => {
    const dest = ["($12)", "(BP+$12)", "(PX+$12)", "(BP+PX)"];
    const src = ["($34)", "(BP+$34)", "(PY+$34)", "(BP+PY)"];
    const prefixes = [["32", "30", "33", "31"], ["22", "", "23", "21"], ["36", "34", "37", "35"], ["26", "24", "27", "25"]];
    for (let d = 0; d < 4; d += 1) for (let s = 0; s < 4; s += 1) golden(`MV ${dest[d]},${src[s]}`, `${prefixes[d][s]}C8${d === 3 ? "00" : "12"}${s === 3 ? "00" : "34"}`);
    golden("MV A,(BP-1)", "80FF");
    golden("MV A,(PX+2)", "348002");
  });
});

describe("SC62015 assembler", () => {
  it("assembles programs with labels, EQU, directives and expressions", () => {
    golden("ORG $B8000\nstart: MV A,0\nMV IL,10\nloop: ADD A,IL\nDEC IL\nJRNZ loop\nRET", "0800090A46017C011B0606");
    golden("ORG $B8000\nJR next\nDB 1,2\nnext: CALL done\nRET\ndone: RET", "120201020408800606");
    golden("ORG $BFFFC\nJR $B0001", "1203");
    golden("ORG $B0000\nJR $BFFFD", "1305");
    golden("size EQU finish-start\nORG $B8000\nstart: DB size\nDW finish & $FFFF\nfinish:", "030380");
    golden("a1 EQU a2+1\na2 EQU a3+1\na3 EQU 1\nDB a1", "03");
    golden("DB 1+2*3,(1+2)*3, 0b1010, 0FFh, &12, $34, 0x56, LOW($1234), HIGH($1234), BANK($ABCDE), 'A'", "07090AFF12345634120A41");
    golden("DB \"a;b,c\\n\\x41\",0 ; comment", "613B622C630A4100");
    golden("DW -1,$1234\nDP $123456\nMV X,-1", "FFFF34125634120CFFFF0F");
    golden("ORG 3\nDB 1\nALIGN 8,$EE\nDS 2,$AA\nORG 12\nDB 2", "01EEEEEEEEAAAA000002");
    golden(".org 4\n.DB LOW($), HIGH($)\nend\nunsupported", "0400");
    golden("PRE $32\nMV (BP+1),(BP+2)", "32C80102");
    golden("COUNT = 10\n  mv a,count\n\tret", "080A06");
  });

  it("accepts the repository samples", () => {
    const hello = [
      "        ORG  $BEC00",
      "IOCS    EQU  $FFFE8",
      "CL      EQU  $D6",
      "start:  MV   (CL),0",
      "        MV   IL,$42",
      "        MV   X,msg",
      "        MV   Y,msg_end-msg",
      "        CALLF IOCS",
      "        RETF",
      "msg:    DB   \"HELLO, PC-E650!\"",
      "msg_end:",
      "        END"
    ].join("\n");
    const result = assemble(hello);
    assert.deepEqual(result.issues, []);
    assert.equal(result.origin, 0xbec00);
    assert.equal(result.symbols.get("MSG_END")! - result.symbols.get("MSG")!, 15n);
  });

  it("reports what e500asm rejects", () => {
    const cases: Array<[string, string, string?]> = [
      ["MV A,256", "ASM040", "8 ビット"], ["MV BA,65536", "ASM040", "16 ビット"], ["MV X,$100000", "ASM040", "20 ビット"],
      ["MV A,missing", "ASM031", "missing"], ["bad: NOP\nbad: RET", "ASM030", "bad"], ["DB (1+2", "ASM010"],
      ["JR +256", "ASM041"], ["JR -256", "ASM041"], ["ORG $B0000\nJP $C0000", "ASM041"], ["ORG $B0000\nJR $C0000", "ASM041"],
      ["MV A,[BA]", "ASM020", "X, Y, U, S"], ["JP A", "ASM020"], ["MV S,[X]", "ASM020"], ["MV [X],S", "ASM020"], ["PUSHU U", "ASM020"],
      ["PUSHS A", "ASM020"], ["ADD A,X", "ASM020"], ["ADC A,IL", "ASM020"], ["CMP A,($20)", "ASM020"],
      ["MV A,IL", "ASM020"], ["MV IL,A", "ASM020"], ["MV X,A", "ASM020"], ["EX A,IL", "ASM020"],
      ["MV A,(PY+1)", "ASM020", "PX"], ["MV ($20),(PX+1)", "ASM020", "PY"], ["MV A,[X++ +2]", "ASM020"],
      ["ORG $BFFFF\nMV A,1", "ASM041"], ["ORG $FFFFF\nDW 1", "ASM050"],
      ["ORG 10\nDB 1\nORG 10\nDB 2", "ASM050"], ["DB 256", "ASM040"], ["ALIGN 0", "ASM040"],
      ["DS -1", "ASM040"], ["DB 1/0", "ASM040"], ["DB \"あ\"", "ASM040"], ["NOP 1", "ASM021"],
      ["PRE $20", "ASM040"], ["DB 1,", "ASM010"], ["ASSERT 0", "ASM070"], ["a1 EQU a1\nDB a1", "ASM032"],
      ["a1 EQU a2\na2 EQU a1\nDB a1", "ASM032"], ["a1 EQU a1+1", "ASM001"], ["a1 EQU missing\nDB a1", "ASM031"],
      ["DB \"bad", "ASM010"], ["DB '\\q'", "ASM010"], ["MV A,,1", "ASM010"], ["MV A,()", "ASM010"],
      ["EQU 2", "ASM032"], ["DB 1 << 64", "ASM040"], ["DB 999999999999999999999999", "ASM010"],
      ["FOO A,1", "ASM020", "FOO"], ["start\nRET", "ASM020", "':'"], ["MV A,0BEC00h", "ASM010", "$BEC00"]
    ];
    for (const [src, code, fragment] of cases) reject(src, code, fragment);
  });

  it("reports several independent problems in one document", () => {
    const issues = lintAsm("MV A,missing\nRET\nFOO\nJR +999");
    assert.deepEqual(issues.map(i => [i.range.line, i.code]), [[0, "ASM031"], [2, "ASM020"], [3, "ASM041"]]);
    assert.deepEqual(issues[0].range, { line: 0, start: 5, end: 12 });
  });

  it("resolves INCLUDE and INCBIN through the host", () => {
    const files = new Map<string, string>([[path.resolve("/proj/consts.inc"), "IOCS EQU $FFFE8\n"], [path.resolve("/proj/lib/data.bin"), "\x01\x02\x03"]]);
    const host: AsmHost = {
      readText: p => files.get(path.resolve(p)),
      readBinary: p => { const t = files.get(path.resolve(p)); return t === undefined ? undefined : Uint8Array.from([...t].map(c => c.charCodeAt(0))); }
    };
    const options = { filePath: path.resolve("/proj/main.asm"), host, includeDirectories: [path.resolve("/proj/lib")] };
    const ok = assemble("INCLUDE \"consts.inc\"\nCALLF IOCS\nINCBIN \"data.bin\",1", options);
    assert.deepEqual(ok.issues, []);
    assert.equal(hex(ok.binary), "05E8FF0F0203");
    const missing = lintAsm("INCLUDE \"nothere.inc\"\nRET", options);
    assert.equal(missing[0].code, "ASM060");
    assert.equal(lintAsm("INCLUDE \"x.inc\"")[0].severity, "warning");
  });
});
