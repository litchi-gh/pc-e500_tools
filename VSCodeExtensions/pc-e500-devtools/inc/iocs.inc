; iocs.inc: PC-E500 の IOCS（デバイスと番号に名前を付けたもの）
;
;         MV    (CL),DEV_SCRN      ; デバイス
;         MV    (CH),0             ; ドライブ
;         MV    IL,SCRN_PUTS       ; 番号
;         CALLF IOCS               ; C=1 なら A にエラー番号
;
; 名前は値を置き換えるだけで、プログラムの大きさは変わらない。

; エントリ
IOCS                    EQU $FFFE8  ; IOCS のエントリ（CALLF IOCS。IL = 番号）
FCS                     EQU $FFFE4  ; FCS（ファイル制御）のエントリ（CALLF FCS。IL = 番号）

; 引数を入れる内部 RAM
BL                      EQU $D4     ; 引数
BH                      EQU $D5     ; 引数
BX                      EQU $D4     ; 引数（BL と BH の 2 バイト）
CL                      EQU $D6     ; デバイス番号
CH                      EQU $D7     ; ドライブ番号
CX                      EQU $D6     ; デバイスとドライブ（2 バイト）
DL                      EQU $D8     ; 引数
DH                      EQU $D9     ; 引数
DX                      EQU $D8     ; 引数（DL と DH の 2 バイト）
SI                      EQU $DA     ; 引数（3 バイト）
DI                      EQU $DD     ; 引数（3 バイト）

; デバイス番号（CL に入れる）
DEV_SCRN                EQU $00     ; 画面（STDO: SCRN:）
DEV_KYBD                EQU $01     ; キーボード（STDI: KYBD:）
DEV_COM                 EQU $02     ; シリアル（COM:）
DEV_PRN                 EQU $03     ; プリンタ（STDL: PRN:）
DEV_CAS                 EQU $04     ; テープ（CAS:）
DEV_RAMDISK             EQU $05     ; RAM ディスク（E: F: G:）
DEV_MEM                 EQU $06     ; メモリブロック（S1: S2: S3:）
DEV_DISK                EQU $07     ; ポケットディスク（X: Y:）
DEV_SYSTM               EQU $08     ; システム（SYSTM:）

; どのデバイスにもある番号（IL に入れる）
IO_FIND_DRIVE           EQU $00     ; ドライブ名から番号を調べる: X = ドライブ名（: まで） → (CL) = デバイス、(CH) = ドライブ、X = 名前の次、C=1 なら A = 01h: ない
IO_FIND_HEADER          EQU $01     ; デバイス番号からヘッダを調べる: (CL) = デバイス → X = ヘッダのアドレス、C=1 なら A = 01h: ない
IO_FIND_HEADER_FROM     EQU $02     ; 指定のヘッダから先を調べる: (CL) = デバイス、X = 調べ始めるヘッダ → X = ヘッダのアドレス、C=1 なら A = 01h: ない
IO_DRIVE_NAME           EQU $03     ; 番号からドライブ名を調べる: (CL) = デバイス、(CH) = ドライブ、X = 6 バイトの場所 → [X] = 名前と :（残りは 20h）、X = 次のアドレス、C=1 なら A = 01h: ない
IO_FORMAT_DRIVE         EQU $04     ; ドライブ名を指定してフォーマット: X = ドライブ名（空白で 6 文字）+ 設定の文字列 → C=1 なら A = BASIC のエラー番号
IO_INIT_ALL             EQU $05     ; すべてのデバイスの初期化: A = 0: 全リセット、1: リセット、2: 電源 OFF、3: 電源 ON
IO_OPEN                 EQU $08     ; 開く: X = ファイル名（12 バイト）、A = 1: 読む、2: 書く、3: 両方 → C=1 ならエラー（A = エラー番号）
IO_CLOSE                EQU $09     ; 閉じる
IO_READ_BLOCK           EQU $0A     ; ブロックの読み出し: X = 読み込む先、Y = バイト数 → X = 次のアドレス、Y = 読めたバイト数、C=1 ならエラー（A = エラー番号）
IO_WRITE_BLOCK          EQU $0B     ; ブロックの書き込み: X = 先頭アドレス、Y = バイト数 → X = 次のアドレス、Y = 書けたバイト数、C=1 ならエラー（A = エラー番号）
IO_READ                 EQU $0C     ; 1 バイトの読み出し → A = データ、C=1 ならエラー（A = エラー番号）
IO_WRITE                EQU $0D     ; 1 バイトの書き込み: A = データ → C=1 ならエラー（A = エラー番号）
IO_PEEK                 EQU $0E     ; 1 バイトの非破壊読み出し → A = データ、C=1 ならエラー（A = エラー番号）
IO_FORMAT               EQU $3F     ; フォーマット（BASIC の INIT）: X = 設定の文字列 → X = 次のアドレス、C=1 なら A = BASIC のエラー番号
IO_INIT                 EQU $40     ; 初期化: A = 0: 全リセット、1: リセット、2: 電源 OFF、3: 電源 ON → C=1 ならエラー（A = エラー番号）

; 画面（CL = DEV_SCRN）
SCRN_PUTC               EQU $41     ; 指定位置へ 1 文字表示: (BL) = x 座標（0〜39）、(BH) = y 座標（0〜3）、A = 文字 → (BL)(BH) = 次の位置、C=1: 範囲外
SCRN_PUTS               EQU $42     ; 指定位置へ n 文字表示（右端で止まる）: (BL) = x 座標（0〜39）、(BH) = y 座標（0〜3）、X = 文字列の先頭、Y = 長さ → (BL)(BH) = 次の位置、X = 次のアドレス、Y = 残り、C=1: 途中で止まった
SCRN_CURSOR             EQU $44     ; カーソルの位置: (BL) = x 座標（0〜39）、(BH) = y 座標（0〜3） → C=1: 範囲外
SCRN_CURSOR_TYPE        EQU $45     ; カーソルの形: A = 0: なし。ビット 5 = 表示、3 = 点滅、2〜0 = 0 下線、1 二重下線、2 ■、3 空白、4 挿入
SCRN_SYMBOL             EQU $46     ; 表示シンボル: (BL) = 0: 電池、1: DBL PRO RUN BUSY、2: 2ndF CAPS hyp カナ 小文字、3: DE G RAD E PRINT。A = 点けるビット（右端がビット 0）
SCRN_SCROLL_UP          EQU $47     ; 上へスクロール: (BX) = 0、A = 行数
SCRN_SCROLL_DOWN        EQU $48     ; 下へスクロール: (BX) = 0、A = 行数
SCRN_CLEAR_LINE         EQU $49     ; 1 行を消す: (BH) = 行（0〜3）
SCRN_DOTS_WRITE         EQU $4A     ; 縦 8 ドットを表示: X = x 座標（0〜239）、Y = y 座標（0〜31）、A = 8 ドット（ビット 0 が上）、[DOTSOP] = 0: 点灯、1: 消灯、2: 反転
SCRN_DOTS_READ          EQU $4B     ; 縦 8 ドットを読む: X = x 座標（0〜239）、Y = y 座標（0〜31） → A = 8 ドット（ビット 0 が上）
SCRN_PSET               EQU $4C     ; 1 ドットを表示: X = x 座標（0〜239）、Y = y 座標（0〜31）、A = 0: 点灯、1: 消灯、2: 反転
SCRN_POINT              EQU $4D     ; 1 ドットを読む: X = x 座標（0〜239）、Y = y 座標（0〜31） → A = 1: 点灯
SCRN_LINE               EQU $4E     ; 線を引く: X, Y = 始点、(BX) = 終点の x、(DX) = 終点の y（どちらも 2 バイト）、[DOTSOP] = 0: 点灯、1: 消灯、2: 反転、[LINPTN] = 線種（2 バイト） → X, Y = 終点
SCRN_BOX                EQU $4F     ; 四角を塗る: X, Y = 角、(BX) = 対角の x、(DX) = 対角の y（どちらも 2 バイト）、[DOTSOP] = 0: 点灯、1: 消灯、2: 反転、[LINPTN] = 模様（2 バイト）
SCRN_POWER              EQU $50     ; 表示の ON / OFF: A = 0: OFF、1: ON
SCRN_CLEAR              EQU $51     ; 画面を消す
SCRN_CLEAR_CHARS        EQU $52     ; 指定位置から n 文字消す: (BL) = x 座標（0〜39）、(BH) = y 座標（0〜3）、A = 文字数（次の行へ続く）
SCRN_INSERT             EQU $54     ; 行を挿入: (BH) = 行、A = 行数
SCRN_ROW_READ           EQU $55     ; 1 行のドットを読む: (BH) = 行（0〜3）、X = 読み込む先（240 バイト。x = 0〜119、続けて 239〜120 の順）
SCRN_ROW_WRITE          EQU $56     ; 1 行のドットを書く: (BH) = 行（0〜3）、X = データ（240 バイト、縦 8 ドットずつ。x = 0〜119、続けて 239〜120 の順）
SCRN_PUTC_ANY           EQU $57     ; 表示範囲に関係なく 1 文字表示: (BL) = x 座標（0〜39）、(BH) = y 座標（0〜3）、A = 文字 → (BL)(BH) = 次の位置、C=1: 画面の外
SCRN_GUIDE              EQU $58     ; [ ] 付きの表示（メニュー）: (BL) = x 座標（0〜39）、(BH) = y 座標（0〜3）、A = 個数、B のビット 0 = 0: [ ]、1: ( )、ビット 7 = 1: 行を消さない、X = 文字列の並び（それぞれ FFh で終わる。7 文字まで）

; キーボード（CL = DEV_KYBD）
KYBD_MATRIX             EQU $41     ; 行列コードの読み出し（押されるまで待つ） → B = 1: 入力あり、0: なし。A のビット 0〜6 = 行列コード、ビット 7 = 1: 離した
KYBD_PEEK               EQU $42     ; 行列コードの非破壊読み出し（待たない） → B = 1: 入力あり、0: なし。A のビット 0〜6 = 行列コード、ビット 7 = 1: 離した
KYBD_READ               EQU $43     ; キーの読み出し（文字）: A のビット 7 = 0: 待たない、1: 待つ → IL = 1: 入力あり、0: なし。A = 文字（00h なら B = 拡張コード）、C=1 ならエラー（A = エラー番号）
KYBD_SET                EQU $44     ; キーバッファに入れる: X = データ、A = バイト数
KYBD_CLEAR              EQU $45     ; キーバッファを空にする
KYBD_FKEYS              EQU $46     ; ファンクションキーの表示 → C=1: 4 行表示だった

; シリアル（CL = DEV_COM）
COM_PUT                 EQU $41     ; 1 バイト送る: A = データ → C=1 なら A = 00h: 時間切れ、FEh: 電池、FFh: BREAK
COM_GET                 EQU $42     ; 1 バイト受ける → A = データ。C=1 なら A = 00h: 時間切れ、FEh: 電池、FFh: BREAK
COM_SETUP               EQU $43     ; 作業域の条件をハードウェアに設定
COM_RS_HIGH             EQU $44     ; RS を High
COM_RS_LOW              EQU $45     ; RS を Low
COM_RR_HIGH             EQU $46     ; RR を High
COM_RR_LOW              EQU $47     ; RR を Low
COM_ER_HIGH             EQU $48     ; ER を High
COM_ER_LOW              EQU $49     ; ER を Low
COM_CS                  EQU $4A     ; CS を読む → C = 1: High
COM_CD                  EQU $4B     ; CD を読む → C = 1: High

; プリンタ（CL = DEV_PRN）
PRN_PUT                 EQU $41     ; 印字: A = データ → C=1: エラー
PRN_POSITION            EQU $42     ; 印字位置 → A = 位置
PRN_CHECK               EQU $43     ; プリンタの確認 → A = 種類、I = 桁数。C=1: つながっていない（A = 54h）

; テープ（CL = DEV_CAS）
CAS_WRITE               EQU $41     ; データの書き込み: X = アドレス、Y = バイト数 → X = 次のアドレス、Y = 処理したバイト数、C=1 ならエラー（A = エラー番号）
CAS_READ                EQU $42     ; データの読み出し: X = アドレス、Y = バイト数 → X = 次のアドレス、Y = 処理したバイト数、C=1 ならエラー（A = エラー番号）
CAS_VERIFY              EQU $43     ; データの照合: X = アドレス、Y = バイト数 → X = 次のアドレス、Y = 処理したバイト数、C=1 ならエラー（A = エラー番号）
CAS_WRITE_HEADER        EQU $44     ; ヘッダの書き込み: X = ヘッダ（48 バイト）のアドレス → X = 次のアドレス、Y = 処理したバイト数、C=1 ならエラー（A = エラー番号）
CAS_READ_HEADER         EQU $45     ; ヘッダの読み出し・照合: X = ヘッダ（48 バイト）のアドレス → X = 次のアドレス、Y = 処理したバイト数、C=1 ならエラー（A = エラー番号）

; RAM ディスク（CL = DEV_RAMDISK）
RAMDISK_MEDIA_CHECK     EQU $10     ; メディアの確認: (CH) = ドライブ、A = 0: 今のメディアを覚える、1: 交換を許す、2: 交換されたか調べる → C=1 ならエラー（A = エラー番号）
RAMDISK_MEDIA_INFO      EQU $11     ; メディアの情報: (CH) = ドライブ → X = 情報（19 バイト）のアドレス、C=1 ならエラー（A = エラー番号）
RAMDISK_SECTOR_READ     EQU $12     ; セクタの読み出し: (CH) = ドライブ、X = メモリのアドレス、(BX) = 最初のセクタ、(DX) = セクタ数 → X = 次のアドレス、(BX) = 次のセクタ、(CX) は変わる、C=1 ならエラー（A = エラー番号）
RAMDISK_SECTOR_WRITE    EQU $13     ; セクタの書き込み: (CH) = ドライブ、X = メモリのアドレス、(BX) = 最初のセクタ、(DX) = セクタ数 → X = 次のアドレス、(BX) = 次のセクタ、(CX) は変わる、C=1 ならエラー（A = エラー番号）
RAMDISK_SECTOR_WRITE_VERIFY EQU $14     ; 書き込みと照合: (CH) = ドライブ、X = メモリのアドレス、(BX) = 最初のセクタ、(DX) = セクタ数 → X = 次のアドレス、(BX) = 次のセクタ、(CX) は変わる、C=1 ならエラー（A = エラー番号）
RAMDISK_SECTOR_VERIFY   EQU $15     ; 照合: (CH) = ドライブ、X = メモリのアドレス、(BX) = 最初のセクタ、(DX) = セクタ数 → X = 次のアドレス、(BX) = 次のセクタ、(CX) は変わる、C=1 ならエラー（A = エラー番号）
RAMDISK_STATUS          EQU $16     ; 状態: (CH) = ドライブ → A のビット 0 = 1: 書き込み禁止、C=1 ならエラー（A = エラー番号）
RAMDISK_SECTOR_ADDRESS  EQU $17     ; セクタのアドレス: (CH) = ドライブ、(BX) = セクタ → X = セクタのアドレス、(CX) = セクタの大きさ、(DI) = 先頭のセクタのアドレス、C=1 ならエラー（A = エラー番号）

; メモリブロック（CL = DEV_MEM）
MEM_FIND                EQU $41     ; ブロックのアドレスを探す: (CH) = スロット（0〜2）、X = ブロック名（名前 8 文字 + . + 拡張子 3 文字） → X = ブロック名の次、Y = 先頭アドレス、C=1 なら A = 01h: スロットがない、04h: ブロックがない
MEM_RESIZE              EQU $42     ; ブロックの空き領域の大きさを変える: (CH) = スロット（0〜2）、X = ブロック名（名前 8 文字 + . + 拡張子 3 文字）、A = 空き領域の番号（0、1）、Y = 空き領域のバイト数 → X = ブロック名の次、0Ch なら Y = 取れる大きさ、C=1 なら A = 00h: 書き込み禁止のスロット、01h: スロットがない、04h: ブロックがない、05h: 書き込み禁止のブロック、09h: 同じ名前がある、0Ch: メモリ不足
MEM_MOVE                EQU $43     ; メモリの転送（重なってもよい）: X = 転送元、Y = 転送先、(SI) = バイト数（3 バイト） → X、Y = 終わりの次のアドレス
MEM_RENAME              EQU $44     ; 名前を変える: (CH) = スロット（0〜2）、X = ブロック名（名前 8 文字 + . + 拡張子 3 文字）、Y = 新しいブロック名 → X、Y = 名前の次、C=1 なら A = 00h: 書き込み禁止のスロット、01h: スロットがない、04h: ブロックがない、05h: 書き込み禁止のブロック、09h: 同じ名前がある、0Ch: メモリ不足
MEM_CREATE              EQU $45     ; ブロックを作る（先に MEM_TIDY）: (CH) = スロット（0〜2）、X = ブロック名（名前 8 文字 + . + 拡張子 3 文字） → X = ブロック名の次、Y = 先頭アドレス、C=1 なら A = 00h: 書き込み禁止のスロット、01h: スロットがない、04h: ブロックがない、05h: 書き込み禁止のブロック、09h: 同じ名前がある、0Ch: メモリ不足
MEM_DELETE              EQU $46     ; ブロックを消す: (CH) = スロット（0〜2）、X = ブロック名（名前 8 文字 + . + 拡張子 3 文字） → X = ブロック名の次、C=1 なら A = 00h: 書き込み禁止のスロット、01h: スロットがない、04h: ブロックがない、05h: 書き込み禁止のブロック、09h: 同じ名前がある、0Ch: メモリ不足
MEM_TIDY                EQU $47     ; 空きを詰める: (CH) = スロット（0〜2）
MEM_CREATE_FIRST        EQU $48     ; 先頭にブロックを作る: (CH) = スロット（0〜2）、X = ブロック名（名前 8 文字 + . + 拡張子 3 文字）、Y = 大きさ（ROM は使わない） → X = ブロック名の次、Y = 先頭アドレス、C=1 なら A = 00h: 書き込み禁止のスロット、01h: スロットがない、04h: ブロックがない、05h: 書き込み禁止のブロック、09h: 同じ名前がある、0Ch: メモリ不足

; システム（CL = DEV_SYSTM）
SYSTM_POWER_OFF         EQU $41     ; 電源を切る
SYSTM_WORK              EQU $42     ; 作業域の大きさを変える（先に MEM_TIDY）: X = ポインタのアドレス（BFD1Ah = 機械語エリアなど）、Y = バイト数 → C=1: メモリ不足
SYSTM_BASIC             EQU $43     ; 中間コードを実行: X = 中間コード、A のビット 0 = 1: 1 文ずつ、1 = 1: TRON、2 = 1: 直接入力、4 = 1: RUN モード → X = 実行した所、C=1 なら B = BASIC のエラー番号
SYSTM_BASIC_STATEMENT   EQU $45     ; BASIC の文の処理アドレス: A = 中間コード → Y = アドレス、C=1: ない
SYSTM_BASIC_FUNCTION    EQU $46     ; BASIC の関数の処理アドレス: A = 中間コード → Y = アドレス、C=1: ない

; ファイル制御（CALLF FCS）
FCS_CREATE              EQU $00     ; ファイルを作って開く: X = ファイル名（ドライブ: + 名前 8 文字 + . + 拡張子 3 文字 + 00h）、A = 属性（ビット 0: 書き込み禁止、1: 見えない） → (CL) = ハンドル、A = 属性、C=1 なら A = FERR_ の番号
FCS_OPEN                EQU $01     ; 開く: X = ファイル名（ドライブ: + 名前 8 文字 + . + 拡張子 3 文字 + 00h）、A = 1: 読む、2: 書く、3: 両方 → (CL) = ハンドル、A = 属性、C=1 なら A = FERR_ の番号
FCS_CLOSE               EQU $02     ; 閉じる: (CL) = ハンドル → C=1 なら A = FERR_ の番号
FCS_READ_BLOCK          EQU $03     ; ブロックの読み出し: (CL) = ハンドル、X = 読み込む先、Y = バイト数、A のビット 0 = 0: 1Ah で終わり、1: ファイルの最後まで → X = 次のアドレス、Y = 処理したバイト数、C=1 なら A = FERR_ の番号
FCS_WRITE_BLOCK         EQU $04     ; ブロックの書き込み: (CL) = ハンドル、X = データ、Y = バイト数（0: 今の位置から後を捨てる） → X = 次のアドレス、Y = 処理したバイト数、C=1 なら A = FERR_ の番号
FCS_READ                EQU $05     ; 1 バイトの読み出し: (CL) = ハンドル、A のビット 0 = 0: 1Ah で終わり、1: ファイルの最後まで → A = データ、B = 読めたバイト数（0、1）、C=1 なら A = FERR_ の番号
FCS_WRITE               EQU $06     ; 1 バイトの書き込み: (CL) = ハンドル、A = データ → B = 書けたバイト数、C=1 なら A = FERR_ の番号
FCS_VERIFY              EQU $07     ; 照合: (CL) = ハンドル、X = メモリのアドレス、Y = バイト数、A のビット 0 = 0: 1Ah で終わり、1: ファイルの最後まで → X = 次のアドレス、Y = 処理したバイト数、C=1 なら A = FERR_ の番号
FCS_PEEK                EQU $08     ; 1 バイトの非破壊読み出し: (CL) = ハンドル、A のビット 0 = 0: 1Ah で終わり、1: ファイルの最後まで → A = データ、B = 読めたバイト数（0、1）、C=1 なら A = FERR_ の番号
FCS_SEEK                EQU $09     ; 位置を動かす: (CL) = ハンドル、(SI) = バイト数（3 バイト）、A = 0: 先頭から、1: 今の位置から（符号付き）、2: 終わりから → (SI) = 位置、C=1 なら A = FERR_ の番号
FCS_INFO                EQU $0A     ; 開いたファイルの情報: (CL) = ハンドル、A = 0: 大きさと位置、1: 名前（X = 19 バイトの場所） → A = 0 で呼ぶと A = 開き方、B = デバイスの属性、(SI) = 位置、(DI) = 大きさ、C=1 なら A = FERR_ の番号
FCS_SET_INFO            EQU $0B     ; ディレクトリの情報を読む、変える: X = ファイル名（ドライブ: + 名前 8 文字 + . + 拡張子 3 文字 + 00h）、Y = 属性 1、時刻 2、日付 2、大きさ 3 の 8 バイト、A = 0: 読む、1: 書く → C=1 なら A = FERR_ の番号
FCS_FIND                EQU $0C     ; 名前を探す（? が使える）: X = ファイル名（ドライブ: + 名前 8 文字 + . + 拡張子 3 文字 + 00h）、Y = 結果の場所（18 バイト）、(BX) = 始める番号、A = 0: 後ろへ、1: 前へ、+80h: 見えないものも → (BX) = 見つけた番号、[Y] = ドライブ 6、名前 8、.、拡張子 3、C=1 なら A = FERR_ の番号
FCS_RENAME              EQU $0D     ; 名前を変える: X = ファイル名（ドライブ: + 名前 8 文字 + . + 拡張子 3 文字 + 00h）、Y = 新しい名前（ドライブなしの 12 文字） → C=1 なら A = FERR_ の番号
FCS_DELETE              EQU $0E     ; 消す（? が使える）: X = ファイル名（ドライブ: + 名前 8 文字 + . + 拡張子 3 文字 + 00h） → C=1 なら A = FERR_ の番号
FCS_FREE                EQU $0F     ; 空き容量: X = ドライブ名（: まで）、A = 0 → (SI) = 空き（3 バイト）、C=1 なら A = FERR_ の番号
FCS_INIT                EQU $10     ; 初期化: A = 0: すべて、1: 全部閉じて標準の 3 つを開く、2: 標準のほかを閉じる → C=1 なら A = FERR_ の番号

; エラー番号（C=1 のときの A。コマンド 00h〜1Fh、40h）
ERR_PROTECTED           EQU $00     ; 書き込み禁止（コマンド 00h〜1Fh、40h）
ERR_NO_DRIVE            EQU $01     ; ドライブがない
ERR_NOT_READY           EQU $02     ; 準備ができていない
ERR_COMMAND             EQU $03     ; 処理できないコマンド
ERR_CHANGED             EQU $04     ; メディアが交換された
ERR_WRITE               EQU $05     ; 書き込みエラー
ERR_READ                EQU $06     ; 読み取りエラー
ERR_VERIFY              EQU $07     ; ベリファイエラー
ERR_NO_WRITE            EQU $08     ; 書けないデバイス
ERR_NO_READ             EQU $09     ; 読めないデバイス
ERR_BATTERY             EQU $FE     ; 電池切れ
ERR_BREAK               EQU $FF     ; BREAK

; ファイル制御（CALLF FCS）のエラー番号
FERR_DEVICE             EQU $00     ; デバイスのエラーで中止
FERR_PARAMETER          EQU $01     ; 値が範囲外
FERR_NOT_FOUND          EQU $02     ; ファイルがない
FERR_NO_PATH            EQU $03     ; パスコードがない
FERR_TOO_MANY           EQU $04     ; 開きすぎ
FERR_PROTECTED          EQU $05     ; 許されていない
FERR_HANDLE             EQU $06     ; ハンドルが無効
FERR_MODE               EQU $07     ; 開き方が違う
FERR_OPEN               EQU $08     ; 開いている
FERR_EXISTS             EQU $09     ; 同じ名前がある
FERR_NO_DRIVE           EQU $0A     ; ドライブがない、使えない
FERR_VERIFY             EQU $0B     ; 照合の不一致
FERR_SHORT              EQU $0C     ; 途中までしか処理できない（空き不足）
