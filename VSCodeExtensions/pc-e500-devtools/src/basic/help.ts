// What every BASIC keyword does and how it is written, for the completion list and the
// hover (docs/analysis/14_BASIC_REFERENCE.md).
import { isEnglish, L } from "../l10n";

/** statement: starts a statement; function: gives a value; operator: between values; word: inside another statement. */
export type BasicKind = "statement" | "function" | "operator" | "word";

export interface BasicHelp {
  readonly kinds: readonly BasicKind[];
  /** In Japanese; `forms()` gives them in the language in use. */
  readonly forms: readonly string[];
  readonly ja: string;
  readonly en: string;
  readonly noteJa?: string;
  readonly noteEn?: string;
  /** Only in ROM 8.3 and later (PC-E500S, PC-U6000, PC-E650). */
  readonly structured?: boolean;
  /** Draws on the CE-515P plotter. */
  readonly plotter?: boolean;
}

// What stands in the forms, longer words first.
const WORDS: ReadonlyArray<readonly [string, string]> = [
  ["開始行番号", "first line"], ["新行番号", "new line"], ["旧行番号", "old line"], ["行番号", "line"], ["ラベル", "label"], ["文字範囲", "letters"], ["文字列変数", "string var"], ["数値変数", "number var"], ["文字列", "string"], ["文字数", "count"],
  ["ファイル番号", "file no"], ["旧ファイル名", "old name"], ["新ファイル名", "new name"], ["ファイル名", "file"], ["パスワード", "password"], ["プロンプト", "prompt"], ["キー番号", "key no"], ["通信条件", "settings"], ["配列", "array"], ["サイズ", "size"],
  ["開始アドレス", "first address"], ["終了アドレス", "last address"], ["アドレス", "address"], ["開始値", "first"], ["終了値", "last"], ["増分", "step"], ["しきい値", "threshold"], ["変数", "var"], ["条件", "condition"], ["回数", "count"], ["音程", "pitch"], ["長さ", "length"],
  ["桁数", "columns"], ["開始角", "start"], ["終了角", "end"], ["縦横比", "ratio"], ["ピッチ", "pitch"], ["扇形", "pie"], ["半径", "radius"], ["線種", "pattern"], ["パターン", "pattern"], ["向き", "direction"], ["行数", "lines"], ["桁", "column"], ["行", "row"], ["色", "color"],
  ["コメント", "comment"], ["モード", "mode"], ["書式", "format"], ["番号", "number"], ["項目", "item"], ["値", "value"], ["式", "expr"], ["文", "statement"]
];

/** The forms in the language in use. */
export function forms(help: BasicHelp): string[] {
  if (!isEnglish()) return [...help.forms];
  return help.forms.map(f => WORDS.reduce((s, [ja, en]) => s.split(ja).join(en), f));
}

type Extra = Partial<Pick<BasicHelp, "structured" | "plotter">> & { kinds?: BasicKind[] };
const entry = (kind: BasicKind) => (f: string, ja: string, en: string, noteJa?: string, noteEn?: string, extra: Extra = {}): BasicHelp =>
  ({ kinds: [kind], forms: f.split(" ⏎ "), ja, en, noteJa, noteEn, ...extra });
const S = entry("statement"), F = entry("function"), O = entry("operator"), W = entry("word");
const PLOTTER = { plotter: true }, STRUCTURED = { structured: true };
const ANGLE_JA = "角度の単位は `DEGREE` / `RADIAN` / `GRAD` の設定による。", ANGLE_EN = "The angle is in the unit set by `DEGREE` / `RADIAN` / `GRAD`.";
const BITS_JA = "整数（-32768〜32767）のビット演算。`IF` の条件もつなげる。", BITS_EN = "Works on the bits of integers (-32768 to 32767); joins conditions of `IF` too.";
const FILE_JA = "`d:` は `X:`（ポケットディスク）、`E:` `F:`（RAM ディスク）", FILE_EN = "`d:` is `X:` (pocket disk) or `E:` `F:` (RAM disks)";

const IF_FORMS = "IF 条件 THEN {文 | 行番号 | *ラベル} [ELSE {文 | 行番号 | *ラベル}] ⏎ IF 条件 GOTO 行番号 [ELSE 行番号]";
const IF_BLOCK = "IF 条件 THEN ⏎   ... ⏎ ELSE ⏎   ... ⏎ ENDIF";
const FOR_FORMS = "FOR 変数=開始値 TO 終了値 [STEP 増分] ⏎   ... ⏎ NEXT [変数]";
const SWITCH_FORMS = "SWITCH 変数 ⏎ CASE 値 ⏎   ... ⏎ DEFAULT ⏎   ... ⏎ ENDSWITCH";
const ON_FORMS = "ON 式 GOSUB 行番号, 行番号, ... ⏎ ON 式 GOTO 行番号, 行番号, ... ⏎ ON ERROR GOTO {行番号 | *ラベル} ⏎ ON ERROR GOTO 0";
const OPEN_FORMS = "OPEN \"d:ファイル名\" FOR モード AS #ファイル番号 ⏎ OPEN \"通信条件\" AS #ファイル番号 ⏎ OPEN";

export const BASIC_HELP: Readonly<Record<string, BasicHelp>> = {
  // Program flow
  GOTO: S("GOTO {行番号 | *ラベル}", "指定した行へ分岐する", "Go to a line", undefined, undefined, { kinds: ["statement", "word"] }),
  GOSUB: S("GOSUB {行番号 | *ラベル} ⏎ RETURN", "サブルーチンを呼び出す", "Call a subroutine", "`RETURN` で呼び出し元の次の文へ戻る。36 段までネストにできる（`FOR` などと場所を分け合う）。", "`RETURN` goes back to the statement after it. Up to 36 levels (they share room with `FOR` and the like).", { kinds: ["statement", "word"] }),
  RETURN: S("RETURN", "`GOSUB` の次の文へ戻る", "Go back to the statement after `GOSUB`"),
  ON: S(ON_FORMS, "値で分岐先を選ぶ。エラー処理の行を決める", "Branch by a value, or set the line that handles errors", "式が 1 なら 1 番目、2 なら 2 番目。0、負、候補より大きいときは次へ進む。`ON ERROR GOTO 0` でエラー処理を解除。", "1 takes the first, 2 the second; 0, less, or more than there are goes on. `ON ERROR GOTO 0` removes the handler."),
  ERROR: W("ON ERROR GOTO {行番号 | *ラベル} ⏎ ON ERROR GOTO 0", "エラー処理の行を決める", "Set the line that handles errors", "処理の中では `ERN`（番号）と `ERL`（行）を調べ、`RESUME` で戻る。", "The handler looks at `ERN` (number) and `ERL` (line), and goes back with `RESUME`.", { kinds: ["word"] }),
  RESUME: S("RESUME ⏎ RESUME NEXT ⏎ RESUME {行番号 | *ラベル}", "エラー処理から戻る", "Go back from an error handler", "引数なしはエラーの文から、`NEXT` はその次の文から再開。", "Without an argument from the statement with the error, `NEXT` from the one after it."),
  IF: S(`${IF_FORMS} ⏎ ${IF_BLOCK}`, "条件で分岐する", "Branch by a condition", "条件は `=` `<>` `<` `>` `<=` `>=`。`AND` `OR` でつなぐ。変数名の直後の `THEN` の前には空白を入れる。複数行の形（`ENDIF` まで）は ROM 8.3 以降。", "Conditions: `=` `<>` `<` `>` `<=` `>=`, joined by `AND` `OR`. Put a space between a variable and `THEN`. The form over several lines (to `ENDIF`) needs ROM 8.3 or later."),
  THEN: W(IF_FORMS, "条件が真のとき", "When the condition is true"),
  ELSE: S(IF_FORMS, "条件が偽のとき", "When the condition is false", undefined, undefined, { kinds: ["statement", "word"] }),
  ENDIF: S(IF_BLOCK, "複数行の `IF` の終わり", "End of an `IF` over several lines", undefined, undefined, STRUCTURED),
  FOR: S(FOR_FORMS, "回数を決めて繰り返す", "Repeat a number of times", "`STEP` の既定は 1。6 段までネストにできる。中で `CLEAR` `DIM` `ERASE` は使わない。", "`STEP` is 1 unless given. Up to 6 levels. Do not use `CLEAR` `DIM` `ERASE` inside.", { kinds: ["statement", "word"] }),
  TO: W(FOR_FORMS, "繰り返しの終わりの値（`COPY` ではコピー先）", "The last value of a loop (in `COPY`, the target)"),
  STEP: W(FOR_FORMS, "繰り返しの増分", "How much a loop adds"),
  NEXT: S(FOR_FORMS, "`FOR` の繰り返しの終わり", "End of a `FOR` loop", undefined, undefined, { kinds: ["statement", "word"] }),
  WHILE: S("WHILE 条件 ⏎   ... ⏎ WEND", "条件が真のあいだ繰り返す", "Repeat while a condition is true", "条件は先頭で調べる。", "Looks at the condition first.", STRUCTURED),
  WEND: S("WHILE 条件 ⏎   ... ⏎ WEND", "`WHILE` の終わり", "End of `WHILE`", undefined, undefined, STRUCTURED),
  REPEAT: S("REPEAT ⏎   ... ⏎ UNTIL 条件", "条件が真になるまで繰り返す", "Repeat until a condition is true", "条件は最後に調べる（1 回は実行する）。", "Looks at the condition last, so it runs at least once.", STRUCTURED),
  UNTIL: S("REPEAT ⏎   ... ⏎ UNTIL 条件", "`REPEAT` の終わり", "End of `REPEAT`", undefined, undefined, STRUCTURED),
  SWITCH: S(SWITCH_FORMS, "値で処理を選ぶ", "Choose by a value", "一致する `CASE` がなければ `DEFAULT`。変数は文字列でもよい。ネストにはできない。", "`DEFAULT` when no `CASE` matches. The variable may be a string. Cannot be nested.", STRUCTURED),
  CASE: S(SWITCH_FORMS, "`SWITCH` の値", "A value of `SWITCH`", undefined, undefined, STRUCTURED),
  DEFAULT: S(SWITCH_FORMS, "`SWITCH` のほかの値", "Any other value of `SWITCH`", undefined, undefined, STRUCTURED),
  ENDSWITCH: S(SWITCH_FORMS, "`SWITCH` の終わり", "End of `SWITCH`", undefined, undefined, STRUCTURED),
  END: S("END", "プログラムを終える", "End the program", "開いているファイルを閉じる。", "Closes the open files."),
  STOP: S("STOP", "プログラムを止める（`CONT` で再開）", "Stop the program (`CONT` goes on)"),
  CONT: S("CONT", "止めたプログラムを再開する", "Go on with a stopped program"),
  RUN: S("RUN [{行番号 | *ラベル}]", "プログラムを実行する（A〜Z のほかの変数は消える）", "Run the program (clears the variables other than A-Z)"),
  ARUN: S("ARUN [{行番号 | *ラベル}]", "電源を入れたときに実行する（変数は消える）", "Run at power on (clears the variables)"),
  AUTOGOTO: S("AUTOGOTO {行番号 | *ラベル}", "電源を入れたときに実行する（変数は残る）", "Run at power on (keeps the variables)"),
  CHAIN: S("CHAIN \"d:ファイル名\" [,{行番号 | *ラベル}] ⏎ CHAIN", "別のプログラムに実行を引き継ぐ（変数は残る）", "Go on with another program (keeps the variables)", "引数なしはテープ専用。", "Without an argument: tape only."),
  CALL: S("CALL アドレス", "機械語を呼び出す", "Call machine code", "引数は渡せない（`POKE` / `PEEK` を使う）。機械語は `RETF` で戻り、C=1 なら A がエラー番号になる。", "It takes no arguments (use `POKE` / `PEEK`). The code returns with `RETF`; with C=1, A is an error number."),
  WAIT: S("WAIT [式]", "`PRINT` / `GPRINT` の後の待ち時間を決める", "Set the wait after `PRINT` / `GPRINT`", "0〜65535、1 が約 1/59 秒。引数なしはキーが押されるまで待つ。", "0 to 65535, 1 is about 1/59 s. Without an argument, waits for a key."),
  BEEP: S("BEEP 回数 [,[音程][,長さ]]", "音を鳴らす", "Sound the beeper", "音程 0〜255（大きいほど低い。周波数 = 256000 ÷ (90 + 4 × 音程) Hz）、長さ 0〜65535。", "Pitch 0 to 255 (higher is lower; 256000 / (90 + 4 x pitch) Hz), length 0 to 65535."),
  REM: S("REM コメント ⏎ ' コメント", "コメント", "A comment"),
  // Variables and data
  LET: S("[LET] 変数=式", "変数に代入する（`LET` は省ける）", "Assign to a variable (`LET` can be left out)"),
  DIM: S("DIM 配列(サイズ [,サイズ]) ⏎ DIM 配列$(サイズ [,サイズ])", "配列を用意する", "Make an array", "サイズは添字の最大値（要素数は 1 多い）。`$` は文字列、`#` は倍精度。", "The size is the last index (one more element). `$` for strings, `#` for double precision."),
  ERASE: S("ERASE 配列 [,配列 ...]", "配列を消す", "Remove arrays"),
  CLEAR: S("CLEAR [変数, 変数, ...]", "変数を消す", "Clear the variables", "`FOR` の中では使わない。", "Not inside `FOR`."),
  DEFDBL: S("DEFDBL [文字範囲]", "倍精度にする", "Make variables double precision", "文字範囲は `A`、`A-C` など。引数なしは以後の計算すべて。", "Letters like `A` or `A-C`. Without them, all the calculation from then on."),
  DEFSNG: S("DEFSNG [文字範囲]", "単精度にする", "Make variables single precision"),
  DATA: S("DATA 値, 値, ...", "`READ` で読む値", "Values for `READ`"),
  READ: S("READ 変数, 変数, ...", "`DATA` の値を変数に読む", "Read `DATA` values into variables", "データが尽きるとエラー 53。", "Error 53 when there are no more."),
  RESTORE: S("RESTORE [{行番号 | *ラベル}]", "`READ` の位置を戻す", "Set where `READ` goes on"),
  RANDOMIZE: S("RANDOMIZE", "乱数の種を変える", "Change the seed of `RND`", "実行しないと電源を入れるたびに同じ系列になる。", "Without it, every power on gives the same numbers."),
  POKE: S("POKE アドレス, 値 [,値 ...]", "メモリに書く", "Write to memory", "複数の値は続くアドレスに書く。", "More values go to the addresses after it."),
  DEGREE: S("DEGREE", "角度の単位を度にする", "Angles in degrees"),
  RADIAN: S("RADIAN", "角度の単位をラジアンにする", "Angles in radians"),
  GRAD: S("GRAD", "角度の単位をグラード（直角 = 100）にする", "Angles in grads (a right angle is 100)"),
  // Screen and keys
  PRINT: S("PRINT {式 | 文字列} [{, | ;} ...] ⏎ PRINT USING \"書式\"; {式 | 文字列} ... ⏎ PRINT #ファイル番号, {式 | 文字列} ... ⏎ PRINT", "画面に表示する（`PRINT#` はファイルに書く）", "Show on the screen (`PRINT#` writes to a file)", "`,` は 13 桁ごと、`;` は続けて表示。末尾の `,` `;` は次の `PRINT` に続ける。`?` とも書ける。", "`,` goes to the next 13 columns, `;` goes right on. One at the end goes on with the next `PRINT`. Can be written `?`."),
  USING: S("USING \"書式\" ⏎ USING", "表示の書式を決める", "Set the format of numbers and strings", "`#` 数字、`.` 小数点、`,` 3 桁区切り、`^` 指数、`&` 文字。例: `\"###.##\"`。", "`#` digit, `.` point, `,` thousands, `^` exponent, `&` character: `\"###.##\"`.", { kinds: ["statement", "word"] }),
  PAUSE: S("PAUSE {式 | 文字列} [{, | ;} ...]", "表示して約 0.85 秒待つ", "Show and wait about 0.85 s"),
  INPUT: S("INPUT 変数 [,変数] ⏎ INPUT \"プロンプト\"; 変数 ⏎ INPUT #ファイル番号, 変数, ... ⏎ INPUT$(文字数 [,#ファイル番号])", "キーから入力する（`INPUT#` はファイルから読む、`INPUT$` は文字数を決めて読む関数）", "Enter from the keys (`INPUT#` reads a file; `INPUT$` is a function that reads a number of characters)", "`;` はプロンプトの右、`,` はプロンプトを消して左端から入力。", "`;` enters after the prompt, `,` clears it and enters from the left.", { kinds: ["statement", "function", "word"] }),
  CLS: S("CLS", "画面を消す", "Clear the screen"),
  LOCATE: S("LOCATE [桁] [,行]", "表示の位置を決める", "Set where to show", "桁 0〜39、行 0〜3。", "Column 0 to 39, row 0 to 3."),
  GCURSOR: S("GCURSOR (式, 式)", "`GPRINT` の位置を決める", "Set where `GPRINT` goes", "X 0〜239、Y 0〜31。Y は絵の一番下のドット。", "X 0 to 239, Y 0 to 31 (the lowest dot of the pattern)."),
  GPRINT: S("GPRINT \"文字列\" ⏎ GPRINT 式 [;式 ...] ⏎ GPRINT", "ドットの並びを表示する", "Show dot columns", "文字列は 1 列（縦 8 ドット）を 16 進 2 桁で並べる。式は 1 列の値（下位ビットが上）。", "The string has two hex digits a column of 8 dots; a number is one column (bit 0 at the top)."),
  PSET: S("PSET (式, 式) ⏎ PSET (式, 式),X", "点を点ける（`,X` は反転）", "Put a dot on (`,X` inverts it)", "X 0〜239、Y 0〜31。", "X 0 to 239, Y 0 to 31."),
  PRESET: S("PRESET (式, 式)", "点を消す", "Put a dot off"),
  LINE: S("LINE [(式, 式)]-(式, 式) [,{S | R | X}] [,線種] [,{B | BF}]", "直線・四角を描く", "Draw a line or a box", "S 点灯、R 消灯、X 反転。B 枠、BF 塗りつぶし。線種は 16 ビット（`&HFFFF` 実線）。始点を省くと前の終点から。", "S on, R off, X invert. B box, BF filled. The pattern has 16 bits (`&HFFFF` solid). Without a start, from the last end."),
  KEY: S("KEY キー番号, \"文字列\" ⏎ KEY$ キー番号", "ファンクションキーに文字列を割り当てる（`KEY$` は割り当てた文字列）", "Assign a string to a function key (`KEY$` gives it)", "1〜10。31 文字まで。`+CHR$13` で ENTER まで入れられる。", "1 to 10. Up to 31 characters; `+CHR$13` includes ENTER.", { kinds: ["statement", "function"] }),
  // Files
  OPEN: S(OPEN_FORMS, "ファイルを開く。シリアルの条件を決める", "Open a file, or set up the serial port", "モードは `INPUT`（読む）、`OUTPUT`（新しく書く）、`APPEND`（続けて書く）。シリアルは `\"COM:1200,N,8,1,A,C,&H1A,N,S\"` など。`OPEN$` は今の条件。", "Modes: `INPUT`, `OUTPUT` (a new file), `APPEND`. Serial: `\"COM:1200,N,8,1,A,C,&H1A,N,S\"`. `OPEN$` gives the settings.", { kinds: ["statement", "function"] }),
  AS: W("OPEN \"d:ファイル名\" FOR モード AS #ファイル番号 ⏎ NAME \"d:旧ファイル名\" AS \"新ファイル名\"", "ファイル番号（`NAME` では新しい名前）", "The file number (in `NAME`, the new name)"),
  OUTPUT: W("OPEN \"d:ファイル名\" FOR OUTPUT AS #ファイル番号", "新しく書く（ある場合は消える）", "Write a new file (replaces one)"),
  APPEND: W("OPEN \"d:ファイル名\" FOR APPEND AS #ファイル番号", "続けて書く", "Write at the end of a file"),
  CLOSE: S("CLOSE [#ファイル番号, ...]", "ファイルを閉じる", "Close files", "引数なしはすべて。", "Without an argument, all."),
  LOAD: S("LOAD [\"d:ファイル名\" [,R]] ⏎ LOAD M \"d:ファイル名\" ⏎ LOAD? [\"d:ファイル名\"]", "プログラムを読む（`M` は機械語、`?` は比べる）", "Load a program (`M`: machine code, `?`: compare)", "`,R` は読んで実行する。" + FILE_JA + "、`CAS:`、`COM:`。", "`,R` runs it. " + FILE_EN + ", `CAS:`, `COM:`."),
  SAVE: S("SAVE [\"d:ファイル名\" [,A]] ⏎ SAVE M \"d:ファイル名\", 開始アドレス, 終了アドレス", "プログラムを保存する（`M` は機械語）", "Save the program (`M`: machine code)", "`,A` はテキスト。", "`,A` saves text."),
  MERGE: S("MERGE \"d:ファイル名\"", "テキストのプログラムを合わせる", "Merge a program saved as text"),
  FILES: S("FILES [\"d:ファイル名\"]", "ファイルの一覧", "List files", FILE_JA + "。`*` `?` が使える。", FILE_EN + ". `*` and `?` work."),
  LFILES: S("LFILES [\"d:ファイル名\"]", "ファイルの一覧を印字する", "Print the list of files"),
  KILL: S("KILL \"d:ファイル名\"", "ファイルを消す", "Delete a file", FILE_JA + "。", FILE_EN + "."),
  NAME: S("NAME \"d:旧ファイル名\" AS \"新ファイル名\"", "ファイルの名前を変える", "Rename a file"),
  COPY: S("COPY \"d:ファイル名\" TO \"d:ファイル名\" [,A]", "ファイルをコピーする", "Copy a file", "`*` `?` が使える。", "`*` and `?` work."),
  SET: S("SET \"d:ファイル名\", \"P\" ⏎ SET \"d:ファイル名\", \" \"", "書き込み禁止にする（`\" \"` で解除）", "Write-protect a file (`\" \"` undoes it)"),
  INIT: S("INIT \"E:nK\" ⏎ INIT \"d:\"", "ディスクを初期化する", "Format a disk", "E: は `E:2K`〜`E:27K`、F: は RAM カードの大きさまで。`E:0K` で RAM ディスクをなくす。中身は消える。直接実行だけ。", "E: from `E:2K` to `E:27K`, F: up to the RAM card. `E:0K` removes the RAM disk. The files are lost. Direct only."),
  CLOAD: S("CLOAD [\"ファイル名\"] ⏎ CLOAD? [\"ファイル名\"] ⏎ CLOAD@ [\"ファイル名\"]", "テープから読む（`?` は比べる、`@` はほかの機種のプログラム）", "Load from tape (`?`: compare, `@`: a program of another model)"),
  CSAVE: S("CSAVE [\"ファイル名\"] [,\"パスワード\"]", "テープに保存する", "Save to tape"),
  // Editing
  LIST: S("LIST [{行番号 | *ラベル}]", "プログラムを表示する", "Show the program"),
  LLIST: S("LLIST [{行番号 | *ラベル}] ⏎ LLIST [行番号], [行番号]", "プログラムを印字する", "Print the program"),
  AUTO: S("AUTO [開始行番号 [,増分]]", "行番号を自動で入れる（PRO モード）", "Number the lines (PRO mode)"),
  DELETE: S("DELETE 行番号 ⏎ DELETE 行番号, ⏎ DELETE 行番号,行番号 ⏎ DELETE ,行番号", "行を消す（PRO モード）", "Delete lines (PRO mode)", "`,` の代わりに `-` も使える。", "`-` works in place of `,`."),
  RENUM: S("RENUM [新行番号] [,[旧行番号] [,増分]]", "行番号を付け直す", "Number the lines again", "`GOTO` などの行番号も直す。", "The numbers in `GOTO` and the like change too."),
  NEW: S("NEW", "プログラムと変数を消す", "Erase the program and variables"),
  PASS: S("PASS \"文字列\"", "パスワードを付ける・外す", "Set or remove a password"),
  TEXT: S("TEXT", "TEXT モードにする", "Go to TEXT mode"),
  BASIC: S("BASIC", "TEXT モードから戻る", "Go back from TEXT mode"),
  TRON: S("TRON", "実行中の行番号を表示する", "Show the line numbers as they run"),
  TROFF: S("TROFF", "`TRON` をやめる", "End `TRON`"),
  // Printing
  LPRINT: S("LPRINT {式 | 文字列} [{, | ;} ...] ⏎ LPRINT USING \"書式\"; ...", "印字する", "Print"),
  CONSOLE: S("CONSOLE [桁数]", "印字の 1 行の桁数", "Columns in a printed line", "1〜160。", "1 to 160."),
  LF: S("LF [行数]", "紙を送る", "Feed the paper", undefined, undefined, PLOTTER),
  CSIZE: S("CSIZE 式 [,{A | K}]", "文字の大きさ", "Size of the characters", "1〜15。1 が最小、2 以上はその倍数。", "1 to 15; 1 is the smallest, others are multiples.", PLOTTER),
  COLOR: S("COLOR 色", "ペンの色", "Pen color", "0 黒、1 青、2 緑、3 赤。", "0 black, 1 blue, 2 green, 3 red.", PLOTTER),
  GRAPH: S("GRAPH", "グラフィックモードにする", "Go to graphic mode", undefined, undefined, PLOTTER),
  LTEXT: S("LTEXT", "テキストモードに戻す", "Go back to text mode", undefined, undefined, PLOTTER),
  SORGN: S("SORGN", "ペンの位置を原点にする", "Make the pen's place the origin", undefined, undefined, PLOTTER),
  GLCURSOR: S("GLCURSOR (式, 式)", "ペンを動かす", "Move the pen", undefined, undefined, PLOTTER),
  LLINE: S("LLINE [(式, 式)]-(式, 式) [,線種] [,色] [,B] ⏎ LLINE [(式, 式)]-(式, 式)-(式, 式)... [,線種] [,色]", "線を引く", "Draw a line", "線種 0〜15、色 0〜3。`B` は四角。折れ線は始点を含めて 6 点まで。", "Pattern 0 to 15, color 0 to 3. `B` draws a box. A line through up to 6 points with the first.", PLOTTER),
  RLINE: S("RLINE (式, 式)-(式, 式) [,線種] [,色] [,B]", "ペンの位置から線を引く", "Draw a line from the pen's place", undefined, undefined, PLOTTER),
  CIRCLE: S("CIRCLE (式, 式), 半径 [,色][,開始角][,終了角][,縦横比][,ピッチ][,扇形]", "円・弧・扇形を描く", "Draw a circle, an arc or a pie", undefined, undefined, PLOTTER),
  PAINT: S("PAINT パターン [,色]", "四角の中を網掛けする", "Hatch the box drawn", "パターン 0〜10。", "Pattern 0 to 10.", PLOTTER),
  CROTATE: S("CROTATE 向き", "文字の向き", "Direction of the characters", "0〜3、90 度ずつ。", "0 to 3, 90 degrees each.", PLOTTER),
  // Functions: numbers
  ABS: F("ABS 式", "絶対値", "Absolute value"),
  ACS: F("ACS 式", "逆余弦", "Arc cosine", ANGLE_JA, ANGLE_EN),
  AHC: F("AHC 式", "逆双曲線余弦", "Inverse hyperbolic cosine"),
  AHS: F("AHS 式", "逆双曲線正弦", "Inverse hyperbolic sine"),
  AHT: F("AHT 式", "逆双曲線正接", "Inverse hyperbolic tangent"),
  ASN: F("ASN 式", "逆正弦", "Arc sine", ANGLE_JA, ANGLE_EN),
  ATN: F("ATN 式", "逆正接", "Arc tangent", ANGLE_JA, ANGLE_EN),
  COS: F("COS 式", "余弦", "Cosine", ANGLE_JA, ANGLE_EN),
  CUB: F("CUB 式", "3 乗", "Cube"),
  CUR: F("CUR 式", "立方根", "Cube root"),
  DECI: F("DECI 式", "16 進の値を 10 進に変える", "Hexadecimal to decimal"),
  DEG: F("DEG 式", "度分秒（dd.mmss）を度に変える", "Degrees, minutes, seconds (dd.mmss) to degrees"),
  DMS: F("DMS 式", "度を度分秒（dd.mmss）に変える", "Degrees to degrees, minutes, seconds (dd.mmss)"),
  EXP: F("EXP 式", "e の累乗", "e to the power"),
  FACT: F("FACT 式", "階乗", "Factorial"),
  HCS: F("HCS 式", "双曲線余弦", "Hyperbolic cosine"),
  HEX: F("HEX 式", "10 進の値を 16 進に変える（文字列は `HEX$`）", "Decimal to hexadecimal (`HEX$` for a string)"),
  HSN: F("HSN 式", "双曲線正弦", "Hyperbolic sine"),
  HTN: F("HTN 式", "双曲線正接", "Hyperbolic tangent"),
  INT: F("INT 式", "整数部", "Integer part"),
  LN: F("LN 式", "自然対数", "Natural logarithm"),
  LOG: F("LOG 式", "常用対数", "Common logarithm"),
  MDF: F("MDF(式 [,しきい値])", "`USING` の桁で丸める", "Round to the digits of `USING`"),
  NCR: F("NCR(式, 式)", "組み合わせ nCr", "Combinations nCr"),
  NPR: F("NPR(式, 式)", "順列 nPr", "Permutations nPr"),
  PI: F("PI", "円周率", "Pi"),
  POL: F("POL(式, 式)", "直交座標を極座標に変える", "Rectangular to polar", "距離が Y、角度が Z に入る。", "The distance goes in Y, the angle in Z."),
  RCP: F("RCP 式", "逆数", "Reciprocal"),
  REC: F("REC(式, 式)", "極座標を直交座標に変える", "Polar to rectangular", "x が Y、y が Z に入る。", "x goes in Y, y in Z."),
  RND: F("RND 式", "乱数", "Random number", "1 未満なら 0 以上 1 未満、整数 n なら 1〜n。", "Less than 1: from 0 up to 1. An integer n: 1 to n."),
  ROT: O("式 ROT 式", "累乗根（y ROT x は y の x 乗根）", "Root (y ROT x is the x-th root of y)"),
  SGN: F("SGN 式", "符号（1、0、-1）", "Sign (1, 0, -1)"),
  SIN: F("SIN 式", "正弦", "Sine", ANGLE_JA, ANGLE_EN),
  SQR: F("SQR 式", "平方根", "Square root"),
  SQU: F("SQU 式", "2 乗", "Square"),
  TAN: F("TAN 式", "正接", "Tangent", ANGLE_JA, ANGLE_EN),
  TEN: F("TEN 式", "10 の累乗", "10 to the power"),
  AND: O("式 AND 式", "論理積", "And", BITS_JA, BITS_EN),
  OR: O("式 OR 式", "論理和", "Or", BITS_JA, BITS_EN),
  XOR: O("式 XOR 式", "排他的論理和", "Exclusive or", BITS_JA, BITS_EN),
  NOT: F("NOT 式", "否定", "Not", BITS_JA, BITS_EN),
  // Functions: strings
  ASC: F("ASC 文字列", "先頭の文字のコード", "Code of the first character"),
  "CHR$": F("CHR$ 式", "コードの文字", "The character of a code", "0〜255。", "0 to 255."),
  "HEX$": F("HEX$ 式", "16 進の文字列にする", "A hexadecimal string"),
  "LEFT$": F("LEFT$(文字列, 文字数)", "左から取り出す", "Characters from the left"),
  "MID$": F("MID$(文字列, 番号, 文字数)", "途中から取り出す", "Characters from the middle", "番号は 1 から。文字数は省けない。", "Counts from 1. The count cannot be left out."),
  "RIGHT$": F("RIGHT$(文字列, 文字数)", "右から取り出す", "Characters from the right"),
  LEN: F("LEN 文字列", "文字数", "Number of characters"),
  "STR$": F("STR$ 式", "数値を文字列にする", "A number as a string"),
  VAL: F("VAL 文字列", "文字列を数値にする", "A string as a number", "`&H` の 16 進も読む。読めない文字の手前まで（式の計算は `EVAL`）。", "Takes `&H` hexadecimal too, up to a character it cannot read (`EVAL` works out expressions)."),
  EVAL: F("EVAL 文字列", "文字列の式を計算する", "Work out an expression in a string"),
  // Functions: the machine
  "INKEY$": F("INKEY$", "押されているキー（なければ空）", "The key held (empty when none)", "待たない。", "Does not wait."),
  POINT: F("POINT(式, 式)", "点の状態（1 = 点灯）", "Whether a dot is on (1)", "X 0〜239、Y 0〜31。画面の外は -1。", "X 0 to 239, Y 0 to 31; -1 outside the screen."),
  PEEK: F("PEEK アドレス", "メモリを読む", "Read memory"),
  FRE: F("FRE 0 ⏎ FRE 1", "空きバイト数", "Free bytes", "0 は整理してから正確に、1 は概算。", "0 tidies up and counts; 1 is an estimate."),
  ERL: F("ERL", "エラーの行番号", "Line of the last error"),
  ERN: F("ERN", "エラーの番号", "Number of the last error"),
  EOF: F("EOF(ファイル番号)", "ファイルの終わりなら -1", "-1 at the end of a file"),
  LOC: F("LOC(ファイル番号)", "読み書きしたレコード（256 バイト）の数", "Records (256 bytes) read or written"),
  LOF: F("LOF(ファイル番号)", "ファイルの大きさ", "Size of a file"),
  DSKF: F("DSKF(式) ⏎ DSKF(\"d:\")", "ディスクの空き容量", "Free bytes of a disk", "1 ポケットディスク、3 が E:、4 が F:（`\"E:\"` などとも書ける）。", "1 pocket disk, 3 E:, 4 F: (or written `\"E:\"` and so on)."),
  AER: F("AER 番号 [(式, 式, ...)]", "AER モードの式を計算する", "Work out an expression of AER mode"),
  "MEM$": F("MEM$ ⏎ MEM$=\"S2\"", "RAM カードの使い方（代入もできる）", "How the RAM card is used (can be set)", "`S1`、`S2`、`B`。", "`S1`, `S2`, `B`.", { kinds: ["function", "statement"] }),
  "BTEXT$": F("BTEXT$ ⏎ BTEXT$=\"S1:ファイル名\"", "今のプログラムのメモリブロック（代入で切り替える）", "The memory block of the program in use (can be set)", "ふだんは `S1:TEXT.BAS`。ない名前なら空のプログラムを作る。", "Normally `S1:TEXT.BAS`. A new name makes an empty program.", { kinds: ["function", "statement"] }),
  "BDATA$": F("BDATA$ ⏎ BDATA$=\"S1:ファイル名\"", "今の変数のメモリブロック（代入で切り替える）", "The memory block of the variables in use (can be set)", "ふだんは `S1:DATA.BAS`。", "Normally `S1:DATA.BAS`.", { kinds: ["function", "statement"] })
};

/** Keywords of the ROM's dictionary with nothing known to say about them. */
export const UNKNOWN: ReadonlySet<string> = new Set();

/** The keyword of a word in a program: "input#" is INPUT, "KEY$" is KEY. */
export function keywordOf(word: string): string | undefined {
  const w = word.toUpperCase();
  if (Object.hasOwn(BASIC_HELP, w)) return w;
  const bare = w.replace(/[$#?]$/, "");
  return bare !== w && ((w.endsWith("$") && ["KEY", "INPUT", "OPEN"].includes(bare)) || (w.endsWith("#") && ["INPUT", "PRINT"].includes(bare)) || (w.endsWith("?") && ["LOAD", "CLOAD"].includes(bare))) ? bare : undefined;
}

/** A keyword's explanation as Markdown, after its forms. */
export function notes(help: BasicHelp): string {
  const parts = [L(help.ja, help.en) + (/[。.]$/.test(L(help.ja, help.en)) ? "" : L("。", "."))];
  const note = L(help.noteJa ?? "", help.noteEn ?? "");
  if (note) parts.push(note);
  if (help.structured) parts.push(L("ROM 8.3 以降（PC-E500S、PC-U6000、PC-E650）。", "ROM 8.3 and later (PC-E500S, PC-U6000, PC-E650)."));
  if (help.plotter) parts.push(L("プリンタ CE-515P 用。", "For the CE-515P plotter."));
  return parts.join("\n\n");
}
