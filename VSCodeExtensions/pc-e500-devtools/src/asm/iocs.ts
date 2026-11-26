// The IOCS and FCS calls: their numbers, names and arguments (docs/analysis/11_IOCS.md
// and the Technical Reference Manual, chapter 3). inc/iocs.inc, the completion list and
// the hover are made from here.
import { L } from "../l10n";

export interface Device {
  readonly number: number;
  /** The constant, DEV_... */
  readonly constant: string;
  /** What its commands' constants start with. */
  readonly prefix: string;
  readonly ja: string;
  readonly en: string;
  readonly drives: string;
}

export interface Command {
  /** -1: a command of every device that has it. */
  readonly device: number;
  readonly number: number;
  readonly constant: string;
  readonly ja: string;
  readonly en: string;
  /** What goes in and comes back; "" when there is nothing but the device and the number. */
  readonly inJa?: string;
  readonly inEn?: string;
  readonly outJa?: string;
  readonly outEn?: string;
}

const device = (number: number, prefix: string, drives: string, ja: string, en: string): Device => ({ number, constant: "DEV_" + prefix, prefix, drives, ja, en });
export const DEVICES: readonly Device[] = [
  device(0, "SCRN", "STDO: SCRN:", "画面", "Screen"),
  device(1, "KYBD", "STDI: KYBD:", "キーボード", "Keyboard"),
  device(2, "COM", "COM:", "シリアル", "Serial port"),
  device(3, "PRN", "STDL: PRN:", "プリンタ", "Printer"),
  device(4, "CAS", "CAS:", "テープ", "Tape"),
  device(5, "RAMDISK", "E: F: G:", "RAM ディスク", "RAM disks"),
  device(6, "MEM", "S1: S2: S3:", "メモリブロック", "Memory blocks"),
  device(7, "DISK", "X: Y:", "ポケットディスク", "Pocket disk"),
  device(8, "SYSTM", "SYSTM:", "システム", "System")
];

type Text = readonly [ja: string, en: string];
const command = (dev: number, number: number, name: string, what: Text, takes?: Text, gives?: Text): Command => ({
  device: dev, number, constant: (dev < 0 ? "IO" : DEVICES[dev].prefix) + "_" + name, ja: what[0], en: what[1],
  inJa: takes?.[0], inEn: takes?.[1], outJa: gives?.[0], outEn: gives?.[1]
});
const AT: Text = ["(BL) = x 座標（0〜39）、(BH) = y 座標（0〜3）", "(BL) = x (0-39), (BH) = y (0-3)"];
const at = (ja: string, en: string): Text => [`${AT[0]}、${ja}`, `${AT[1]}, ${en}`];
const DOTS: Text = ["X = x 座標（0〜239）、Y = y 座標（0〜31）", "X = x (0-239), Y = y (0-31)"];
const dots = (ja: string, en: string): Text => [`${DOTS[0]}、${ja}`, `${DOTS[1]}, ${en}`];
const LEVEL: Text = ["A = 0: 全リセット、1: リセット、2: 電源 OFF、3: 電源 ON", "A = 0: all reset, 1: reset, 2: off, 3: on"];
const ERROR: Text = ["C=1 ならエラー（A = エラー番号）", "C=1: error (A = its number)"];
const MODE: Text = ["[DOTSOP] = 0: 点灯、1: 消灯、2: 反転", "[DOTSOP] = 0: on, 1: off, 2: invert"];
const SECTORS: Text = ["(CH) = ドライブ、X = メモリのアドレス、(BX) = 最初のセクタ、(DX) = セクタ数", "(CH) = drive, X = memory address, (BX) = first sector, (DX) = sectors"];
const SECTORS_OUT: Text = ["X = 次のアドレス、(BX) = 次のセクタ、(CX) は変わる、" + ERROR[0], "X = next address, (BX) = next sector, (CX) changes, " + ERROR[1]];
const TAPE: Text = ["X = アドレス、Y = バイト数", "X = address, Y = bytes"];
const TAPE_OUT: Text = ["X = 次のアドレス、Y = 処理したバイト数、" + ERROR[0], "X = next address, Y = bytes done, " + ERROR[1]];
const TAPE_HEADER: Text = ["X = ヘッダ（48 バイト）のアドレス", "X = the header (48 bytes)"];
const SLOT: Text = ["(CH) = スロット（0〜2）", "(CH) = slot (0-2)"];
const BLOCK: Text = [SLOT[0] + "、X = ブロック名（名前 8 文字 + . + 拡張子 3 文字）", SLOT[1] + ", X = block name (8 characters + . + 3)"];
const block = (ja: string, en: string): Text => [`${BLOCK[0]}、${ja}`, `${BLOCK[1]}, ${en}`];
const BLOCK_ERROR: Text = ["C=1 なら A = 00h: 書き込み禁止のスロット、01h: スロットがない、04h: ブロックがない、05h: 書き込み禁止のブロック、09h: 同じ名前がある、0Ch: メモリ不足", "C=1: A = 00h: slot protected, 01h: no slot, 04h: no block, 05h: block protected, 09h: name exists, 0Ch: no memory"];
const blockOut = (ja: string, en: string): Text => [`${ja}、${BLOCK_ERROR[0]}`, `${en}, ${BLOCK_ERROR[1]}`];
const KEY_OUT: Text = ["B = 1: 入力あり、0: なし。A のビット 0〜6 = 行列コード、ビット 7 = 1: 離した", "B = 1: a key, 0: none. A bits 0-6 = matrix code, bit 7 = 1: released"];

export const COMMANDS: readonly Command[] = [
  // Every device: 00h-05h are the IOCS main routine's own (they need no device)
  command(-1, 0x00, "FIND_DRIVE", ["ドライブ名から番号を調べる", "Find a drive by its name"], ["X = ドライブ名（: まで）", "X = drive name (up to its colon)"], ["(CL) = デバイス、(CH) = ドライブ、X = 名前の次、C=1 なら A = 01h: ない", "(CL) = device, (CH) = drive, X = after the name, C=1: A = 01h: none"]),
  command(-1, 0x01, "FIND_HEADER", ["デバイス番号からヘッダを調べる", "Find a header by its device number"], ["(CL) = デバイス", "(CL) = device"], ["X = ヘッダのアドレス、C=1 なら A = 01h: ない", "X = the header, C=1: A = 01h: none"]),
  command(-1, 0x02, "FIND_HEADER_FROM", ["指定のヘッダから先を調べる", "Find a header, from one on"], ["(CL) = デバイス、X = 調べ始めるヘッダ", "(CL) = device, X = the header to start at"], ["X = ヘッダのアドレス、C=1 なら A = 01h: ない", "X = the header, C=1: A = 01h: none"]),
  command(-1, 0x03, "DRIVE_NAME", ["番号からドライブ名を調べる", "Get a drive's name"], ["(CL) = デバイス、(CH) = ドライブ、X = 6 バイトの場所", "(CL) = device, (CH) = drive, X = room for 6 bytes"], ["[X] = 名前と :（残りは 20h）、X = 次のアドレス、C=1 なら A = 01h: ない", "[X] = the name and a colon (the rest 20h), X = next address, C=1: A = 01h: none"]),
  command(-1, 0x04, "FORMAT_DRIVE", ["ドライブ名を指定してフォーマット", "Format by drive name"], ["X = ドライブ名（空白で 6 文字）+ 設定の文字列", "X = drive name (6 characters with spaces) + string of settings"], ["C=1 なら A = BASIC のエラー番号", "C=1: A = BASIC error number"]),
  command(-1, 0x05, "INIT_ALL", ["すべてのデバイスの初期化", "Initialize every device"], LEVEL),
  command(-1, 0x08, "OPEN", ["開く", "Open"], ["X = ファイル名（12 バイト）、A = 1: 読む、2: 書く、3: 両方", "X = file name (12 bytes), A = 1: read, 2: write, 3: both"], ERROR),
  command(-1, 0x09, "CLOSE", ["閉じる", "Close"]),
  command(-1, 0x0a, "READ_BLOCK", ["ブロックの読み出し", "Read a block"], ["X = 読み込む先、Y = バイト数", "X = where to, Y = bytes"], ["X = 次のアドレス、Y = 読めたバイト数、" + ERROR[0], "X = next address, Y = bytes read, " + ERROR[1]]),
  command(-1, 0x0b, "WRITE_BLOCK", ["ブロックの書き込み", "Write a block"], ["X = 先頭アドレス、Y = バイト数", "X = first address, Y = bytes"], ["X = 次のアドレス、Y = 書けたバイト数、" + ERROR[0], "X = next address, Y = bytes written, " + ERROR[1]]),
  command(-1, 0x0c, "READ", ["1 バイトの読み出し", "Read a byte"], undefined, ["A = データ、" + ERROR[0], "A = the byte, " + ERROR[1]]),
  command(-1, 0x0d, "WRITE", ["1 バイトの書き込み", "Write a byte"], ["A = データ", "A = the byte"], ERROR),
  command(-1, 0x0e, "PEEK", ["1 バイトの非破壊読み出し", "Read a byte, leaving it"], undefined, ["A = データ、" + ERROR[0], "A = the byte, " + ERROR[1]]),
  command(-1, 0x3f, "FORMAT", ["フォーマット（BASIC の INIT）", "Format (BASIC's INIT)"], ["X = 設定の文字列", "X = string of settings"], ["X = 次のアドレス、C=1 なら A = BASIC のエラー番号", "X = next address, C=1: A = BASIC error number"]),
  command(-1, 0x40, "INIT", ["初期化", "Initialize"], LEVEL, ERROR),
  // Screen
  command(0, 0x41, "PUTC", ["指定位置へ 1 文字表示", "Show a character at a place"], at("A = 文字", "A = character"), ["(BL)(BH) = 次の位置、C=1: 範囲外", "(BL)(BH) = next place, C=1: out of range"]),
  command(0, 0x42, "PUTS", ["指定位置へ n 文字表示（右端で止まる）", "Show n characters at a place (stops at the right edge)"], at("X = 文字列の先頭、Y = 長さ", "X = the string, Y = its length"), ["(BL)(BH) = 次の位置、X = 次のアドレス、Y = 残り、C=1: 途中で止まった", "(BL)(BH) = next place, X = next address, Y = left over, C=1: stopped"]),
  command(0, 0x44, "CURSOR", ["カーソルの位置", "Cursor position"], AT, ["C=1: 範囲外", "C=1: out of range"]),
  command(0, 0x45, "CURSOR_TYPE", ["カーソルの形", "Cursor type"], ["A = 0: なし。ビット 5 = 表示、3 = 点滅、2〜0 = 0 下線、1 二重下線、2 ■、3 空白、4 挿入", "A = 0: none. Bit 5 = shown, 3 = blinking, 2-0 = 0 underline, 1 double underline, 2 block, 3 space, 4 insert"]),
  command(0, 0x46, "SYMBOL", ["表示シンボル", "Symbols"], ["(BL) = 0: 電池、1: DBL PRO RUN BUSY、2: 2ndF CAPS hyp カナ 小文字、3: DE G RAD E PRINT。A = 点けるビット（右端がビット 0）", "(BL) = 0: battery, 1: DBL PRO RUN BUSY, 2: 2ndF CAPS hyp kana lower case, 3: DE G RAD E PRINT. A = bits to light (the last one is bit 0)"]),
  command(0, 0x47, "SCROLL_UP", ["上へスクロール", "Scroll up"], ["(BX) = 0、A = 行数", "(BX) = 0, A = lines"]),
  command(0, 0x48, "SCROLL_DOWN", ["下へスクロール", "Scroll down"], ["(BX) = 0、A = 行数", "(BX) = 0, A = lines"]),
  command(0, 0x49, "CLEAR_LINE", ["1 行を消す", "Clear a line"], ["(BH) = 行（0〜3）", "(BH) = line (0-3)"]),
  command(0, 0x4a, "DOTS_WRITE", ["縦 8 ドットを表示", "Show 8 dots down"], dots("A = 8 ドット（ビット 0 が上）、" + MODE[0], "A = 8 dots (bit 0 at the top), " + MODE[1])),
  command(0, 0x4b, "DOTS_READ", ["縦 8 ドットを読む", "Read 8 dots down"], DOTS, ["A = 8 ドット（ビット 0 が上）", "A = 8 dots (bit 0 at the top)"]),
  command(0, 0x4c, "PSET", ["1 ドットを表示", "Set a dot"], dots("A = 0: 点灯、1: 消灯、2: 反転", "A = 0: on, 1: off, 2: invert")),
  command(0, 0x4d, "POINT", ["1 ドットを読む", "Read a dot"], DOTS, ["A = 1: 点灯", "A = 1: on"]),
  command(0, 0x4e, "LINE", ["線を引く", "Draw a line"], ["X, Y = 始点、(BX) = 終点の x、(DX) = 終点の y（どちらも 2 バイト）、" + MODE[0] + "、[LINPTN] = 線種（2 バイト）", "X, Y = start, (BX) = end x, (DX) = end y (2 bytes each), " + MODE[1] + ", [LINPTN] = pattern (2 bytes)"], ["X, Y = 終点", "X, Y = end"]),
  command(0, 0x4f, "BOX", ["四角を塗る", "Fill a box"], ["X, Y = 角、(BX) = 対角の x、(DX) = 対角の y（どちらも 2 バイト）、" + MODE[0] + "、[LINPTN] = 模様（2 バイト）", "X, Y = corner, (BX) = the other x, (DX) = the other y (2 bytes each), " + MODE[1] + ", [LINPTN] = pattern (2 bytes)"]),
  command(0, 0x50, "POWER", ["表示の ON / OFF", "Display on or off"], ["A = 0: OFF、1: ON", "A = 0: off, 1: on"]),
  command(0, 0x51, "CLEAR", ["画面を消す", "Clear the screen"]),
  command(0, 0x52, "CLEAR_CHARS", ["指定位置から n 文字消す", "Clear n characters from a place"], at("A = 文字数（次の行へ続く）", "A = characters (goes on to the next line)")),
  command(0, 0x54, "INSERT", ["行を挿入", "Insert lines"], ["(BH) = 行、A = 行数", "(BH) = line, A = lines"]),
  command(0, 0x55, "ROW_READ", ["1 行のドットを読む", "Read the dots of a line"], ["(BH) = 行（0〜3）、X = 読み込む先（240 バイト。x = 0〜119、続けて 239〜120 の順）", "(BH) = line (0-3), X = where to (240 bytes: x = 0-119, then 239 down to 120)"]),
  command(0, 0x56, "ROW_WRITE", ["1 行のドットを書く", "Write the dots of a line"], ["(BH) = 行（0〜3）、X = データ（240 バイト、縦 8 ドットずつ。x = 0〜119、続けて 239〜120 の順）", "(BH) = line (0-3), X = data (240 bytes, 8 dots down each: x = 0-119, then 239 down to 120)"]),
  command(0, 0x57, "PUTC_ANY", ["表示範囲に関係なく 1 文字表示", "Show a character outside the display range too"], at("A = 文字", "A = character"), ["(BL)(BH) = 次の位置、C=1: 画面の外", "(BL)(BH) = next place, C=1: off the screen"]),
  command(0, 0x58, "GUIDE", ["[ ] 付きの表示（メニュー）", "Show with guide lines [ ] (a menu)"], at("A = 個数、B のビット 0 = 0: [ ]、1: ( )、ビット 7 = 1: 行を消さない、X = 文字列の並び（それぞれ FFh で終わる。7 文字まで）", "A = how many, B bit 0 = 0: [ ], 1: ( ), bit 7 = 1: does not clear the line, X = the strings (each ended by FFh, up to 7 characters)")),
  // Keyboard
  command(1, 0x41, "MATRIX", ["行列コードの読み出し（押されるまで待つ）", "Read a matrix code (waits for a key)"], undefined, KEY_OUT),
  command(1, 0x42, "PEEK", ["行列コードの非破壊読み出し（待たない）", "Read a matrix code, leaving it (does not wait)"], undefined, KEY_OUT),
  command(1, 0x43, "READ", ["キーの読み出し（文字）", "Read a key (a character)"], ["A のビット 7 = 0: 待たない、1: 待つ", "A bit 7 = 0: does not wait, 1: waits"], ["IL = 1: 入力あり、0: なし。A = 文字（00h なら B = 拡張コード）、" + ERROR[0], "IL = 1: a key, 0: none. A = character (when 00h, B = extended code), " + ERROR[1]]),
  command(1, 0x44, "SET", ["キーバッファに入れる", "Put in the key buffer"], ["X = データ、A = バイト数", "X = data, A = bytes"]),
  command(1, 0x45, "CLEAR", ["キーバッファを空にする", "Empty the key buffer"]),
  command(1, 0x46, "FKEYS", ["ファンクションキーの表示", "Show the function keys"], undefined, ["C=1: 4 行表示だった", "C=1: the display has 4 lines"]),
  // Serial
  command(2, 0x41, "PUT", ["1 バイト送る", "Send a byte"], ["A = データ", "A = the byte"], ["C=1 なら A = 00h: 時間切れ、FEh: 電池、FFh: BREAK", "C=1: A = 00h: time out, FEh: battery, FFh: BREAK"]),
  command(2, 0x42, "GET", ["1 バイト受ける", "Receive a byte"], undefined, ["A = データ。C=1 なら A = 00h: 時間切れ、FEh: 電池、FFh: BREAK", "A = the byte. C=1: A = 00h: time out, FEh: battery, FFh: BREAK"]),
  command(2, 0x43, "SETUP", ["作業域の条件をハードウェアに設定", "Put the settings in the hardware"]),
  command(2, 0x44, "RS_HIGH", ["RS を High", "RS high"]), command(2, 0x45, "RS_LOW", ["RS を Low", "RS low"]),
  command(2, 0x46, "RR_HIGH", ["RR を High", "RR high"]), command(2, 0x47, "RR_LOW", ["RR を Low", "RR low"]),
  command(2, 0x48, "ER_HIGH", ["ER を High", "ER high"]), command(2, 0x49, "ER_LOW", ["ER を Low", "ER low"]),
  command(2, 0x4a, "CS", ["CS を読む", "Read CS"], undefined, ["C = 1: High", "C = 1: high"]), command(2, 0x4b, "CD", ["CD を読む", "Read CD"], undefined, ["C = 1: High", "C = 1: high"]),
  // Printer
  command(3, 0x41, "PUT", ["印字", "Print"], ["A = データ", "A = the byte"], ["C=1: エラー", "C=1: error"]),
  command(3, 0x42, "POSITION", ["印字位置", "Printing position"], undefined, ["A = 位置", "A = position"]),
  command(3, 0x43, "CHECK", ["プリンタの確認", "Look for a printer"], undefined, ["A = 種類、I = 桁数。C=1: つながっていない（A = 54h）", "A = type, I = columns. C=1: not connected (A = 54h)"]),
  // Tape
  command(4, 0x41, "WRITE", ["データの書き込み", "Write data"], TAPE, TAPE_OUT), command(4, 0x42, "READ", ["データの読み出し", "Read data"], TAPE, TAPE_OUT), command(4, 0x43, "VERIFY", ["データの照合", "Verify data"], TAPE, TAPE_OUT),
  command(4, 0x44, "WRITE_HEADER", ["ヘッダの書き込み", "Write a header"], TAPE_HEADER, TAPE_OUT), command(4, 0x45, "READ_HEADER", ["ヘッダの読み出し・照合", "Read or verify a header"], TAPE_HEADER, TAPE_OUT),
  // RAM disks
  command(5, 0x10, "MEDIA_CHECK", ["メディアの確認", "Check the media"], ["(CH) = ドライブ、A = 0: 今のメディアを覚える、1: 交換を許す、2: 交換されたか調べる", "(CH) = drive, A = 0: remember the media, 1: allow a change, 2: has it changed?"], ERROR),
  command(5, 0x11, "MEDIA_INFO", ["メディアの情報", "Media parameters"], ["(CH) = ドライブ", "(CH) = drive"], ["X = 情報（19 バイト）のアドレス、" + ERROR[0], "X = the parameters (19 bytes), " + ERROR[1]]),
  command(5, 0x12, "SECTOR_READ", ["セクタの読み出し", "Read sectors"], SECTORS, SECTORS_OUT), command(5, 0x13, "SECTOR_WRITE", ["セクタの書き込み", "Write sectors"], SECTORS, SECTORS_OUT),
  command(5, 0x14, "SECTOR_WRITE_VERIFY", ["書き込みと照合", "Write and verify sectors"], SECTORS, SECTORS_OUT), command(5, 0x15, "SECTOR_VERIFY", ["照合", "Verify sectors"], SECTORS, SECTORS_OUT),
  command(5, 0x16, "STATUS", ["状態", "Status"], ["(CH) = ドライブ", "(CH) = drive"], ["A のビット 0 = 1: 書き込み禁止、" + ERROR[0], "A bit 0 = 1: write protected, " + ERROR[1]]),
  command(5, 0x17, "SECTOR_ADDRESS", ["セクタのアドレス", "Address of a sector"], ["(CH) = ドライブ、(BX) = セクタ", "(CH) = drive, (BX) = sector"], ["X = セクタのアドレス、(CX) = セクタの大きさ、(DI) = 先頭のセクタのアドレス、" + ERROR[0], "X = the sector, (CX) = bytes a sector, (DI) = the first sector, " + ERROR[1]]),
  // Memory blocks
  command(6, 0x41, "FIND", ["ブロックのアドレスを探す", "Find a block's address"], BLOCK, ["X = ブロック名の次、Y = 先頭アドレス、C=1 なら A = 01h: スロットがない、04h: ブロックがない", "X = after the name, Y = first address, C=1: A = 01h: no slot, 04h: no block"]),
  command(6, 0x42, "RESIZE", ["ブロックの空き領域の大きさを変える", "Change a block's free space"], block("A = 空き領域の番号（0、1）、Y = 空き領域のバイト数", "A = free area number (0, 1), Y = bytes of free space"), blockOut("X = ブロック名の次、0Ch なら Y = 取れる大きさ", "X = after the name, with 0Ch Y = what is possible")),
  command(6, 0x43, "MOVE", ["メモリの転送（重なってもよい）", "Move memory (may overlap)"], ["X = 転送元、Y = 転送先、(SI) = バイト数（3 バイト）", "X = from, Y = to, (SI) = bytes (3 bytes)"], ["X、Y = 終わりの次のアドレス", "X, Y = after the end"]),
  command(6, 0x44, "RENAME", ["名前を変える", "Rename"], block("Y = 新しいブロック名", "Y = new block name"), blockOut("X、Y = 名前の次", "X, Y = after the names")),
  command(6, 0x45, "CREATE", ["ブロックを作る（先に MEM_TIDY）", "Create a block (MEM_TIDY first)"], BLOCK, blockOut("X = ブロック名の次、Y = 先頭アドレス", "X = after the name, Y = first address")),
  command(6, 0x46, "DELETE", ["ブロックを消す", "Delete a block"], BLOCK, blockOut("X = ブロック名の次", "X = after the name")),
  command(6, 0x47, "TIDY", ["空きを詰める", "Close up the free space"], SLOT),
  command(6, 0x48, "CREATE_FIRST", ["先頭にブロックを作る", "Create a block at the top"], block("Y = 大きさ（ROM は使わない）", "Y = size (not used by the ROM)"), blockOut("X = ブロック名の次、Y = 先頭アドレス", "X = after the name, Y = first address")),
  // System
  command(8, 0x41, "POWER_OFF", ["電源を切る", "Power off"]),
  command(8, 0x42, "WORK", ["作業域の大きさを変える（先に MEM_TIDY）", "Change a work area's size (MEM_TIDY first)"], ["X = ポインタのアドレス（BFD1Ah = 機械語エリアなど）、Y = バイト数", "X = its pointer (BFD1Ah = machine code and so on), Y = bytes"], ["C=1: メモリ不足", "C=1: not enough memory"]),
  command(8, 0x43, "BASIC", ["中間コードを実行", "Run intermediate code"], ["X = 中間コード、A のビット 0 = 1: 1 文ずつ、1 = 1: TRON、2 = 1: 直接入力、4 = 1: RUN モード", "X = the code, A bit 0 = 1: step, 1 = 1: TRON, 2 = 1: direct, 4 = 1: RUN mode"], ["X = 実行した所、C=1 なら B = BASIC のエラー番号", "X = where it got to, C=1: B = BASIC error number"]),
  command(8, 0x45, "BASIC_STATEMENT", ["BASIC の文の処理アドレス", "Address of a BASIC statement"], ["A = 中間コード", "A = the code"], ["Y = アドレス、C=1: ない", "Y = address, C=1: none"]),
  command(8, 0x46, "BASIC_FUNCTION", ["BASIC の関数の処理アドレス", "Address of a BASIC function"], ["A = 中間コード", "A = the code"], ["Y = アドレス、C=1: ない", "Y = address, C=1: none"])
];

const HANDLE: Text = ["(CL) = ハンドル", "(CL) = handle"];
const handle = (ja: string, en: string): Text => [`${HANDLE[0]}、${ja}`, `${HANDLE[1]}, ${en}`];
const FILE_END: Text = ["A のビット 0 = 0: 1Ah で終わり、1: ファイルの最後まで", "A bit 0 = 0: ends at 1Ah, 1: at the end of the file"];
const NAME: Text = ["X = ファイル名（ドライブ: + 名前 8 文字 + . + 拡張子 3 文字 + 00h）", "X = file name (drive: + 8 characters + . + 3 + 00h)"];
const FILE_ERROR: Text = ["C=1 なら A = FERR_ の番号", "C=1: A = a FERR_ number"];
const fileOut = (ja: string, en: string): Text => [`${ja}、${FILE_ERROR[0]}`, `${en}, ${FILE_ERROR[1]}`];
const OPENED = fileOut("(CL) = ハンドル、A = 属性", "(CL) = handle, A = attribute");
const BYTES = fileOut("X = 次のアドレス、Y = 処理したバイト数", "X = next address, Y = bytes done");
const BYTE_OUT = fileOut("A = データ、B = 読めたバイト数（0、1）", "A = the byte, B = bytes read (0, 1)");
const file = (number: number, name: string, what: Text, takes?: Text, gives: Text = FILE_ERROR): Command => ({
  device: -2, number, constant: "FCS_" + name, ja: what[0], en: what[1], inJa: takes?.[0], inEn: takes?.[1], outJa: gives[0], outEn: gives[1]
});
/** File control: CALLF FCS. (CX) is not kept: put the handle in (CL) again before each call. */
export const FILE_COMMANDS: readonly Command[] = [
  file(0x00, "CREATE", ["ファイルを作って開く", "Create a file and open it"], [NAME[0] + "、A = 属性（ビット 0: 書き込み禁止、1: 見えない）", NAME[1] + ", A = attribute (bit 0: protected, 1: invisible)"], OPENED),
  file(0x01, "OPEN", ["開く", "Open"], [NAME[0] + "、A = 1: 読む、2: 書く、3: 両方", NAME[1] + ", A = 1: read, 2: write, 3: both"], OPENED),
  file(0x02, "CLOSE", ["閉じる", "Close"], HANDLE),
  file(0x03, "READ_BLOCK", ["ブロックの読み出し", "Read a block"], handle("X = 読み込む先、Y = バイト数、" + FILE_END[0], "X = where to, Y = bytes, " + FILE_END[1]), BYTES),
  file(0x04, "WRITE_BLOCK", ["ブロックの書き込み", "Write a block"], handle("X = データ、Y = バイト数（0: 今の位置から後を捨てる）", "X = data, Y = bytes (0: drops what is after the pointer)"), BYTES),
  file(0x05, "READ", ["1 バイトの読み出し", "Read a byte"], handle(FILE_END[0], FILE_END[1]), BYTE_OUT),
  file(0x06, "WRITE", ["1 バイトの書き込み", "Write a byte"], handle("A = データ", "A = the byte"), fileOut("B = 書けたバイト数", "B = bytes written")),
  file(0x07, "VERIFY", ["照合", "Verify"], handle("X = メモリのアドレス、Y = バイト数、" + FILE_END[0], "X = memory address, Y = bytes, " + FILE_END[1]), BYTES),
  file(0x08, "PEEK", ["1 バイトの非破壊読み出し", "Read a byte, leaving it"], handle(FILE_END[0], FILE_END[1]), BYTE_OUT),
  file(0x09, "SEEK", ["位置を動かす", "Move the pointer"], handle("(SI) = バイト数（3 バイト）、A = 0: 先頭から、1: 今の位置から（符号付き）、2: 終わりから", "(SI) = bytes (3 bytes), A = 0: from the top, 1: from here (signed), 2: from the end"), fileOut("(SI) = 位置", "(SI) = the pointer")),
  file(0x0a, "INFO", ["開いたファイルの情報", "About an open file"], handle("A = 0: 大きさと位置、1: 名前（X = 19 バイトの場所）", "A = 0: size and pointer, 1: its name (X = room for 19 bytes)"), fileOut("A = 0 で呼ぶと A = 開き方、B = デバイスの属性、(SI) = 位置、(DI) = 大きさ", "called with A = 0: A = how it is open, B = device attribute, (SI) = pointer, (DI) = size")),
  file(0x0b, "SET_INFO", ["ディレクトリの情報を読む、変える", "Read or change directory information"], [NAME[0] + "、Y = 属性 1、時刻 2、日付 2、大きさ 3 の 8 バイト、A = 0: 読む、1: 書く", NAME[1] + ", Y = 8 bytes: attribute 1, time 2, date 2, size 3, A = 0: read, 1: write"]),
  file(0x0c, "FIND", ["名前を探す（? が使える）", "Find a name (may have ?)"], [NAME[0] + "、Y = 結果の場所（18 バイト）、(BX) = 始める番号、A = 0: 後ろへ、1: 前へ、+80h: 見えないものも", NAME[1] + ", Y = room for the result (18 bytes), (BX) = number to start at, A = 0: forward, 1: backward, +80h: invisible too"], fileOut("(BX) = 見つけた番号、[Y] = ドライブ 6、名前 8、.、拡張子 3", "(BX) = its number, [Y] = drive 6, name 8, a point, extension 3")),
  file(0x0d, "RENAME", ["名前を変える", "Rename"], [NAME[0] + "、Y = 新しい名前（ドライブなしの 12 文字）", NAME[1] + ", Y = new name (12 characters, no drive)"]),
  file(0x0e, "DELETE", ["消す（? が使える）", "Delete (may have ?)"], NAME),
  file(0x0f, "FREE", ["空き容量", "Free space"], ["X = ドライブ名（: まで）、A = 0", "X = drive name (up to its colon), A = 0"], fileOut("(SI) = 空き（3 バイト）", "(SI) = bytes free (3 bytes)")),
  file(0x10, "INIT", ["初期化", "Initialize"], ["A = 0: すべて、1: 全部閉じて標準の 3 つを開く、2: 標準のほかを閉じる", "A = 0: everything, 1: closes all and opens the standard three, 2: closes all but the standard ones"])
];

export interface SystemName { readonly constant: string; readonly value: number; readonly ja: string; readonly en: string }
const name = (constant: string, value: number, ja: string, en: string): SystemName => ({ constant, value, ja, en });

/** The entries, and the internal RAM the arguments go in. */
export const ENTRIES: readonly SystemName[] = [
  name("IOCS", 0xfffe8, "IOCS のエントリ（CALLF IOCS。IL = 番号）", "IOCS entry (CALLF IOCS, IL = the number)"),
  name("FCS", 0xfffe4, "FCS（ファイル制御）のエントリ（CALLF FCS。IL = 番号）", "FCS (file control) entry (CALLF FCS, IL = the number)")
];
export const ARGUMENTS: readonly SystemName[] = [
  name("BL", 0xd4, "引数", "Argument"), name("BH", 0xd5, "引数", "Argument"), name("BX", 0xd4, "引数（BL と BH の 2 バイト）", "Argument (2 bytes, BL and BH)"),
  name("CL", 0xd6, "デバイス番号", "Device number"), name("CH", 0xd7, "ドライブ番号", "Drive number"), name("CX", 0xd6, "デバイスとドライブ（2 バイト）", "Device and drive (2 bytes)"),
  name("DL", 0xd8, "引数", "Argument"), name("DH", 0xd9, "引数", "Argument"), name("DX", 0xd8, "引数（DL と DH の 2 バイト）", "Argument (2 bytes, DL and DH)"),
  name("SI", 0xda, "引数（3 バイト）", "Argument (3 bytes)"), name("DI", 0xdd, "引数（3 バイト）", "Argument (3 bytes)")
];
export const ERRORS: readonly SystemName[] = [
  name("ERR_PROTECTED", 0x00, "書き込み禁止（コマンド 00h〜1Fh、40h）", "Write protected (commands 00h-1Fh, 40h)"), name("ERR_NO_DRIVE", 0x01, "ドライブがない", "No such drive"), name("ERR_NOT_READY", 0x02, "準備ができていない", "Not ready"),
  name("ERR_COMMAND", 0x03, "処理できないコマンド", "Unknown command"), name("ERR_CHANGED", 0x04, "メディアが交換された", "Media changed"), name("ERR_WRITE", 0x05, "書き込みエラー", "Write error"), name("ERR_READ", 0x06, "読み取りエラー", "Read error"),
  name("ERR_VERIFY", 0x07, "ベリファイエラー", "Verify error"), name("ERR_NO_WRITE", 0x08, "書けないデバイス", "Cannot be written"), name("ERR_NO_READ", 0x09, "読めないデバイス", "Cannot be read"), name("ERR_BATTERY", 0xfe, "電池切れ", "Low battery"), name("ERR_BREAK", 0xff, "BREAK", "BREAK")
];
/** FCS, and commands 20h-2Fh. */
export const FILE_ERRORS: readonly SystemName[] = [
  name("FERR_DEVICE", 0x00, "デバイスのエラーで中止", "A device error"), name("FERR_PARAMETER", 0x01, "値が範囲外", "Parameter out of range"), name("FERR_NOT_FOUND", 0x02, "ファイルがない", "No such file"),
  name("FERR_NO_PATH", 0x03, "パスコードがない", "No such pass code"), name("FERR_TOO_MANY", 0x04, "開きすぎ", "Too many open"), name("FERR_PROTECTED", 0x05, "許されていない", "Not permitted"), name("FERR_HANDLE", 0x06, "ハンドルが無効", "Bad handle"),
  name("FERR_MODE", 0x07, "開き方が違う", "Not opened for this"), name("FERR_OPEN", 0x08, "開いている", "Is open"), name("FERR_EXISTS", 0x09, "同じ名前がある", "Name exists"), name("FERR_NO_DRIVE", 0x0a, "ドライブがない、使えない", "No such drive, or not for this"),
  name("FERR_VERIFY", 0x0b, "照合の不一致", "Verify error"), name("FERR_SHORT", 0x0c, "途中までしか処理できない（空き不足）", "Could not do all (no room)")
];

const hex = (n: number, width: number): string => "$" + n.toString(16).toUpperCase().padStart(width, "0");
const equ = (constant: string, value: number, width: number, comment: string): string => `${constant.padEnd(23)} EQU ${hex(value, width).padEnd(8)}; ${comment}`;
const takes = (c: Command): string => (c.inJa ? `${c.ja}: ${c.inJa}` : c.ja) + (c.outJa ? ` → ${c.outJa}` : "");

/** The text of inc/iocs.inc. */
export function iocsInclude(): string {
  const out = [
    "; iocs.inc: PC-E500 の IOCS（デバイスと番号に名前を付けたもの）",
    ";",
    ";         MV    (CL),DEV_SCRN      ; デバイス",
    ";         MV    (CH),0             ; ドライブ",
    ";         MV    IL,SCRN_PUTS       ; 番号",
    ";         CALLF IOCS               ; C=1 なら A にエラー番号",
    ";",
    "; 名前は値を置き換えるだけで、プログラムの大きさは変わらない。",
    "",
    "; エントリ", ...ENTRIES.map(e => equ(e.constant, e.value, 5, e.ja)), "",
    "; 引数を入れる内部 RAM", ...ARGUMENTS.map(e => equ(e.constant, e.value, 2, e.ja)), "",
    "; デバイス番号（CL に入れる）", ...DEVICES.map(d => equ(d.constant, d.number, 2, `${d.ja}（${d.drives}）`)), "",
    "; どのデバイスにもある番号（IL に入れる）", ...COMMANDS.filter(c => c.device < 0).map(c => equ(c.constant, c.number, 2, takes(c)))
  ];
  for (const d of DEVICES) {
    const list = COMMANDS.filter(c => c.device === d.number);
    if (list.length > 0) out.push("", `; ${d.ja}（CL = ${d.constant}）`, ...list.map(c => equ(c.constant, c.number, 2, takes(c))));
  }
  out.push("", "; ファイル制御（CALLF FCS）", ...FILE_COMMANDS.map(c => equ(c.constant, c.number, 2, takes(c))), "", "; エラー番号（C=1 のときの A。コマンド 00h〜1Fh、40h）", ...ERRORS.map(e => equ(e.constant, e.value, 2, e.ja)), "", "; ファイル制御（CALLF FCS）のエラー番号", ...FILE_ERRORS.map(e => equ(e.constant, e.value, 2, e.ja)));
  return out.join("\n") + "\n";
}

/** The commands a device takes: its own and those of every device. */
export function commandsOf(device: number | undefined): Command[] {
  return COMMANDS.filter(c => device === undefined || c.device === device || c.device < 0);
}

/** What a command is, in Markdown lines. */
export function commandLines(c: Command): string[] {
  const d = DEVICES[c.device];
  const lines = [`${L(c.ja, c.en)}${d ? L(`（${d.ja}）`, ` (${d.en})`) : c.device === -2 ? "（FCS）" : ""}`];
  const takes = L(c.inJa ?? "", c.inEn ?? ""), gives = L(c.outJa ?? "", c.outEn ?? "");
  if (takes) lines.push(L("引数: ", "Takes: ") + takes);
  if (gives) lines.push(L("戻り: ", "Gives: ") + gives);
  return lines;
}

const NUMBER = /^(?:\$|&H?|0x)([0-9A-F]+)$|^([0-9][0-9A-F]*)H$|^([0-9]+)$/i;
/** A number as the assembler writes it. */
export function literal(text: string): number | undefined {
  const m = NUMBER.exec(text.trim());
  if (!m) return undefined;
  return m[3] !== undefined ? parseInt(m[3], 10) : parseInt(m[1] ?? m[2], 16);
}

/**
 * The device set by the lines before a place ("MV (CL),DEV_SCRN", "MV ($D6),0", "MVW (CX),1"),
 * looking up to 24 lines back, not past a label that can be jumped to or a return.
 */
export function deviceBefore(lines: readonly string[], line: number): number | undefined {
  for (let n = line - 1; n >= 0 && n >= line - 24; n--) {
    const code = lines[n].replace(/;.*$/, "");
    const m = /^\s*(?:[A-Za-z_.][\w.]*\s*:)?\s*MVW?\s+\(\s*(CL|CX|\$D6|&H?D6|0xD6|0?D6H|214)\s*\)\s*,\s*(\S+?)\s*$/i.exec(code);
    if (m) {
      const named = DEVICES.find(d => d.constant === m[2].toUpperCase());
      const value = named?.number ?? literal(m[2]);
      return value === undefined ? undefined : value & 0xff;
    }
    if (/^\s*(?:[A-Za-z_.][\w.]*\s*:)?\s*(?:RET|RETF|RETI|JP|JPF|JR)\s*(?:\s[A-Za-z_(]|$)/i.test(code)) return undefined;
  }
  return undefined;
}

/** Whether a command number goes here: "MV IL," up to the cursor. */
export function wantsCommand(before: string): boolean {
  return /^\s*(?:[A-Za-z_.][\w.]*\s*:)?\s*MV\s+IL\s*,\s*[\w$&]*$/i.test(before);
}

/** Whether FCS is called in the lines after, before any other call. */
export function callsFcs(lines: readonly string[], line: number): boolean {
  for (let n = line; n < lines.length && n <= line + 8; n++) {
    const m = /\bCALLF\s+(\S+)/i.exec(lines[n].replace(/;.*$/, ""));
    if (m) return m[1].toUpperCase() === "FCS" || literal(m[1]) === 0xfffe4;
  }
  return false;
}

/** The commands a number stands for in "MV IL,$42", with the device if the lines before say it. */
export function commandsAt(lines: readonly string[], line: number, value: number): Command[] {
  if (callsFcs(lines, line)) return FILE_COMMANDS.filter(c => c.number === value);
  const dev = deviceBefore(lines, line);
  return commandsOf(dev).filter(c => c.number === value);
}

/** A constant of iocs.inc, for the hover. */
export function commandNamed(constant: string): Command | undefined {
  const upper = constant.toUpperCase();
  return COMMANDS.find(c => c.constant === upper) ?? FILE_COMMANDS.find(c => c.constant === upper);
}
