// The instructions and directives for the completion list: what they do, the forms they
// take and the flags they change (docs/analysis/02_CPU.md §2.4, §2.14; Assembler/README.md).
// Every form here is put through the encoder by the tests.
import { L } from "../l10n";

export interface InstructionInfo {
  /**
   * Operand forms; "" takes none. A/B: either. r: any register, q: any but S, w: BA I X Y
   * U S, r2: BA I, r3: X Y U S, v: A IL BA I. n: a byte, mn, lmn: 2 and 3 bytes,
   * imm: a value of the register's width, (m) (n): internal RAM, [lmn]: memory,
   * [p]: [r3] [r3++] [--r3] [r3+n] [r3-n] [(n)] [(n)+n] [(n)-n].
   */
  readonly forms: readonly string[];
  readonly ja: string;
  readonly en: string;
  /** Flags changed: "C Z", "Z", "" ... */
  readonly flags: string;
}

const info = (forms: string, flags: string, ja: string, en: string): InstructionInfo => ({ forms: forms === "" ? [""] : forms.split(" | "), flags, ja, en });

const ARITHMETIC = "A,n | (m),n | A,(n) | (n),A";
const LOGIC = "A,n | (m),n | [lmn],n | (n),A | (m),(n) | A,(n)";
const BLOCK = "(m),(n)";

export const INSTRUCTIONS: Readonly<Record<string, InstructionInfo>> = {
  MV: info("r,imm | A,B | B,A | w,w | r,(n) | (n),r | r,[lmn] | [lmn],r | q,[p] | [p],q | (m),n | (m),(n) | (n),[lmn] | [lmn],(n) | (n),[p] | [p],(n)", "", "転送。MV IL,n は IH を 0 にする。A と IL の間の転送はない", "Move. MV IL,n clears IH. There is none between A and IL"),
  MVW: info("(m),mn | (m),(n) | (n),[lmn] | [lmn],(n) | (n),[p] | [p],(n)", "", "2 バイトの転送", "Move 2 bytes"),
  MVP: info("(m),lmn | (m),(n) | (n),[lmn] | [lmn],(n) | (n),[p] | [p],(n)", "", "3 バイトの転送", "Move 3 bytes"),
  MVL: info("(m),(n) | (n),[lmn] | [lmn],(n) | (n),[p] | [p],(n)", "", "I バイトの転送（アドレスを増やしながら）。実行後 I = 0", "Move I bytes, addresses going up. I = 0 after"),
  MVLD: info(BLOCK, "", "I バイトの転送（アドレスを減らしながら）。実行後 I = 0", "Move I bytes, addresses going down. I = 0 after"),
  EX: info("A,B | w,w | (m),(n)", "", "交換", "Exchange"),
  EXW: info(BLOCK, "", "2 バイトの交換", "Exchange 2 bytes"),
  EXP: info(BLOCK, "", "3 バイトの交換", "Exchange 3 bytes"),
  EXL: info(BLOCK, "", "I バイトの交換。実行後 I = 0", "Exchange I bytes. I = 0 after"),
  SWAP: info("A", "Z", "A の上位 4 ビットと下位 4 ビットの交換", "Exchange the halves of A"),
  ADD: info(`${ARITHMETIC} | A/IL,A/IL | r2,v | r3,r`, "C Z", "加算", "Add"),
  SUB: info(`${ARITHMETIC} | A/IL,A/IL | r2,v | r3,r`, "C Z", "減算", "Subtract"),
  ADC: info(ARITHMETIC, "C Z", "キャリー付き加算", "Add with carry"),
  SBC: info(ARITHMETIC, "C Z", "キャリー付き減算", "Subtract with carry"),
  ADCL: info("(m),(n) | (n),A", "C Z", "I バイトの 2 進加算（アドレスを増やしながら）。実行後 I = 0", "Add I bytes in binary, addresses going up. I = 0 after"),
  SBCL: info("(m),(n) | (n),A", "C Z", "I バイトの 2 進減算（アドレスを増やしながら）。実行後 I = 0", "Subtract I bytes in binary, addresses going up. I = 0 after"),
  DADL: info("(m),(n) | (n),A", "C Z", "I バイトの BCD 加算（アドレスを減らしながら）。実行後 I = 0", "Add I bytes of BCD, addresses going down. I = 0 after"),
  DSBL: info("(m),(n) | (n),A", "C Z", "I バイトの BCD 減算（アドレスを減らしながら）。実行後 I = 0", "Subtract I bytes of BCD, addresses going down. I = 0 after"),
  INC: info("r | (n)", "Z", "1 を足す（C は変わらない）", "Add 1 (C is kept)"),
  DEC: info("r | (n)", "Z", "1 を引く（C は変わらない）", "Subtract 1 (C is kept)"),
  PMDF: info("(m),n | (n),A", "", "ポインタ修正：フラグを変えずに足す", "Modify a pointer: add, flags kept"),
  AND: info(LOGIC, "Z", "論理積", "And"),
  OR: info(LOGIC, "Z", "論理和", "Or"),
  XOR: info(LOGIC, "Z", "排他的論理和", "Exclusive or"),
  TEST: info("A,n | (m),n | [lmn],n | (n),A", "Z", "ビットテスト：論理積の結果で Z だけ変える", "Test bits: And, changing only Z"),
  CMP: info("A,n | (m),n | [lmn],n | (n),A | (m),(n)", "C Z", "比較。C = 小さい、Z = 等しい", "Compare. C = less, Z = equal"),
  CMPW: info("(m),(n) | (m),r2", "C Z", "2 バイトの比較", "Compare 2 bytes"),
  CMPP: info("(m),(n) | (m),r3", "C Z", "3 バイトの比較", "Compare 3 bytes"),
  SC: info("", "C", "C ← 1", "C ← 1"),
  RC: info("", "C", "C ← 0", "C ← 0"),
  ROR: info("A | (n)", "C Z", "右回転（8 ビット）", "Rotate right (8 bits)"),
  ROL: info("A | (n)", "C Z", "左回転（8 ビット）", "Rotate left (8 bits)"),
  SHR: info("A | (n)", "C Z", "C を含む 9 ビットの右回転", "Rotate right through C (9 bits)"),
  SHL: info("A | (n)", "C Z", "C を含む 9 ビットの左回転", "Rotate left through C (9 bits)"),
  DSRL: info("(n)", "Z", "I バイトを 4 ビット右へ（アドレスを増やしながら）。実行後 I = 0", "Shift I bytes right by 4 bits, addresses going up. I = 0 after"),
  DSLL: info("(n)", "Z", "I バイトを 4 ビット左へ（アドレスを減らしながら）。実行後 I = 0", "Shift I bytes left by 4 bits, addresses going down. I = 0 after"),
  PUSHU: info("A/IL/BA/I/X/Y/F/IMR", "", "U スタックに積む。PUSHU IMR は割り込みも禁止する", "Push on the U stack. PUSHU IMR also disables interrupts"),
  POPU: info("A/IL/BA/I/X/Y/F/IMR", "", "U スタックから取り出す。POPU F はフラグを戻す", "Pop from the U stack. POPU F restores the flags"),
  PUSHS: info("F", "", "S スタックにフラグを積む", "Push the flags on the S stack"),
  POPS: info("F", "C Z", "S スタックからフラグを戻す", "Pop the flags from the S stack"),
  JP: info("label | (n) | r3", "", "ジャンプ（label は同じ 64KB の中。(n) と r3 はどこへでも）", "Jump (label within the 64KB; (n) and r3 anywhere)"),
  JPZ: info("label", "", "Z = 1 ならジャンプ", "Jump if Z = 1"),
  JPNZ: info("label", "", "Z = 0 ならジャンプ", "Jump if Z = 0"),
  JPC: info("label", "", "C = 1 ならジャンプ", "Jump if C = 1"),
  JPNC: info("label", "", "C = 0 ならジャンプ", "Jump if C = 0"),
  JPF: info("lmn", "", "どこへでもジャンプ", "Jump anywhere"),
  JR: info("label", "", "相対ジャンプ（前後 255 バイト）", "Relative jump (255 bytes either way)"),
  JRZ: info("label", "", "Z = 1 なら相対ジャンプ", "Relative jump if Z = 1"),
  JRNZ: info("label", "", "Z = 0 なら相対ジャンプ", "Relative jump if Z = 0"),
  JRC: info("label", "", "C = 1 なら相対ジャンプ", "Relative jump if C = 1"),
  JRNC: info("label", "", "C = 0 なら相対ジャンプ", "Relative jump if C = 0"),
  CALL: info("label", "", "呼び出し（同じ 64KB の中）。RET で戻る", "Call within the 64KB; returns with RET"),
  CALLF: info("lmn", "", "どこでも呼び出し。RETF で戻る", "Call anywhere; returns with RETF"),
  RET: info("", "", "CALL から戻る", "Return from CALL"),
  RETF: info("", "", "CALLF から戻る。BASIC の CALL からもこれで戻る", "Return from CALLF, and from BASIC's CALL"),
  RETI: info("", "C Z", "割り込みから戻る", "Return from an interrupt"),
  NOP: info("", "", "何もしない", "No operation"),
  WAIT: info("", "", "I を 0 まで減らしながら待つ", "Wait, counting I down to 0"),
  HALT: info("", "", "割り込みまで CPU を止める", "Stop the CPU until an interrupt"),
  OFF: info("", "", "電源を切る", "Power off"),
  TCL: info("", "", "タイマをクリアする", "Clear the timers"),
  IR: info("", "", "ソフトウェア割り込み", "Software interrupt"),
  INT: info("", "", "ソフトウェア割り込み（IR と同じ）", "Software interrupt (the same as IR)"),
  RESET: info("", "", "リセットベクタへ", "Go to the reset vector"),
  PRE: info("n", "", "PRE バイトを直接置く（ふつうは自動で付く）", "Put a PRE byte (normally added by itself)")
};

export const DIRECTIVE_INFO: Readonly<Record<string, { readonly form: string; readonly ja: string; readonly en: string }>> = {
  ORG: { form: "ORG $BEC00", ja: "配置するアドレス", en: "The address to assemble at" },
  EQU: { form: "name EQU 10", ja: "定数の定義", en: "Define a constant" },
  DB: { form: "DB 1,$FF,\"text\"", ja: "1 バイトのデータ", en: "Bytes" },
  DEFB: { form: "DEFB 1,$FF,\"text\"", ja: "1 バイトのデータ（DB と同じ）", en: "Bytes (the same as DB)" },
  BYTE: { form: "BYTE 1,$FF,\"text\"", ja: "1 バイトのデータ（DB と同じ）", en: "Bytes (the same as DB)" },
  DW: { form: "DW $1234", ja: "2 バイトのデータ（下位が先）", en: "2-byte values, low byte first" },
  DEFW: { form: "DEFW $1234", ja: "2 バイトのデータ（DW と同じ）", en: "2-byte values (the same as DW)" },
  WORD: { form: "WORD $1234", ja: "2 バイトのデータ（DW と同じ）", en: "2-byte values (the same as DW)" },
  DP: { form: "DP $BEC00", ja: "3 バイトのデータ（アドレスなど、下位が先）", en: "3-byte values such as addresses, low byte first" },
  DS: { form: "DS 16,0", ja: "領域を取る（長さ, 埋め値）", en: "Reserve bytes (length, fill)" },
  DEFS: { form: "DEFS 16,0", ja: "領域を取る（DS と同じ）", en: "Reserve bytes (the same as DS)" },
  SPACE: { form: "SPACE 16,0", ja: "領域を取る（DS と同じ）", en: "Reserve bytes (the same as DS)" },
  ALIGN: { form: "ALIGN 16,0", ja: "アドレスを倍数までそろえる（境界, 埋め値）", en: "Align the address (boundary, fill)" },
  INCLUDE: { form: "INCLUDE \"file.inc\"", ja: "ほかのソースを読み込む", en: "Insert another source" },
  INCBIN: { form: "INCBIN \"file.bin\"", ja: "バイナリを読み込む", en: "Insert a binary file" },
  ASSERT: { form: "ASSERT 1+((256-size)>>63)", ja: "式が 0 ならエラー（例は size が 256 を超えたらエラー）", en: "An error when the expression is 0 (the example: when size is over 256)" },
  END: { form: "END", ja: "ソースの終わり", en: "End of the source" }
};

/** The forms as they are written: "MV r,(n)". */
export function formLines(mnemonic: string): string[] {
  return INSTRUCTIONS[mnemonic].forms.map(f => (f ? `${mnemonic} ${f}` : mnemonic));
}

/** What the letters in the forms stand for, for those used. */
export function legend(mnemonic: string): string {
  const all = INSTRUCTIONS[mnemonic].forms.join(" ");
  const parts: string[] = [];
  const has = (re: RegExp): boolean => re.test(all);
  if (has(/\br\b/)) parts.push("r = A IL BA I X Y U S");
  if (has(/\bq\b/)) parts.push("q = A IL BA I X Y U");
  if (has(/\bw\b/)) parts.push("w = BA I X Y U S");
  if (has(/\bv\b/)) parts.push("v = A IL BA I");
  if (has(/\br2\b/)) parts.push("r2 = BA I");
  if (has(/\br3\b|\[p\]/)) parts.push("r3 = X Y U S");
  if (has(/\([mn]\)|\[p\]/)) parts.push(L("(m) (n) = 内部 RAM", "(m) (n) = internal RAM"));
  if (has(/\[lmn\]/)) parts.push(L("[lmn] = メモリのアドレス", "[lmn] = memory address"));
  if (has(/\[p\]/)) parts.push("[p] = [r3] [r3++] [--r3] [r3±n] [(n)] [(n)±n]");
  return parts.join("  \n");
}
