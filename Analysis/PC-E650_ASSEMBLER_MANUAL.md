# PC-E650 アセンブラマニュアル（SC62015 / ESR-L）

PC-E650（および PC-E500 系）の CPU **SC62015（SHARP 社内名 ESR-L）** で機械語プログラムを書くための手引き。CPU の構造、アドレッシング、全ニーモニックの動作と用途、オペコード表、PC-E650 の ROM 8.5 上で機械語を置いて呼び出す手順、本プロジェクトのアセンブラ `e500asm` / 逆アセンブラ `e500dasm` の使い方をまとめる。

## 1. CPU の概要

### 1.1 レジスタ

| 記号 | 幅 | 役割 |
|---|---|---|
| A | 8 bit | アキュムレータ。8 bit 演算の主役。 |
| B | 8 bit | A の補助。`MV A,B` / `MV B,A` / `EX A,B` でしか直接触れない。 |
| BA | 16 bit | B（上位）と A（下位）を合わせた 16 bit レジスタ。 |
| IL / IH | 8 bit ずつ | I の下位・上位。**IL へ書くと IH は 0 になる。** |
| I | 16 bit | ループカウンタ。`MVL`、`ADCL` などの末尾 `L` の命令が回数として使い、実行後は 0 になる。0 で実行すると 10000h（65536）回。 |
| X, Y | 20 bit | ポインタ。外部メモリ 1 MB を直接指す。 |
| U | 20 bit | ユーザスタックポインタ。`PUSHU`/`POPU` が使う。ポインタとしても使える。 |
| S | 20 bit | システムスタックポインタ。`CALL`/`RET`、割込み、`PUSHS`/`POPS` が使う。 |
| PC | 16 bit | プログラムカウンタ。64 KB のセグメント内オフセット。 |
| PS | 4 bit | ページセグメント。PC と合わせて 20 bit の実行アドレスを作る。PC の桁上りで PS は変わらない。 |
| F | 2 bit | フラグ。bit0 = C（キャリー）、bit1 = Z（ゼロ）。 |
| IMR | 8 bit | 割込みマスク。内部 RAM FBh と同じもの。 |

命令表で使うレジスタ分類:

| 記号 | 含むレジスタ | 命令中の 3 bit コード |
|---|---|---|
| r1 | A, IL | A=0, IL=1 |
| r2 | BA, I | BA=2, I=3 |
| r3 | X, Y, U, S | X=4, Y=5, U=6, S=7 |
| r | 上記すべて | 0–7 |

### 1.2 フラグ

- **C**: 加減算・比較で桁上げ／桁借りが出たとき 1。シフト・ローテートで押し出されたビット。`SC`/`RC` で直接操作。
- **Z**: 結果が 0 のとき 1。`L` 付きの連続演算（ADCL, SBCL, DADL, DSBL, CMPW, CMPP, DSLL, DSRL）では **全バイトが 0 のときだけ** 1。
- 転送命令（MV 系、EX 系、PUSH/POP、PMDF）はフラグを変えない。ただし `POPU F`/`POPS F`/`RETI` は F を復元する。

### 1.3 メモリ空間

外部メモリは 20 bit（1 MB）の連続空間。内部 RAM は別の 256 バイト空間で、`(n)` の記法でアクセスする。

PC-E650 の割当て（本体 ROM 8.5、内蔵 RAM 64 KB）:

| CPU アドレス | 内容 |
|---|---|
| 00000h–03FFFh / 04000h–07FFFh | LCD ドライバ（SH-26 系）の窓。ROM が使う。 |
| 20000h–3FFFFh | PC-E650 拡張 ROM（128 KB）。構造化 BASIC 等。 |
| 40000h–7FFFFh | RAM カード（S2:）。未装着なら空き。 |
| 80000h–BFFFFh | 内蔵 RAM 窓。実体 64 KB は **B0000h–BFFFFh**、下位はそのミラー。 |
| B0000h–(BFCxx) | BASIC プログラム、変数、作業領域、スタック、機械語エリア |
| BFC00h–BFFFFh | システム領域。IOCS ヘッダ先頭ポインタ BFCA2h、作業領域ポインタ表 BFCDEh–BFD1Ch、機械語エリア確保用パラメータ BFE03h など。 |
| C0000h–FFFFFh | 本体 ROM（256 KB）。C0018h–DFFFFh は G: の ROM ディスク、E0000h 以降が主なコード。 |
| FFFD8h, FFFDCh, FFFE4h, FFFE8h | 公開入口（`JPF`）。FFFE8h = IOCS、FFFE4h = FCS、FFFD8h = 作業領域再構成。 |
| FFFFAh–FFFFCh | 割込みベクタ（3 バイト、下位から）。 |
| FFFFDh–FFFFFh | リセットベクタ。 |

ROM の詳細は [PC-E650_ROM_MAP.md](PC-E650_ROM_MAP.md)、IOCS の入口は [IOCS_REFERENCE.md](IOCS_REFERENCE.md) を参照。

### 1.4 内部 RAM（256 バイト）

| 番地 | 名前 | 内容 |
|---|---|---|
| 00h–EBh | RAM | 汎用 236 バイト。**ROM（BASIC、IOCS）も全域を作業に使う**ので、機械語で使う番地は退避・復帰する（§7.4）。 |
| ECh | BP | ベースポインタ。`(BP+n)` の基準。ROM が常時使うので値を変えたら戻す。 |
| EDh | PX | `(PX+n)`, `(BP+PX)` 用ポインタ。 |
| EEh | PY | `(PY+n)`, `(BP+PY)` 用ポインタ。 |
| EFh | AMC | アドレス修飾制御（RAM カード連続化）。 |
| F0h / F1h | KOL / KOH | キーストローブ出力 KO0–KO7 / KO8–KO15。 |
| F2h | KIL | キー入力 KI0–KI7（読出し専用）。 |
| F3h / F4h | EOL / EOH | 汎用ポート E0–E7 / E8–E15 出力。11 ピン端子（CE-140F 通信など）に使われる。 |
| F5h / F6h | EIL / EIH | 汎用ポート入力（読出し専用）。 |
| F7h | UCR | UART 制御。bit7 BOE、bit6–4 ボーレート（300–19200）、bit3–2 パリティ、bit1 データ長、bit0 ストップビット。 |
| F8h | USR | UART 状態（RXR, TXE, TXR, FE, OE, PE）。読出し専用。 |
| F9h | RXD | UART 受信バッファ（読出し専用）。 |
| FAh | TXD | UART 送信バッファ（書込み専用）。 |
| FBh | IMR | 割込みマスク。bit7 IRM（全体許可）、bit6 EXM（外部）、bit5 RXRM、bit4 TXRM、bit3 ONKM（ON キー）、bit2 KEYM（キー）、bit1 STM（サブタイマ）、bit0 MTM（メインタイマ）。0 で禁止。 |
| FCh | ISR | 割込み要因。bit6 EXI、bit5 RXRI、bit4 TXRI、bit3 ONKI、bit2 KEYI、bit1 STI、bit0 MTI。要因が発生すると 1 になり、ソフトが 0 を書くまで保持。 |
| FDh | SCR | システム制御。bit7 ISE、bit6–4 BZ2–BZ0（CO/CI ピン = ブザー出力の選択: 固定 low/high、2 kHz、4 kHz 等）、bit3 VDDC、bit2 STS、bit1 MTS、bit0 DISC（LCD ドライバ ON/OFF）。 |
| FEh | LCC | bit7–3 LCD コントラスト（32 段階）、bit2 KSD（キーストローブ禁止）、bit1 STCL、bit0 MTCL（`TCL` でクリアするタイマの選択）。 |
| FFh | SSR | システム状態（ONK, RSF, CI, TEST）。読出し専用。 |

ROM 8.5 の BASIC が IOCS の引数に使う番地（技術資料の表記と対応、ROM で確認）:

| 番地 | 技術資料の名前 | 用途 |
|---|---|---|
| D4h | (bl) | x 座標など |
| D5h | (bh) | y 座標など |
| D6h | (cl) | IOCS デバイス番号 |
| D7h | (ch) | IOCS ドライブ番号 |

技術資料の `(cx) = 0008h` は「D6h に 08h、D7h に 00h」を意味する（`MVW (D6h),0008h`）。

### 1.5 割込みとベクタ

割込みが受け付けられると、S スタックへ **PS, PC, F, IMR** の順（合計 5 バイト）が積まれ、IMR の bit7（IRM）が 0 になり、FFFFAh–FFFFCh の 3 バイトへジャンプする。`RETI` がその逆を行う。ROM 8.5 はキー走査を 64 Hz のサブタイマ割込みで行うので、機械語から戻る前に IMR を元に戻すこと。

**1 命令の実行中は割込みが入らない。** `MVL` や `WAIT` のように長い命令を大きな I で実行すると、その間キー入力やタイマが止まる。

---

## 2. アドレッシングモード

### 2.1 データ幅

| 記法 | 幅 | 備考 |
|---|---|---|
| A, IL / n | 1 バイト | |
| BA, I / mn | 2 バイト | 下位が先（リトルエンディアン） |
| X, Y, U, S / lmn | 3 バイト（20 bit 有効） | 上位 4 bit は無視、または 0 |

レジスタを含まないメモリ間の転送・比較は、ニーモニックの末尾で幅を示す: `MV`（1）、`MVW`（2）、`MVP`（3）、`MVL`（I バイト）。

### 2.2 即値

`MV A,12h`、`MV BA,1234h`、`MV X,0B0000h`。転送先の幅の分だけ命令に埋め込まれる。

### 2.3 内部 RAM `(…)`

| 記法 | 実効アドレス | 用途 |
|---|---|---|
| `(n)` | n | 絶対番地。I/O レジスタや固定作業領域。 |
| `(BP+n)` | BP + n | 相対。ROM はこれを既定にしている。n は ±（8 bit）。 |
| `(PX+n)` / `(PY+n)` | PX + n / PY + n | 表引きや二重ポインタ。 |
| `(BP+PX)` / `(BP+PY)` | BP + PX / BP + PY | ループ内で PX/PY を進めながらアクセス。 |

どのモードを使うかは、命令の前に置く **PRE バイト**（§4.9）で決まる。`e500asm` はオペランドの書き方から自動で PRE を付ける。オペランドが 2 つとも内部 RAM のときは、第 1 オペランドが PX、第 2 オペランドが PY を使う（逆は不可）。

### 2.4 外部メモリ `[…]`

| 記法 | 実効アドレス | 用途 |
|---|---|---|
| `[lmn]` | 20 bit 絶対 | 固定番地。 |
| `[r3]` | r3 | ポインタ経由。 |
| `[r3+n]` / `[r3-n]` | r3 ± n（n は 0–255） | 構造体のメンバ、スタックフレーム。 |
| `[r3++]` | r3 を使ってから、データ幅ぶん加算 | 順方向走査、PUSH の逆。 |
| `[--r3]` | データ幅ぶん減算してから使う | PUSH 相当（`MV [--S],X` など）。 |
| `[(n)]` | 内部 RAM n から 3 バイトを読んだ値 | 内部 RAM に置いた 20 bit ポインタの間接参照。 |
| `[(n)+m]` / `[(n)-m]` | 上記 ± m | 間接参照＋変位。 |

r3 は X, Y, U, S のみ。**S を転送先／転送元にするときは `[lmn]` の絶対アドレスしか使えない**（`MV S,[X]` などは存在しない）。

---

## 3. 記法（e500asm）

```asm
; コメントは ; から行末まで
        ORG   $BEC00            ; 配置アドレス
COUNT   EQU   10                 ; 定数（"COUNT = 10" も可）
start:  MV    A,0                ; ラベルは行頭に置き : を付ける
loop:   ADD   A,IL
        DEC   IL
        JRNZ  loop
        RETF
table:  DB    "TEXT",13,10,0     ; 文字列と数値
        DW    $1234              ; 2 バイト（下位が先）
        DP    $B8000             ; 3 バイト
        DS    16                 ; 16 バイト確保
        END
```

- 数値: `$BEC00` / `&BEC00` / `0xBEC00` / `0BEC00h`（16 進）、`0b1010`（2 進）、`'A'`（文字）。`$` または `*` 単独は現在のアドレス。**注意: `0B…h` 形式（例 `0BEC00h`）は現行の e500asm が 2 進の `0b` 接頭辞と誤認してエラーになる。B で始まる 16 進は `$BEC00` か `&BEC00` で書く。**
- 式: `+ - * / % & | ^ << >>`、単項 `- ~`、括弧、`LOW(x)`、`HIGH(x)`、`BANK(x)`（bit19–16）。
- 疑似命令: `ORG`, `EQU`, `DB`/`DEFB`/`BYTE`, `DW`/`DEFW`/`WORD`, `DP`, `DS`/`DEFS`/`SPACE`, `ALIGN`, `INCLUDE`, `INCBIN`, `ASSERT`, `END`。先頭に `.` を付けてもよい。
- 分岐先: `JR label` のようにラベルを書けば変位は自動計算。`JR +5` / `JR -3` の直接指定も可。
- `PRE 21h` のように PRE を明示することもできるが、通常は不要。
- 大文字・小文字は区別しない。

コマンドライン:

```text
e500asm  prog.asm -o prog.bin -l prog.lst -s prog.sym      # 生バイナリ + リスト + シンボル
e500asm  prog.asm -f hex                                    # Intel HEX
e500dasm prog.bin -f raw --org 0BEC00h -o prog.asm          # 逆アセンブル（生バイナリ）
e500dasm PROG.BIN -f ce140f -o prog.asm                     # SAVE M 形式（16 バイトヘッダ付き）
```

---

## 4. 命令リファレンス

各命令について、書式、動作、フラグ（C/Z: 変化、-: 変化なし、1/0: その値になる）、符号化（PRE を除いたバイト列）を示す。サイクル数は §5 のオペコード表を参照。内部 RAM オペランドが `(BP+n)` 以外のときは PRE 1 バイトと 1 サイクルが加わる。

符号化の記号: `n`, `m`, `l` = 1 バイト値、`mn` = 2 バイト即値（下位が先）、`lmn` = 3 バイト（下位が先）、`r` 等 = レジスタコード、`(m)` `(n)` = 内部 RAM 番地の 1 バイト、`d` = 変位 1 バイト。

### 4.1 転送

#### MV — 転送

| 書式 | 動作 | 符号化 |
|---|---|---|
| `MV r,n` / `MV r2,mn` / `MV r3,lmn` | レジスタ ← 即値 | `08+r` 即値 |
| `MV A,B` / `MV B,A` | A ↔ B の片方向転送 | `74` / `75` |
| `MV r2,r2'` / `MV r3,r3'` / `MV r2,r3` / `MV r3,r2` | レジスタ間転送。幅が違うときは下位 16 bit を渡し、20 bit 側の上位 4 bit は 0 | `FD` `(r<<4)+r'` |
| `MV r,(n)` | レジスタ ← 内部 RAM（幅はレジスタに従う） | `80+r` n |
| `MV (n),r` | 内部 RAM ← レジスタ | `A0+r` n |
| `MV r,[lmn]` / `MV [lmn],r` | 絶対番地 | `88+r` lmn / `A8+r` lmn |
| `MV r,[r3]` / `MV [r3],r` | レジスタ間接 | `90+r` `0r3` / `B0+r` `0r3` |
| `MV r,[r3++]` / `MV r,[--r3]` | 後置加算／前置減算 | `90+r` `2r3` / `90+r` `3r3`（格納は `B0+r`） |
| `MV r,[r3+d]` / `MV r,[r3-d]` | 変位付き | `90+r` `8r3` d / `90+r` `Cr3` d |
| `MV r,[(n)]` / `MV r,[(n)±d]` | 内部 RAM 間接 | `98+r` `00` n / `98+r` `80`または`C0` n d（格納は `B8+r`） |
| `MV (m),n` / `MVW (l),mn` / `MVP (k),lmn` | 内部 RAM ← 即値 | `CC` m n / `CD` l mn / `DC` k lmn |
| `MV (m),(n)` / `MVW` / `MVP` | 内部 RAM 間（1/2/3 バイト） | `C8`/`C9`/`CA` m n |
| `MV (k),[lmn]` / `MVW` / `MVP` | 内部 RAM ← 外部絶対 | `D0`/`D1`/`D2` k lmn |
| `MV [klm],(n)` / `MVW` / `MVP` | 外部絶対 ← 内部 RAM | `D8`/`D9`/`DA` klm n |
| `MV (n),[r3]` / `MV (n),[r3++]` / `MV (n),[--r3]` / `MV (n),[r3±d]` 系 | 内部 RAM ← 外部間接（1/2/3 バイト） | `E0–E2` `0r3` n / `2r3` n / `3r3` n / `8r3`または`Cr3` n d |
| `MV [r3],(n)` / `MV [r3++],(n)` / `MV [--r3],(n)` / `MV [r3±d],(n)` 系 | 外部間接 ← 内部 RAM（1/2/3 バイト） | `E8–EA` `0r3` n / `2r3` n / `3r3` n / `8r3`または`Cr3` n d |
| `MV (m),[(n)]` / `MV (m),[(n)±d]` 系 | 内部 RAM ← 内部 RAM 間接 | `F0–F2` `00` m n / `80`または`C0` m n d |
| `MV [(l)],(n)` / `MV [(l)±d],(n)` 系 | 内部 RAM 間接 ← 内部 RAM | `F8–FA` `00` l n / `80`または`C0` l n d |

フラグ: 変化なし。

用途と注意:
- 8/16/20 bit の全転送の基本。`MV IL,x` は IH を 0 にするので、`MV IL,n` は「I に 0–255 を入れる」の短縮形として使う。
- **`MV A,IL` と `MV IL,A` は存在しない**。A ↔ IL の値渡しは `MV (n),A` → `MV IL,(n)` などで行う。
- `MV [--S],X` / `MV X,[S++]` が S スタックへの PUSH/POP になる（`PUSHS`/`POPS` は F しか扱えない）。
- 20 bit レジスタを 3 バイトメモリへ書くと上位 4 bit は 0 で書かれる。

#### MVL / MVLD — ブロック転送

| 書式 | 動作 | 符号化 |
|---|---|---|
| `MVL (m),(n)` | I バイトを n→m へ、番地を増やしながら | `CB` m n |
| `MVLD (m),(n)` | I バイトを n→m へ、番地を減らしながら | `CF` m n |
| `MVL (k),[lmn]` / `MVL [klm],(n)` | 外部絶対との間 | `D3` k lmn / `DB` klm n |
| `MVL (n),[r3++]` / `MVL [r3++],(n)` | 外部間接（r3 は転送後に I バイト進む） | `E3` `2r3` n / `EB` `2r3` n |
| `MVL (m),[r3±d]` / `MVL [r3±d],(n)` | 変位付き。`[r3]` は `[r3+0]` として符号化される | `56` `8r3`または`Cr3` m d / `5E` `8r3`または`Cr3` n d |
| `MVL (n),[--r3]` / `MVL [--r3],(n)` | 特殊: `[--r3]` 側は指定番地の 1 つ手前から下向き、他方は上向き | `E3`/`EB` `3r3` n |
| `MVL (m),[(n)]` / `MVL [(l)±d],(n)` 系 | 内部 RAM 間接 | `F3` / `FB` |

フラグ: 変化なし。実行後 I = 0。I = 0 で実行すると 65536 バイト。

用途: 内部 RAM の退避・復帰（§7.4）、外部メモリ間のコピー（内部 RAM を経由する。外部→外部の直接形はない）、画面バッファの転送。重なった領域を上位へずらすときは `MVLD` を使う（`MVL` だと未転送データを上書きする）。

#### EX / EXW / EXP / EXL / SWAP — 交換

| 書式 | 動作 | フラグ | 符号化 |
|---|---|---|---|
| `EX A,B` | A ↔ B | - | `DD` |
| `EX r2,r2'` / `EX r3,r3'` | レジスタ交換（同じ幅どうし。幅違いは 16 bit 側に下位が入り、20 bit 側の上位 4 bit は 0） | - | `ED` `(r<<4)+r'` |
| `EX (m),(n)` / `EXW` / `EXP` | 内部 RAM 1/2/3 バイト交換 | - | `C0`/`C1`/`C2` m n |
| `EXL (m),(n)` | I バイト交換（番地は増加） | - | `C3` m n |
| `SWAP A` | A の上位・下位ニブル交換 | Z | `EE` |

用途: `SWAP A` は BCD の桁取出し、`EX X,Y` はポインタの入替え。

### 4.2 算術

#### ADD / SUB — 加算・減算

| 書式 | 動作 | 符号化 |
|---|---|---|
| `ADD A,n` / `SUB A,n` | A ← A ± n | `40` n / `48` n |
| `ADD (m),n` / `SUB (m),n` | 内部 RAM ← 内部 RAM ± n | `41` m n / `49` m n |
| `ADD A,(n)` / `SUB A,(n)` | A ← A ± (n) | `42` n / `4A` n |
| `ADD (n),A` / `SUB (n),A` | (n) ← (n) ± A | `43` n / `4B` n |
| `ADD r1,r1'` / `SUB` | 8 bit レジスタ間（A, IL） | `46`/`4E` `(r<<4)+r'` |
| `ADD r2,r'` / `SUB` | BA, I ← ± （A, IL, BA, I） | `44`/`4C` `(r2<<4)+r'` |
| `ADD r3,r'` / `SUB` | X, Y, U, S ← ± 任意のレジスタ | `45`/`4D` `(r3<<4)+r'` |

フラグ: C（転送先の最上位ビットからの桁上げ／借り。20 bit なら bit19）、Z。転送先は転送元と同じか大きい幅でなければならない。狭い転送元の上位ビットは 0 として扱う。

用途: `ADD X,A` / `ADD Y,BA` は「ポインタ＋インデックス」の常套手段。`SUB BA,BA` のように自分自身を引いてゼロクリアにも使う（ROM でも多用）。

#### ADC / SBC — キャリー付き加減算

| 書式 | 符号化 |
|---|---|
| `ADC A,n` / `ADC (m),n` / `ADC A,(n)` / `ADC (n),A` | `50`–`53` |
| `SBC A,n` / `SBC (m),n` / `SBC A,(n)` / `SBC (n),A` | `58`–`5B` |

フラグ: C, Z。用途: 8 bit 単位で多バイト加減算をつなぐ。レジスタ間形はないので、多バイトは `ADCL`/`SBCL` の方が簡単。

#### ADCL / SBCL — 多バイト 2 進加減算

| 書式 | 動作 | 符号化 |
|---|---|---|
| `ADCL (m),(n)` / `SBCL (m),(n)` | I バイト分、(m) ← (m) ± (n)。指定番地から **番地を増やしながら**（下位バイトが先） | `54` m n / `5C` m n |
| `ADCL (n),A` / `SBCL (n),A` | 最初の 1 バイトに A を足し／引き、2 バイト目以降はキャリーだけを伝える | `55` n / `5D` n |

フラグ: C（最終桁上げ）、Z（全バイトが 0 のとき 1）。最初のバイトには C を含めない。実行後 I = 0。

用途: 16/24/32 bit 整数の加減算。数値はリトルエンディアン（下位バイトが小さい番地）に置く。

#### DADL / DSBL — 多バイト BCD 加減算

| 書式 | 動作 | 符号化 |
|---|---|---|
| `DADL (m),(n)` / `DSBL (m),(n)` | I バイト分の 10 進（パック BCD）加減算。指定番地から **番地を減らしながら** | `C4` m n / `D4` m n |
| `DADL (n),A` / `DSBL (n),A` | 最初の 1 バイトに A（BCD）を足し／引く | `C5` n / `D5` n |

フラグ: C, Z（全バイトが 0 のとき 1）。実行後 I = 0。

用途: BASIC の数値（BCD 仮数）の加工。**BCD 数は上位桁を小さい番地に置き、最下位バイトの番地を指定する**（2 進の ADCL とは逆方向）。§8.3 に検証済みの例がある。

#### INC / DEC — インクリメント・デクリメント

| 書式 | 符号化 |
|---|---|
| `INC r` / `DEC r`（A, IL, BA, I, X, Y, U, S） | `6C` r / `7C` r |
| `INC (n)` / `DEC (n)` | `6D` n / `7D` n |

フラグ: Z のみ（C は不変）。用途: カウンタ、ポインタ。`DEC IL` + `JRNZ` は短いループの定番。

#### PMDF — ポインタ修正

| 書式 | 動作 | 符号化 |
|---|---|---|
| `PMDF (m),n` | (m) ← (m) + n、フラグ不変 | `47` m n |
| `PMDF (n),A` | (n) ← (n) + A、フラグ不変 | `57` n |

用途: BP、PX、PY を相対的にずらす。ROM は `PMDF (ECh),0FCh` のように BP を動かしてローカル変数領域を作る。演算中のフラグを壊さない加算としても使える。

### 4.3 論理・比較・テスト

#### AND / OR / XOR

| 書式 | 符号化（AND / OR / XOR） |
|---|---|
| `op A,n` | `70` / `78` / `68` n |
| `op (m),n` | `71` / `79` / `69` m n |
| `op [lmn],n` | `72` / `7A` / `6A` lmn n |
| `op (n),A` | `73` / `7B` / `6B` n |
| `op (m),(n)` | `76` / `7E` / `6E` m n |
| `op A,(n)` | `77` / `7F` / `6F` n |

フラグ: Z のみ（C 不変）。外部メモリ形は絶対番地だけ。

用途: I/O レジスタのビット操作（`AND (FDh),8Fh` でブザー停止、`OR (FBh),80h` で割込み許可）、外部メモリのフラグ直接操作（`OR [0BFC52h],80h`）。ISR（FCh）に `AND` でビットを落とすときは、命令完了前に割込み判定が行われる場合があるので、割込みルーチン側は要因が見つからなくても正常に戻るようにする。

#### TEST — ビットテスト

| 書式 | 符号化 |
|---|---|
| `TEST A,n` / `TEST (m),n` / `TEST [lmn],n` / `TEST (n),A` | `64` / `65` / `66` / `67` |

動作: AND した結果を捨てて Z だけ変える（結果 0 → Z=1）。C 不変。用途: `TEST (FCh),04h` / `JRNZ` のようなビット判定。`JRZ` は「ビットが立っていない」に飛ぶことに注意。

#### CMP / CMPW / CMPP — 比較

| 書式 | 動作 | 符号化 |
|---|---|---|
| `CMP A,n` / `CMP (m),n` / `CMP [lmn],n` / `CMP (n),A` | 1 バイトの dest − src、結果は捨てる | `60` / `61` / `62` / `63` |
| `CMP (m),(n)` | 内部 RAM 1 バイト間 | `B7` m n（ESR-L の表にない。ROM とエミュレータで確認） |
| `CMPW (m),(n)` / `CMPP (m),(n)` | 2 / 3 バイト比較。指定番地が最下位、上の番地が上位 | `C6` m n / `C7` m n |
| `CMPW (m),r2` / `CMPP (m),r3` | 内部 RAM とレジスタ | `D6` r2 m / `D7` r3 m |

フラグ: C = 借りが出た（dest < src）、Z = 等しい。したがって `CMP A,n` の後、`JRC` = A < n、`JRZ` = A = n、`JRNC` = A ≥ n（符号なし）。

#### SC / RC — キャリー操作

`SC`（`97`）: C ← 1。`RC`（`9F`）: C ← 0。Z 不変。

用途: サブルーチンの戻り値（C=1 でエラー）を作る。IOCS も BASIC の `CALL` もこの規約（§7.3）。

### 4.4 シフト・ローテート

| 書式 | 動作 | フラグ | 符号化 |
|---|---|---|---|
| `ROR A` / `ROR (n)` | 8 bit 右回転。bit0 → bit7、C ← bit0 | C, Z | `E4` / `E5` n |
| `ROL A` / `ROL (n)` | 8 bit 左回転。bit7 → bit0、C ← bit7 | C, Z | `E6` / `E7` n |
| `SHR A` / `SHR (n)` | C を含む 9 bit 右回転: bit7 ← C、C ← bit0 | C, Z | `F4` / `F5` n |
| `SHL A` / `SHL (n)` | C を含む 9 bit 左回転: bit0 ← C、C ← bit7 | C, Z | `F6` / `F7` n |
| `DSRL (n)` | I バイトを 4 bit（1 桁）右へ。指定番地から **番地を増やしながら**。前のバイトの下位桁が次のバイトの上位桁へ | Z（C 不変） | `FC` n |
| `DSLL (n)` | I バイトを 4 bit 左へ。指定番地から **番地を減らしながら** | Z（C 不変） | `EC` n |

注意: `SHR`/`SHL` は純粋なシフトではなく C が入ってくる。0 を詰めたいときは先に `RC` する。用途: 乗除算、ビット送出、BCD の桁寄せ（DSRL/DSLL）。

### 4.5 スタック

| 書式 | 動作 | 符号化 |
|---|---|---|
| `PUSHU r` / `POPU r`（A, IL, BA, I, X, Y） | U を減らして格納／取り出して U を増やす | `28+r` / `38+r` |
| `PUSHU F` / `POPU F` | フラグ（bit0=C, bit1=Z） | `2E` / `3E` |
| `PUSHU IMR` / `POPU IMR` | IMR（FBh）。**PUSHU IMR は積んだ後に IRM（bit7）を 0 にして割込みを禁止する** | `2F` / `3F` |
| `PUSHS F` / `POPS F` | S スタックにフラグ | `4F` / `5F` |
| `MV [--S],r` / `MV r,[S++]` | S スタックへの汎用 PUSH/POP（§4.1） | |

フラグ: `POPU F`/`POPS F` 以外は不変。`POPU IL` は IH を 0 にする。

用途: `PUSHU IMR` … `POPU IMR` で割込み禁止区間を作る。U は ROM から呼ばれる時点で有効な RAM 内アドレスになっているので、機械語でもそのまま使える。

### 4.6 分岐

| 書式 | 動作 | 符号化 |
|---|---|---|
| `JP mn` | セグメント内ジャンプ（PC ← mn、PS 不変） | `02` mn |
| `JPF lmn` | 1 MB 内ジャンプ（PC, PS ← lmn） | `03` lmn |
| `JP (n)` | 内部 RAM n の 3 バイトへ far ジャンプ | `10` n |
| `JP r3` | X/Y/U/S の値へ far ジャンプ | `11` r3 |
| `JPZ` / `JPNZ` / `JPC` / `JPNC mn` | 条件付きセグメント内ジャンプ | `14`–`17` mn |
| `JR ±n` | 相対ジャンプ（命令番地 + 2 ± n、n = 0–255） | `12` n（+）/ `13` n（−） |
| `JRZ` / `JRNZ` / `JRC` / `JRNC ±n` | 条件付き相対ジャンプ | `18/19`, `1A/1B`, `1C/1D`, `1E/1F` n |
| `CALL mn` | 次命令の PC（2 バイト）を S に積んでセグメント内呼出し | `04` mn |
| `CALLF lmn` | 次命令の 20 bit 番地（3 バイト、上位 4 bit は 0）を積んで far 呼出し | `05` lmn |
| `RET` | S から 2 バイト取り出して PC へ | `06` |
| `RETF` | S から 3 バイト取り出して PC, PS へ | `07` |
| `RETI` | S から IMR, F, PC, PS（5 バイト）を戻す | `01` |

フラグ: 不変（RETI は復元）。条件が成立しないときは NOP と同じ。

注意:
- `JP`/`CALL`/`JR` は PS を変えない。相対ジャンプは 64 KB セグメントを跨げない。`e500asm` は跨ぐ場合をエラーにする。
- 機械語エリア（B セグメント）から ROM（E/F セグメント）を呼ぶには `CALLF`、戻るには `RETF`。BASIC の `CALL` から戻るのも **`RETF`**（§7.3）。
- `JP r3` と `JP (n)` はジャンプテーブルや「戻り先を計算して飛ぶ」に使う。

### 4.7 CPU 制御

| 書式 | 動作 | 符号化 |
|---|---|---|
| `NOP` | 1 サイクル何もしない | `00` |
| `WAIT` | I を 0 まで減らしながら待つ（I+1 サイクル）。割込みは入らない | `EF` |
| `HALT` | メインクロック停止。割込みで復帰 | `DE` |
| `OFF` | メイン・サブクロック停止（電源 OFF）。ON キー等で復帰 | `DF` |
| `TCL` | LCC（FEh）の STCL/MTCL が 1 のタイマをクリア | `CE` |
| `IR` | ソフトウェア割込み（割込みと同じ手順で FFFFAh のベクタへ） | `FE` |
| `RESET` | FFFFDh のリセットベクタへ | `FF` |

用途: `HALT`/`OFF` は ROM の電源管理（IOCS device 8 command 41h）が行うので、ユーザプログラムから直接使うことは少ない。`WAIT` は短い時間待ち。

### 4.8 未使用オペコード

`20h`（PRE の既定組合せに相当）、`BFh`（`MV [(n)],S` に当たるが S の間接指定は存在しない）は `e500asm` が生成せず、`e500dasm` は `DB` にする。`97h`/`9Fh`（`MV S,[r3]`/`MV S,[(n)]` の位置）は `SC`/`RC`、`B7h` は `CMP (m),(n)` に割り当てられている。

### 4.9 PRE — 内部 RAM アドレッシング指定バイト

命令の直前に 1 バイト置き、内部 RAM オペランドのモードを変える。第 1 オペランドは PX、第 2 オペランドは PY を使う。

| 第 1 ＼ 第 2 | `(n)` | `(BP+n)` | `(PY+n)` | `(BP+PY)` |
|---|---|---|---|---|
| `(n)` | 32h | **30h** | 33h | 31h |
| `(BP+n)` | 22h | なし（既定） | 23h | 21h |
| `(PX+n)` | 36h | **34h** | 37h | 35h |
| `(BP+PX)` | 26h | **24h** | 27h | 25h |

内部 RAM オペランドが 1 つだけの命令は、そのオペランドが第 1・第 2 のどちらに書かれていても **`(BP+n)` の列（太字）** を使う。例: `MV A,(20h)` → `30 80 20`、`MV [X],(PX+2)` → `34 E8 04 02`。

`e500asm` は `(n)` を絶対番地、`(BP+n)` を BP 相対と解釈して PRE を自動生成する。ROM のコードは既定が BP 相対なので、逆アセンブル結果に `(BP+…)` が多く現れる。

---

## 5. オペコード表（00h–FFh）

バイト数は PRE を含まない。サイクル数は『活用研究』の代表値で、条件分岐は「成立/不成立」、ループ命令は I に依存する。内部 RAM オペランドが `(BP+n)` 以外なら +1。`r` はレジスタコード（§1.1）、`r3` は X/Y/U/S。第 2 バイトで形が決まるもの（90h–96h, 98h–9Eh, B0h–B6h, B8h–BEh, E0h–E3h, E8h–EBh, 6Ch, 7Ch, EDh, FDh, 44h–46h, 4Ch–4Eh）は代表形を示す。E0h–E2h は「内部 RAM ← 外部」、E8h–EAh は「外部 ← 内部 RAM」で、`[r3]`/`[r3++]`/`[--r3]`/`[r3±n]` の別は第 2 バイトが決める（『活用研究』写しの E8h–EBh の向きはエミュレータと ROM の実装に合わせて修正した）。

| op | ニーモニック | オペランド | バイト | サイクル |
|---|---|---|---|---|
| 00h | NOP | - | 1 | 1 |
| 01h | RETI | - | 1 | 7 |
| 02h | JP | mn | 3 | 4 |
| 03h | JPF | lmn | 4 | 5 |
| 04h | CALL | mn | 3 | 6 |
| 05h | CALLF | lmn | 4 | 8 |
| 06h | RET | - | 1 | 4 |
| 07h | RETF | - | 1 | 5 |
| 08h | MV | A, n | 2 | 2 |
| 09h | MV | IL, n | 2 | 3 |
| 0Ah | MV | BA, mn | 3 | 3 |
| 0Bh | MV | I, mn | 3 | 3 |
| 0Ch | MV | X, lmn | 4 | 4 |
| 0Dh | MV | Y, lmn | 4 | 4 |
| 0Eh | MV | U, lmn | 4 | 4 |
| 0Fh | MV | S, lmn | 4 | 4 |
| 10h | JP | (n) | 2 | 6 |
| 11h | JP | r3 | 2 | 4 |
| 12h | JR | +n | 2 | 3 |
| 13h | JR | -n | 2 | 3 |
| 14h | JPZ | mn | 3 | 4/3 |
| 15h | JPNZ | mn | 3 | 4/3 |
| 16h | JPC | mn | 3 | 4/3 |
| 17h | JPNC | mn | 3 | 4/3 |
| 18h | JRZ | +n | 2 | 3/2 |
| 19h | JRZ | -n | 2 | 3/2 |
| 1Ah | JRNZ | +n | 2 | 3/2 |
| 1Bh | JRNZ | -n | 2 | 3/2 |
| 1Ch | JRC | +n | 2 | 3/2 |
| 1Dh | JRC | -n | 2 | 3/2 |
| 1Eh | JRNC | +n | 2 | 3/2 |
| 1Fh | JRNC | -n | 2 | 3/2 |
| 20h | （未使用: 既定組合せ） | - | - | - |
| 21h | PRE | (n)(BP+PY) | 1 | 1 |
| 22h | PRE | (BP+n)(n) | 1 | 1 |
| 23h | PRE | (BP+n)(PY+n) | 1 | 1 |
| 24h | PRE | (BP+PX)(BP+n) | 1 | 1 |
| 25h | PRE | (BP+PX)(BP+PY) | 1 | 1 |
| 26h | PRE | (BP+PX)(n) | 1 | 1 |
| 27h | PRE | (BP+PX)(PY+n) | 1 | 1 |
| 28h | PUSHU | A | 1 | 3 |
| 29h | PUSHU | IL | 1 | 3 |
| 2Ah | PUSHU | BA | 1 | 4 |
| 2Bh | PUSHU | I | 1 | 4 |
| 2Ch | PUSHU | X | 1 | 5 |
| 2Dh | PUSHU | Y | 1 | 5 |
| 2Eh | PUSHU | F | 1 | 3 |
| 2Fh | PUSHU | IMR | 1 | 3 |
| 30h | PRE | (m)(BP+n) | 1 | 1 |
| 31h | PRE | (m)(BP+PY) | 1 | 1 |
| 32h | PRE | (m)(n) | 1 | 1 |
| 33h | PRE | (m)(PY+n) | 1 | 1 |
| 34h | PRE | (PX+m)(BP+n) | 1 | 1 |
| 35h | PRE | (PX+m)(BP+PY) | 1 | 1 |
| 36h | PRE | (PX+m)(n) | 1 | 1 |
| 37h | PRE | (PX+m)(PY+n) | 1 | 1 |
| 38h | POPU | A | 1 | 2 |
| 39h | POPU | IL | 1 | 3 |
| 3Ah | POPU | BA | 1 | 3 |
| 3Bh | POPU | I | 1 | 3 |
| 3Ch | POPU | X | 1 | 4 |
| 3Dh | POPU | Y | 1 | 4 |
| 3Eh | POPU | F | 1 | 2 |
| 3Fh | POPU | IMR | 1 | 2 |
| 40h | ADD | A, n | 2 | 3 |
| 41h | ADD | (m), n | 3 | 4 |
| 42h | ADD | A, (n) | 2 | 4 |
| 43h | ADD | (n), A | 2 | 4 |
| 44h | ADD | r2, r1' / r2, r2' | 2 | 5 |
| 45h | ADD | r3, r' | 2 | 7 |
| 46h | ADD | r1, r1' | 2 | 3 |
| 47h | PMDF | (m), n | 3 | 4 |
| 48h | SUB | A, n | 2 | 3 |
| 49h | SUB | (m), n | 3 | 4 |
| 4Ah | SUB | A, (n) | 2 | 4 |
| 4Bh | SUB | (n), A | 2 | 4 |
| 4Ch | SUB | r2, r1' / r2, r2' | 2 | 5 |
| 4Dh | SUB | r3, r' | 2 | 7 |
| 4Eh | SUB | r1, r1' | 2 | 3 |
| 4Fh | PUSHS | F | 1 | 3 |
| 50h | ADC | A, n | 2 | 3 |
| 51h | ADC | (m), n | 3 | 4 |
| 52h | ADC | A, (n) | 2 | 4 |
| 53h | ADC | (n), A | 2 | 4 |
| 54h | ADCL | (m), (n) | 3 | 5+2×I |
| 55h | ADCL | (n), A | 2 | 4+I |
| 56h | MVL | (m), [r3±n] | 4 | 5+2×I |
| 57h | PMDF | (n), A | 2 | 4 |
| 58h | SBC | A, n | 2 | 3 |
| 59h | SBC | (m), n | 3 | 4 |
| 5Ah | SBC | A, (n) | 2 | 4 |
| 5Bh | SBC | (n), A | 2 | 4 |
| 5Ch | SBCL | (m), (n) | 3 | 5+2×I |
| 5Dh | SBCL | (n), A | 2 | 4+I |
| 5Eh | MVL | [r3±m], (n) | 4 | 5+2×I |
| 5Fh | POPS | F | 1 | 2 |
| 60h | CMP | A, n | 2 | 3 |
| 61h | CMP | (m), n | 3 | 4 |
| 62h | CMP | [klm], n | 5 | 6 |
| 63h | CMP | (n), A | 2 | 4 |
| 64h | TEST | A, n | 2 | 3 |
| 65h | TEST | (m), n | 3 | 4 |
| 66h | TEST | [klm], n | 5 | 6 |
| 67h | TEST | (n), A | 2 | 4 |
| 68h | XOR | A, n | 2 | 3 |
| 69h | XOR | (m), n | 3 | 4 |
| 6Ah | XOR | [klm], n | 5 | 7 |
| 6Bh | XOR | (n), A | 2 | 4 |
| 6Ch | INC | r | 2 | 3 |
| 6Dh | INC | (m) | 2 | 3 |
| 6Eh | XOR | (m), (n) | 3 | 6 |
| 6Fh | XOR | A, (n) | 2 | 4 |
| 70h | AND | A, n | 2 | 3 |
| 71h | AND | (m), n | 3 | 4 |
| 72h | AND | [klm], n | 5 | 7 |
| 73h | AND | (n), A | 2 | 4 |
| 74h | MV | A, B | 1 | 1 |
| 75h | MV | B, A | 1 | 1 |
| 76h | AND | (m), (n) | 3 | 6 |
| 77h | AND | A, (n) | 2 | 4 |
| 78h | OR | A, n | 2 | 3 |
| 79h | OR | (m), n | 3 | 4 |
| 7Ah | OR | [klm], n | 5 | 7 |
| 7Bh | OR | (n), A | 2 | 4 |
| 7Ch | DEC | r | 2 | 3 |
| 7Dh | DEC | (m) | 2 | 3 |
| 7Eh | OR | (m), (n) | 3 | 6 |
| 7Fh | OR | A, (n) | 2 | 4 |
| 80h | MV | A, (n) | 2 | 3 |
| 81h | MV | IL, (n) | 2 | 4 |
| 82h | MV | BA, (n) | 2 | 4 |
| 83h | MV | I, (n) | 2 | 5 |
| 84h | MV | X, (n) | 2 | 5 |
| 85h | MV | Y, (n) | 2 | 5 |
| 86h | MV | U, (n) | 2 | 5 |
| 87h | MV | S, (n) | 2 | 5 |
| 88h | MV | A, [lmn] | 4 | 6 |
| 89h | MV | IL, [lmn] | 4 | 7 |
| 8Ah | MV | BA, [lmn] | 4 | 7 |
| 8Bh | MV | I, [lmn] | 4 | 8 |
| 8Ch | MV | X, [lmn] | 4 | 8 |
| 8Dh | MV | Y, [lmn] | 4 | 8 |
| 8Eh | MV | U, [lmn] | 4 | 8 |
| 8Fh | MV | S, [lmn] | 4 | 8 |
| 90h | MV | A, [r3] | 2 | 4 |
| 91h | MV | IL, [r3] | 2 | 5 |
| 92h | MV | BA, [r3] | 2 | 5 |
| 93h | MV | I, [r3] | 2 | 6 |
| 94h | MV | X, [r3] | 2 | 5 |
| 95h | MV | Y, [r3] | 2 | 5 |
| 96h | MV | U, [r3] | 2 | 5 |
| 97h | SC | - | 1 | 1 |
| 98h | MV | A, [(n)] | 3 | 9 |
| 99h | MV | IL, [(n)] | 3 | 10 |
| 9Ah | MV | BA, [(n)] | 3 | 10 |
| 9Bh | MV | I, [(n)] | 3 | 11 |
| 9Ch | MV | X, [(n)] | 3 | 11 |
| 9Dh | MV | Y, [(n)] | 3 | 11 |
| 9Eh | MV | U, [(n)] | 3 | 11 |
| 9Fh | RC | - | 1 | 1 |
| A0h | MV | (n), A | 2 | 3 |
| A1h | MV | (n), IL | 2 | 3 |
| A2h | MV | (n), BA | 2 | 4 |
| A3h | MV | (n), I | 2 | 4 |
| A4h | MV | (n), X | 2 | 5 |
| A5h | MV | (n), Y | 2 | 5 |
| A6h | MV | (n), U | 2 | 5 |
| A7h | MV | (n), S | 2 | 5 |
| A8h | MV | [lmn], A | 4 | 5 |
| A9h | MV | [lmn], IL | 4 | 5 |
| AAh | MV | [lmn], BA | 4 | 6 |
| ABh | MV | [lmn], I | 4 | 6 |
| ACh | MV | [lmn], X | 4 | 7 |
| ADh | MV | [lmn], Y | 4 | 7 |
| AEh | MV | [lmn], U | 4 | 7 |
| AFh | MV | [lmn], S | 4 | 7 |
| B0h | MV | [r3], A | 2 | 4 |
| B1h | MV | [r3], IL | 2 | 4 |
| B2h | MV | [r3], BA | 2 | 5 |
| B3h | MV | [r3], I | 2 | 5 |
| B4h | MV | [r3], X | 2 | 6 |
| B5h | MV | [r3], Y | 2 | 6 |
| B6h | MV | [r3], U | 2 | 6 |
| B7h | CMP | (m),(n) | 3 | 6 |
| B8h | MV | [(n)], A | 3 | 9 |
| B9h | MV | [(n)], IL | 3 | 9 |
| BAh | MV | [(n)], BA | 3 | 10 |
| BBh | MV | [(n)], I | 3 | 10 |
| BCh | MV | [(n)], X | 3 | 11 |
| BDh | MV | [(n)], Y | 3 | 11 |
| BEh | MV | [(n)], U | 3 | 11 |
| BFh | （未使用） | - | - | - |
| C0h | EX | (m), (n) | 3 | 7 |
| C1h | EXW | (m), (n) | 3 | 10 |
| C2h | EXP | (m), (n) | 3 | 13 |
| C3h | EXL | (m), (n) | 3 | 5+3×I |
| C4h | DADL | (m), (n) | 3 | 5+2×I |
| C5h | DADL | (n), A | 2 | 4+I |
| C6h | CMPW | (m), (n) | 3 | 8 |
| C7h | CMPP | (m), (n) | 3 | 10 |
| C8h | MV | (m), (n) | 3 | 6 |
| C9h | MVW | (m), (n) | 3 | 8 |
| CAh | MVP | (m), (n) | 3 | 10 |
| CBh | MVL | (m), (n) | 3 | 5+2×I |
| CCh | MV | (m), n | 3 | 3 |
| CDh | MVW | (l), mn | 4 | 4 |
| CEh | TCL | - | 1 | 1 |
| CFh | MVLD | (m), (n) | 3 | 5+2×I |
| D0h | MV | (k), [lmn] | 5 | 7 |
| D1h | MVW | (k), [lmn] | 5 | 8 |
| D2h | MVP | (k), [lmn] | 5 | 9 |
| D3h | MVL | (k), [lmn] | 5 | 6+2×I |
| D4h | DSBL | (m), (n) | 3 | 5+2×I |
| D5h | DSBL | (n), A | 2 | 4+I |
| D6h | CMPW | (m), r2 | 3 | 7 |
| D7h | CMPP | (m), r3 | 3 | 9 |
| D8h | MV | [klm], (n) | 5 | 6 |
| D9h | MVW | [klm], (n) | 5 | 7 |
| DAh | MVP | [klm], (n) | 5 | 8 |
| DBh | MVL | [klm], (n) | 5 | 6+2×I |
| DCh | MVP | (k), lmn | 5 | 5 |
| DDh | EX | A, B | 1 | 3 |
| DEh | HALT | - | 1 | 1 |
| DFh | OFF | - | 1 | 2 |
| E0h | MV | (n), [r3] | 3 | 6 |
| E1h | MVW | (n), [r3] | 3 | 7 |
| E2h | MVP | (n), [r3] | 3 | 8 |
| E3h | MVL | (n), [r3++] | 3 | 5+2×I |
| E4h | ROR | A | 1 | 2 |
| E5h | ROR | (n) | 2 | 3 |
| E6h | ROL | A | 1 | 2 |
| E7h | ROL | (n) | 2 | 3 |
| E8h | MV | [r3], (n) | 3 | 6 |
| E9h | MVW | [r3], (n) | 3 | 7 |
| EAh | MVP | [r3], (n) | 3 | 9 |
| EBh | MVL | [r3++], (n) | 3 | 5+2×I |
| ECh | DSLL | (n) | 2 | 4+1 |
| EDh | EX | r2, r2' | 2 | 4 |
| EEh | SWAP | A | 1 | 3 |
| EFh | WAIT | - | 1 | 1+I |
| F0h | MV | (m), [(n)] | 4 | 11 |
| F1h | MVW | (m), [(n)] | 4 | 12 |
| F2h | MVP | (m), [(n)] | 4 | 13 |
| F3h | MVL | (m), [(n)] | 4 | 10+2×I |
| F4h | SHR | A | 1 | 2 |
| F5h | SHR | (n) | 2 | 3 |
| F6h | SHL | A | 1 | 2 |
| F7h | SHL | (n) | 2 | 3 |
| F8h | MV | [(l)±m], (n) | 5 | 13 |
| F9h | MVW | [(l)±m], (n) | 5 | 14 |
| FAh | MVP | [(l)±m], (n) | 5 | 15 |
| FBh | MVL | [(l)±m], (n) | 5 | 12+2×I |
| FCh | DSRL | (n) | 2 | 4+1 |
| FDh | MV | r2, r2' / r3, r3' | 2 | 2 |
| FEh | IR | - | 1 | - |
| FFh | RESET | - | 1 | - |

---

## 6. 開発の流れ

1. `ORG` に配置先（機械語エリアの先頭、§7.2）を書いてソースを作る。VS Code に `VSCodeExtensions/` の拡張（Pocket BASIC / ASM Linter）を入れると、`.asm` の編集中に `e500asm` と同じエラー（未知の命令、オペランドの組合せ、未定義シンボル、`JR` の範囲など）が表示される。
2. `e500asm prog.asm -o prog.bin -l prog.lst` でアセンブルし、リストでバイト列を確認する。
3. 実機／エミュレータへ入れる。方法は 3 つ:
   - **POKE**: 短いプログラムなら `POKE 先頭,バイト,…` を数行。リストから 10 進または `&H` 16 進で書く。
   - **LOAD M**: `FileConverter/ce140conv.exe bin2bas --addr 0xBEC00 prog.bin PROG.BIN` で SAVE M 形式（16 バイトヘッダ付き）にし、CE-140F（エミュレータでは X: フォルダ）へ置いて `LOAD M "X:PROG.BIN"`。ヘッダの番地へ読み込まれる。
   - **エミュレータの BIN 書込み**: メモリ欄から生バイナリを指定番地へ書く。
4. `CALL 先頭番地` で実行する（`CALL &HBEC00` または 10 進 `CALL 781312`）。
5. 逆アセンブルで確認するときは `e500dasm`。ROM の解析には `Analysis/PC-E650_ROM_MAP.md` の入口表を使う。

---

## 7. PC-E650 で機械語を動かす

### 7.1 RAM の構成と機械語エリア

ROM 8.5 は内蔵 RAM の上端（BFC00h 直下）に 21 個の作業領域を持ち、その先頭番地を **BFCDEh から 3 バイトずつ** のポインタ表に置く（技術資料 p.77）。

| ポインタの番地 | 領域 |
|---|---|
| BFCDEh | U スタック |
| BFCE1h | S スタック |
| BFCE4h–BFD0Bh | 予約 |
| BFD0Eh | BASIC 作業領域 |
| BFD11h, BFD14h | 予約 |
| BFD17h | IOCS 作業領域（内部 RAM E6h にも同じ値） |
| BFD1Ah | **機械語エリア**。この番地の値から BFBFFh までがユーザ用 |

電源投入直後は `[BFD1Ah] = 0BFC00h`、つまり機械語エリアの大きさは 0。BASIC プログラムや変数は RAM の下端から伸びるので、確保せずに B0000h 付近へ機械語を置くと BASIC と衝突する。

### 7.2 機械語エリアの確保（検証済み）

IOCS device 8（SYSTM:）command 42h「作業領域確保」を、公開入口 FFFD8h 経由で BASIC から呼ぶ。FFFD8h は `[BFE03h]` を X（ポインタ表の番地）、`[BFE06h]` を Y（確保するバイト数）として command 42h を実行し、そのままメインメニューへ戻る。

```basic
POKE &HBFE03,&H1A,&HFD,&H0B, &H00,&H10,&H00 : CALL &HFFFD8
```

- 先頭 3 バイト `1A FD 0B` = 0BFD1Ah（機械語エリアのポインタ、下位から）。
- 続く 3 バイト = 大きさ（下位から）。例は 1000h = 4096 バイト。
- 実行後はメインメニューに戻るので `BASIC` キーで戻る。
- 確認: `PRINT PEEK &HBFD1A, PEEK &HBFD1B, PEEK &HBFD1C` → `0 236 11` = 0BEC00h。機械語エリアは **BEC00h–BFBFFh**。

`&H` が打ちにくい環境では 10 進で `POKE 785923,26,253,11,0,16,0:CALL 1048536` と書いても同じ。ROM はこの処理で BASIC 作業領域・スタック等のポインタを確保分だけ下へずらす（U/S スタックの内容も移動する）。確保した状態は RAM が保持される限り残り、オールリセット（RAM 初期化）で消える。既存の BASIC プログラムがある状態でも動作するが、重要なプログラムは先に保存しておくこと。

技術資料 p.85 には同じ方法で IOCS 作業領域（BFD17h）を広げる BASIC プログラム例がある。

### 7.3 CALL 文の規約（検証済み）

ROM 8.5 の `CALL addr` は次のように動く（F9F34h）:

1. 引数を 20 bit 番地として評価し Y に入れる。
2. X を U スタックに退避し、**戻り番地 3 バイト**（F9F4Eh）を `MV [--S],X` で S スタックに積む。
3. `JP Y` でユーザ機械語へ飛ぶ。
4. 戻った先で X を復元し、`RETF` で BASIC へ帰る。

したがってユーザプログラムは:

- **`RETF` で戻る**（3 バイト取り出す）。`RET` だと S が 1 バイトずれて暴走し、メインメニューに落ちる（エミュレータで確認）。
- **C=0 で戻れば正常終了。C=1 で戻ると A がエラー番号として扱われ、BASIC のエラー表示になる**（例: A=2Ch で "Bad line number"、A=3Eh で "UNTIL without REPEAT"）。演算の最後にキャリーが残っていると意図せずエラーになるので、戻る直前に `RC` を置くのが安全。IOCS のエラーをそのまま BASIC に返したいときは C と A を触らずに `RETF` する。
- 引数はない。`CALL addr` の後にカンマで値を書く形式は受け付けない。データの受渡しは決まった番地を `POKE`/`PEEK` する。

呼出し時のレジスタ・内部 RAM の観測値（ROM 8.5、64 KB、参考値であり保証されない）:

| 項目 | 値 |
|---|---|
| Y | 呼出し先番地 |
| X | 戻り番地 F9F4Eh |
| U / S | RAM 内（例: BE691h / BE84Dh）。そのまま使える |
| BP (ECh) | ROM の値（例: BEh）。変更したら戻す |
| IMR (FBh) | E3h（割込み許可、キー・タイマ有効） |
| A, BA, I | 不定 |

ROM は X しか保存しない。他のレジスタは壊してよいが、U/S の積み降ろしは対にする。

### 7.4 内部 RAM と割込みの扱い

- 内部 RAM 00h–EBh は BASIC/IOCS が作業に使う。機械語が使う番地は入口で外部メモリへ `MVL` で退避し、出口で戻す（§8.3 の例）。BP（ECh）、PX、PY を変えたら戻す。
- 割込みは許可されたまま入ってくる。時間のかかる処理でキー割込みを止めたいときは `PUSHU IMR`（自動で IRM=0）… `POPU IMR`。ROM の割込み処理は 64 Hz でキーを走査し、S スタックを 5 バイト以上使う。
- 長い `MVL`/`WAIT` は割込みを遅らせる。
- ブザー（XOUT）は SCR（FDh）の bit6–4。`AND (0FDh),8Fh` で止まる。

### 7.5 IOCS の呼び方

```asm
        MV   ($D6),device      ; (cl) デバイス番号
        MV   ($D7),drive       ; (ch) ドライブ番号
        MV   IL,command         ; コマンド番号
        ; A / BA / I / X / Y / ($D4),($D5) はコマンドごとの引数
        CALLF $FFFE8
        JRC  error              ; C=1: A にエラー番号
```

デバイス番号、コマンド範囲、各ドライバの入口は [IOCS_REFERENCE.md](IOCS_REFERENCE.md)。LCD（device 0）の主なコマンド（技術資料 pp.32–41）:

| cmd | 機能 | 引数 |
|---|---|---|
| 40h | 初期化 | A = 0 全リセット / 1 リセット / 2 OFF / 3 ON |
| 41h | 1 文字表示 | (D4h)=x, (D5h)=y, A=文字。表示後 x+1 |
| 42h | 文字列表示 | (D4h)=x, (D5h)=y, X=文字列先頭, Y=長さ。右端で止まり C=1 |
| 44h | カーソル位置設定 | (D4h)=x, (D5h)=y |
| 45h | カーソル種別 | A（bit5 表示、bit3 点滅、bit2–0 形） |
| 47h / 48h | n 行スクロール上／下 | |
| 49h | 行クリア | |
| 4Ah / 4Bh | 8 ドットパターン表示／読出し | |
| 4Ch / 4Dh | 1 ドット表示／読出し | |
| 4Eh / 4Fh | 直線／矩形塗り | |
| 51h / 52h | 画面クリア | |
| 55h / 56h | 1 行ドットパターン読出し／書込み | |

IOCS が壊すレジスタは公開されていない。必要なものは呼出し前後で `PUSHU`/`POPU` する。

### 7.6 SAVE M / LOAD M

```basic
SAVE M "X:PROG.BIN",&HBEC00,&HBEC3F     ' 機械語エリアの内容を保存
LOAD M "X:PROG.BIN"                     ' ヘッダの番地へ戻す
```

ファイル先頭には 16 バイトのヘッダ（`FF 00 06 01 10 長さ3 開始3 FF FF FF 00 0F`）が付く。`ce140conv bin2bas --addr` が同じヘッダを生成し、`e500dasm -f ce140f` がそれを読む。詳細は `FileConverter/README.md`。

---

## 8. サンプルプログラム（PC-E650 ROM 8.5 で検証済み）

いずれも §7.2 で 1000h バイト確保した BEC00h に置き、`CALL &HBEC00`（= `CALL 781312`）で実行した。

### 8.1 2 バイトの加算

```asm
; [$BED00] + [$BED01] → [$BED02]
        ORG  $BEC00
        MV   A,[$BED00]
        MV   IL,[$BED01]     ; IH は 0 になる
        ADD  A,IL
        MV   [$BED02],A
        RETF                  ; C は ADD の結果のまま返る
        END
```

```basic
POKE &HBEC00,&H88,&H00,&HED,&H0B,&H89,&H01,&HED,&H0B,&H46,&H01,&HA8,&H02,&HED,&H0B,&H07
POKE &HBED00,3,4 : CALL &HBEC00 : PRINT PEEK &HBED02      → 7
POKE &HBED00,200,100 : CALL &HBEC00                        → "Bad line number"
```

2 つ目は 300 で桁上げが出て C=1 のまま戻ったため、A=2Ch がエラー番号として表示された（§7.3）。ゼロクリアしたければ `RETF` の前に `RC` を入れる。

### 8.2 IOCS で文字列を表示

```asm
; IOCS (device 0: LCD, command $42) で最下行に文字列を表示する
        ORG  $BEC00
IOCS    EQU  $FFFE8
BL      EQU  $D4              ; x 座標 (0-39)
BH      EQU  $D5              ; y 座標 (0-3)
CL      EQU  $D6              ; device
CH      EQU  $D7              ; drive
start:  MV   (CL),0            ; device 0 = LCD
        MV   (CH),0            ; drive 0
        MV   (BL),0            ; x = 0
        MV   (BH),3            ; y = 3
        MV   IL,$42            ; 指定位置へ n 文字表示
        MV   X,msg             ; 文字列先頭
        MV   Y,msg_end-msg     ; 長さ
        CALLF IOCS             ; C=1 なら A にエラー番号
        RETF                   ; C と A をそのまま BASIC へ返す
msg:    DB   "HELLO, PC-E650!"
msg_end:
        END
```

`CLS : CALL &HBEC00` で 4 行目に `HELLO, PC-E650!` が出る。42h は制御コード（CR/LF）を解釈せず、そのグリフを表示する。

### 8.3 内部 RAM を退避して BCD 加算

```asm
; 内部 RAM $20-$2F を退避し、DADL で 4 バイト BCD 加算を行う
        ORG  $BEC00
WORK    EQU  $20               ; 内部 RAM $20-$2F を作業に使う
SAVE    EQU  $BEF00            ; 退避先（機械語エリア内）
RESULT  EQU  $BED00            ; 結果の書出し先
start:  PUSHU X
        PUSHU I
        MV   I,16
        MVL  [SAVE],(WORK)     ; 内部 RAM $20-$2F を退避
        MV   X,operands
        MV   I,8
        MVL  (WORK),[X]        ; 被加数 4 バイト + 加数 4 バイト
        MV   I,4
        DADL (WORK+3),(WORK+7) ; 10 進加算。最下位バイトを指定し、下位番地へ進む
        MV   I,4
        MVL  [RESULT],(WORK)   ; 結果 ($20-$23) を外部メモリへ
        MV   I,16
        MVL  (WORK),[SAVE]     ; 内部 RAM を復帰
        POPU I
        POPU X
        RC
        RETF
operands:
        DB   $00,$12,$34,$56   ; 00123456（上位桁が先頭）
        DB   $00,$00,$99,$99   ; 00009999
        END
```

`CALL &HBEC00 : PRINT PEEK &HBED00,PEEK &HBED01,PEEK &HBED02,PEEK &HBED03` → `0 19 52 85` = 00 13 34 55（00123456 + 00009999 = 00133455）。復帰後も BASIC は正常に動く。

生成されるコードのうち注目点: `MVL [SAVE],(WORK)` は `30 DB 00 EF 0B 20`（内部 RAM オペランドが 1 つなので PRE 30h）、`DADL (WORK+3),(WORK+7)` は `32 C4 23 27`（両方絶対番地なので PRE 32h）、`MVL (WORK),[X]` は `30 56 84 20 00`（`[X]` が `[X+0]` に置き換わる）。

サンプルのソースは [asm_samples/](asm_samples/) にある。

---

## 9. よくある落とし穴

| 症状 | 原因 | 対処 |
|---|---|---|
| CALL 後にメインメニューへ落ちる | `RET` で戻った | `RETF` |
| CALL 後に BASIC のエラーが出る | C=1 で戻った | `RC` してから `RETF`、または意図したエラー番号を A に |
| キーが効かなくなる／時計が止まる | IMR を落としたまま、または長い `MVL`/`WAIT` | `PUSHU IMR`/`POPU IMR` を対にする |
| BASIC が壊れる | 内部 RAM を戻していない、BP を変えた、確保していない領域へ書いた | §7.2 と §7.4 |
| `MV A,IL` がアセンブルできない | 命令が存在しない | 内部 RAM 経由 |
| `MV S,[X]` がアセンブルできない | S の間接指定は不可 | `MV S,[lmn]` または `MV S,(n)` |
| `JR` が範囲外 | ±255 を超えた、またはセグメントを跨いだ | `JP`/`JPF` |
| `SHR` で上位に 1 が入る | C が回り込む 9 bit 回転 | 先に `RC` |
| `ADCL` と `DADL` で結果が逆 | 進む方向が違う（2 進は上へ、10 進は下へ） | §4.2 |
| PRE 付き命令のサイクルが表と違う | `(BP+n)` 以外は +1 | §5 の注記 |
| `(n)` のつもりが `(BP+n)` になっている | ROM の逆アセンブル出力は BP 相対が既定 | `e500dasm` の表示どおりに読む |
