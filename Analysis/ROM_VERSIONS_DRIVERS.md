# PC-E500 シリーズ ROM 版ごとの違い：E8000h〜EBFFFh 帯（行列演算・装置ドライバ・メッセージ表）

手元の ROM イメージ 11 本（`Emulator/app/rom/`）の E8000h〜EBFFFh 帯を比べ、違いをまとめたもの。この帯は BASIC 命令の処理からは直接たどれない処理（FUNC 装置の行列演算）と、カセット・プリンタ・RS-232C・CE-140F の装置ドライバ、BASIC のエラーメッセージ表からなる。BASIC の違いは [ROM_VERSIONS_BASIC.md](ROM_VERSIONS_BASIC.md)、IOCS・表示・キー入力の違いは [ROM_VERSIONS_SYSTEM.md](ROM_VERSIONS_SYSTEM.md) にある。版番号の読み方（上位桁＝改訂、下位桁＝機種コード）と ROM の一覧は [ROM_VERSIONS_BASIC.md](ROM_VERSIONS_BASIC.md) §1 を参照。

## 確度の表し方

| 表記 | 意味 |
|---|---|
| **実験** | エミュレータ（`Emulator/bin/e500core.dll`）上で全 ROM に同じ操作をして違いを確かめた |
| **コード** | 逆アセンブル・データの比較で違いを確かめた。挙動は試していない |
| **推定** | コードの形から目的を推し量ったもの |

## 1. 帯の中身

番地は 3.2 と 8.5 のもの。装置の入口は IOCS ヘッダ（[IOCS_REFERENCE.md](IOCS_REFERENCE.md)）から引いた。

| 内容 | 3.2 | 8.5 | 備考 |
|---|---|---|---|
| FUNC 装置（device 9）の行列演算 | `E81B7h`〜`E99xxh` | `E8000h`〜 | `[BFEE3h]` の演算番号で処理を選ぶ。FUNC 装置の入口自体は `EF2FDh`（3.2）。メインメニューの MATRIX モードの計算と見られる（推定） |
| BASIC のエラーメッセージ表 | `E967Bh` | 拡張 ROM `30A4Ah` | §2.2 |
| カセット（CAS:、device 4） | `E99C2h` | `E96DEh` | |
| プリンタ（STDL:PRN:、device 3） | `EA797h` | `EA4B3h` | 文字変換 `EA9C3h`（3.2） |
| RS-232C（COM:、device 2） | `EAD6Ah` | `EAA86h` | |
| CE-140F（X:Y:、device 7） | `EB965h` | `EB681h` | 後ろに BASIC のファイル命令が使う処理が続く |

## 2. 改訂ごとの変更

改訂 2→3、3→5、6→7 では、この帯に機能の変更はない（コードのずれに伴う表の再配置だけ）。

### 2.1 改訂 5 → 6：行列演算のピボット選択

| 番地 | 変更 | 確度 |
|---|---|---|
| 6.2 `E88A5h`、6.3 `E88AFh` | 行列演算の最大要素の探索（行・列の添字 `($BA)`〜`($BF)` で回るループ。ガウス消去の部分ピボット選択と見られる）で、それまでの最大値を読み出した直後（`CALL E9525h` の後）に符号を消す `AND (BP+0),F7h` を追加した（同じ命令が 2 つ続いている）。旧版は候補の要素は絶対値にして比べるが、最大値を更新するときは要素を符号付きのまま保存し（3.2 `E88BCh`〜`E88C5h`）、次の比較でもそのまま使っていた | 実験 |

改訂 6 以降の全機種（6.2・6.3・6.4・7.x・8.x）に入っている。旧版では、いったん負の要素が最大値になると、それより絶対値の小さい要素（0 も含む）が「大きい」と判定されてピボットに選ばれる。0 が選ばれると、逆行列を持つ行列でも 0 で割ってしまう。

この処理は 4 行以上の行列だけが通る（`E85B9h` で行数 `($BE)` が 1〜3 なら専用の処理へ分かれ、それ以外が `E8842h` の一般の消去法へ進む）。MATRIX モードで次の 4×4 行列を X に入れ、CALC の `X⁻¹` を実行すると、2.1・2.2・3.2・5.3 は `DIVISION BY ZERO` を出し、6.3・6.2・7.2・7.5・6.4・8.4・8.5 は逆行列を返す（X(1,1)=0.156626506、正しい値 0.1566265060…）。行列式は 1494 で、`detX` はどの版も正しく 1494 を返す（行列式は別の処理）。

```text
 1   2   3   4
-10  5   6   7
 0   8   9   1
 0   2   7   3
```

操作: メインメニューで MATRIX → `X-DIM` で 4、4 → 要素を行の順に入れる（負の数は数字の後に `+/-`）→ `CALC` → `X⁻¹`。1 列目が 1 → −10（最大値が負になる）→ 0（0 が「大きい」と判定される）の順に並ぶのが条件である。3×3 の行列（`1 2 3 / -10 5 6 / 0 8 9`）や、1 列目に 0 を含まない 4×4 では旧版も正しく計算した。

### 2.2 改訂 7 → 8：エラーメッセージ表の移動と追加

エラーメッセージ表は `\0` 区切りの文字列を 1 番から順に並べたもので、番号のない位置は空文字列になっている。改訂 7 まで（2.1〜7.5、1490UII の 6.4 を含む）の 9 本は、番号・文言とも完全に一致する（43 種、1〜90 番）。

改訂 8（8.4、8.5）では表が拡張 ROM の `30A4Ah` に移り、構造化構文（[ROM_VERSIONS_BASIC.md](ROM_VERSIONS_BASIC.md) §3.5）用に次の変更がある。8.4 と 8.5 は同じ内容である。

| 番号 | 改訂 7 まで | 改訂 8 |
|---|---|---|
| 41 | GOSUB or FOR nesting exceeded | GOSUB,FOR,REPEAT,WHILE or SWITCH nesting exceeded |
| 52 | （なし） | Block IF without ENDIF |
| 53 | （なし） | UNTIL without REPEAT |
| 54 | （なし） | WHILE without WEND |
| 55 | （なし） | WEND without WHILE |
| 57 | （なし） | Illegal CASE or DEFAULT |
| 59 | （なし） | SWITCH,CASE or DEFAULT without ENDSWITCH |
| 60 | （なし） | CASE,DEFAULT or ENDSWITCH without SWITCH |

確度: コード（文字列データの比較）。

改訂 7 までの 43 種（番号: 文言）:

| 番号 | 文言 | 番号 | 文言 |
|---|---|---|---|
| 1 | Syntax error | 45 | Buffer space exceeded |
| 2 | Direct command error | 46 | String too long |
| 3 | Mode error | 47 | Line buffer overflow |
| 4 | Can't continue | 48 | RESUME without error |
| 5 | Program not exist | 51 | Out of memory |
| 11 | Overflow | 61 | Can't print in specified format |
| 12 | Division by Zero | 62 | USING format error |
| 13 | Illegal function call | 63 | I/O error |
| 21 | Duplicate Definition | 64 | Too many files open |
| 22 | Array specified without DIM | 65 | NAME error |
| 23 | Subscript out of range | 66 | Bad drive name |
| 24 | Data out of range | 67 | File write protected |
| 31 | Undefined line | 68 | Disk full |
| 32 | Illegal line number | 71 | Tape read error |
| 35 | Bad line number | 73 | Verify error |
| 41 | GOSUB or FOR nesting exceeded | 75 | Printer error |
| 42 | RETURN without GOSUB | 76 | File not open |
| 43 | NEXT without FOR | 77 | File already open |
| 44 | Out of data | 78 | Input past end |
| 81 | Type mismatch | 85 | File not found |
| 83 | Password mismatch | 86 | Bad file name |
| 84 | Invisible program | 90 | Low battery |

## 3. 機種による違い

### 3.1 プリンタの文字変換（PRN: の 1 文字出力）

CE-126P へ送る前に文字コードを変換する処理は 3 種類ある。変換処理の番地は 3.2 で `EA9C3h`（他の版は下表）。

| 型 | 版 | 変換処理 |
|---|---|---|
| A | 2.1、2.2、3.2、6.2、7.2、7.5、8.4、8.5 | 2.1 `EB26Dh`、2.2 `EAAC0h`、3.2 `EA9C3h`、6.2・7.x `EA9C9h`、8.4 `EAE00h`、8.5 `EA6DFh` |
| B | 5.3、6.3 | 5.3 `EA9CDh`、6.3 `EA9D3h` |
| C | 6.4 | `EB126h` |

| 入力 | 型 A | 型 B | 型 C |
|---|---|---|---|
| 00h〜1Fh、7Fh | 20h（空白） | 20h | 20h |
| `0`（30h） | F0h | F0h | F0h |
| `O`（4Fh） | 30h | 30h | 30h |
| `\`（5Ch） | そのまま | 0Bh | そのまま |
| その他の 20h〜7Eh | そのまま | そのまま | そのまま |
| 80h〜9Fh | 20h | 20h | そのまま |
| A0h〜DFh（カナ） | そのまま | 20h | そのまま |
| E0h〜E7h | 20h | 20h | そのまま |
| E8h〜EBh | +0Dh（F5h〜F8h） | 20h | そのまま |
| ECh〜F0h | 20h | 20h | そのまま |
| F1h | F4h | 20h | そのまま |
| F2h〜F4h | −1（F1h〜F3h） | 20h | そのまま |
| F5h〜FFh | 20h | 20h | そのまま |

`0` と `O` の入れ替えは、プリンタ側の字形の違い（スラッシュ付きゼロ）に合わせたものと見られる（推定）。型 B は欧文の文字セットを持つ機種コード 3 の ROM で、プリンタで印字できない 80h 以上を空白にしている（[ROM_VERSIONS_SYSTEM.md](ROM_VERSIONS_SYSTEM.md) §3.1）。型 C（6.4）は `CMP A,80h` の直後の分岐がなく、80h 以上を素通しする。同じ機種コード 4 でも 8.4 は型 A に戻っている。

確度: コード（変換処理の読み取り）。あわせて全 ROM で `CHR$(1)`〜`CHR$(255)` を LPRINT し、エミュレータの CE-126P が受け取った内容を比べた（実験）。型 A と型 C では表のとおりの違いが出て、型 B では 5Ch と 80h 以上が紙に出ない。ただしエミュレータの CE-126P は、型 A の変換を元に戻し、20h 未満を捨て、行末の空白を削ってから記録する（`Emulator/src/native/ce126p.cpp` の `toE500`）。型 B の 0Bh が見えないのはこのためで、ROM が送るバイト列そのものは上の表のとおりである。

### 3.2 行列演算の追加機能（機種コード 1・4）

PC-1480U（2.1）、PC-1490UII（6.4）、PC-U6000（8.4）だけが、FUNC 装置の行列演算に追加の処理を持つ。

| 箇所 | 機種コード 1・4 | それ以外 | 確度 |
|---|---|---|---|
| 演算番号の振り分け（6.2 `E8F67h`、6.4 `E8E0Ch`） | 0〜6 をこの経路で処理する（`CMP A,07h` / `JRNC`） | 0 だけをこの経路で処理する（`CMP A,00h` / `JRNZ`） | コード |
| `[BFEE3h]` bit3 の分岐（6.4 `E8E84h`、`E91D3h`、`E9261h` など） | bit3 が立っていれば追加の演算列（6.4 `E92ADh`〜、要素を順に取り出して四則演算と関数を組み合わせる長い計算）へ進む | 分岐なし | コード |
| 要素数 | `[BFEE3h]` bit0 で 3 個と 4 個を切り替える処理がある（2.1 `E9A2Bh` など） | なし | コード |

何の演算かは確かめていない。要素を 3 個・4 個単位で扱うことから、ベクトルや 3×3・4×4 の行列に関する演算と見られる（推定）。表示側の対応は [ROM_VERSIONS_SYSTEM.md](ROM_VERSIONS_SYSTEM.md) §3.3。

### 3.3 RS-232C（COM:）

PC-1480U（2.1）と他機種の違い。番地は 2.2 のもの。

| 番地 | 2.2 以降 | 2.1 | 確度 |
|---|---|---|---|
| `EB05Eh`〜`EB066h` | 送受信を始める処理（`[BFC56h]` bit1 を立てる側）で、`[BFD34h]` bit6 が立っていれば `[BFD61h]` の 1 文字を扱う | なし | コード |
| `EB075h`〜`EB080h` | 送受信を終える処理（`[BFC56h]` bit1 を消す側）で、bit4 が立っていれば `[BFD62h]` の 1 文字を `EB428h` に渡す | なし | コード |
| `EB04Ah`、`EB098h` | `[BFD34h]` の設定を bit7 だけ立て、bit7 だけ消す（`80h`、`7Fh`） | bit7・bit6 をまとめて立て、まとめて消す（`C0h`、`3Fh`） | コード |
| `EAF04h` | 送信前に `EB41Ch` を呼び、使う設定値を `[BFD39h]` から `[BFD60h]` に変更 | — | コード |

`[BFD61h]`・`[BFD62h]` は開始・終了時に送る制御文字の設定と見られる（推定）。

### 3.4 カセット（CAS:）と CE-140F（X:Y:）

PC-1480U（2.1）と他機種の違い。

| 装置 | 内容 | 確度 |
|---|---|---|
| CAS: | 2.1 はファイル名の `?` を空白に置き換えてからコピーする（2.1 `EA4D4h`）。2.2 以降はこの置き換えがない | コード |
| CAS: | 2.2 以降は、ヘッダの 10 バイトを照合して 8 バイト読み飛ばす処理（2.2 `EA07Bh`〜）と、それを使う分岐（2.2 `E9F85h`）がある。2.1 にはない | コード |
| ファイル入出力の共通処理（SAVE・LOAD・OPEN などと COM: が使う） | 2.1 はヘッダの種別（10h）を確かめた後に `(BP+22h)` bit0 の判定がある（2.1 `EBE90h`）。2.2 以降はない | コード |

## 4. 早見表

○はその処理・データを持つ。

| 項目 | 2.1 | 2.2 | 3.2 | 5.3 | 6.3 | 6.2 | 7.2 | 7.5 | 6.4 | 8.4 | 8.5 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ピボット選択の絶対値化（§2.1） | | | | | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| 構造化構文のエラーメッセージ（§2.2） | | | | | | | | | | ○ | ○ |
| プリンタ変換 型 A（§3.1） | ○ | ○ | ○ | | | ○ | ○ | ○ | | ○ | ○ |
| プリンタ変換 型 B | | | | ○ | ○ | | | | | | |
| プリンタ変換 型 C | | | | | | | | | ○ | | |
| 行列演算の追加機能（§3.2） | ○ | | | | | | | | ○ | ○ | |
| COM: の開始・終了文字（§3.3） | | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ |

すべてバイト列の照合で全 ROM を調べた。ピボット選択（§2.1）は、加えて全 11 本で 4×4 の逆行列を計算して確かめた（実験）。

## 5. 調べ方

[ROM_VERSIONS_BASIC.md](ROM_VERSIONS_BASIC.md) §7 と同じ方法（逆アセンブル、番地を伏せた命令列の差分、呼出し元の逆引き、バイト列の照合）に、次の 2 つを加えた。

- 呼出し元の逆引きの名札に、ROM 8.5 の IOCS・FCS のコマンド入口（[IOCS_REFERENCE.md](IOCS_REFERENCE.md)）を使った。8.5 の入口番地を、命令列の対応から各 ROM の番地へ写して使っている。
- プリンタは、エミュレータの CE-126P を有効にして `FOR I=a TO b:LPRINT CHR$(I);:NEXT I:LPRINT` を 32 文字ずつ実行し、`e500_printer_read` で受け取った内容を比べた。
