# 21. 用語集

この章はマニュアルに出てくる言葉の説明です。知らない言葉に出会ったら、ここで短い意味をつかみ、くわしく知りたいときは、示した章へ進んでください。

[目次へ戻る](README.md)

## 英字、記号

| 言葉 | 意味 | くわしく |
|---|---|---|
| .NET ランタイム | `e500dbg` を動かすために使う、Microsoft の実行環境 | [2 章](02_INSTALL.md) |
| ASCII | 英数字と記号の文字コード。`A` は 41h | [3 章](03_ASSEMBLER_TUTORIAL.md#39-例題-6-文字列) |
| BCD | 10 進の 1 桁を 4 ビットで表す数え方。1234 を 12h 34h と置く | [命令 DADL](05_INSTRUCTIONS.md#dadl) |
| BIN | 実機の `LOAD M` で読むファイル。16 バイトのヘッダーと機械語 | [14 章](14_TRANSFER.md) |
| BP、PX、PY | 内部 RAM を間接に指すためのポインタ。ECh、EDh、EEh にある | [3 章](03_ASSEMBLER_TUTORIAL.md#311-例題-8-内部-ram) |
| C（キャリー） | 桁上がり、借りを表すフラグ。BASIC に戻るときはエラーの印 | [3 章](03_ASSEMBLER_TUTORIAL.md#36-例題-3-足し算) |
| CE-140F | ポケットディスク。X: ドライブ | [解析 17 章](../analysis/17_CE-140F_DISK.md) |
| e500asm | このリポジトリのアセンブラ | [4 章](04_ASSEMBLER_REFERENCE.md) |
| e500core.dll | エミュレータの本体（CPU、LCD、ROM を動かす部分） | [2 章](02_INSTALL_WINDOWS.md#27-エミュレータの探し方) |
| e500dbg | VS Code 拡張とエミュレータをつなぐプログラム | [設計 6 章](../design/06_DEBUG_SERVER.md) |
| ESR-L | SC62015 のシャープでの名前 | [解析 2 章](../analysis/02_CPU.md) |
| FCS | ファイルを扱う ROM のエントリ（`FFFE4h`） | [6 章](06_INCLUDE_FILES.md#番号) |
| IMR、ISR | 割り込みの許可と要求のレジスタ | [6 章](06_INCLUDE_FILES.md#割り込みのビットimrisr) |
| IOCS | 画面、キー、ファイルなどを扱う ROM のエントリ（`FFFE8h`） | [3 章](03_ASSEMBLER_TUTORIAL.md#312-例題-9-文字を表示する) |
| `.lcd` | 240 × 32 ドットの絵のファイル | [12 章](12_DOT_EDITOR.md) |
| LOAD M | 機械語を読み込む BASIC の命令 | [14 章](14_TRANSFER.md#144-読み込んで実行する) |
| ORG | 置くアドレスを決める疑似命令 | [4 章](04_ASSEMBLER_REFERENCE.md#org) |
| PRE | 内部 RAM の指定方法を表す、命令の前の 1 バイト | [4 章](04_ASSEMBLER_REFERENCE.md#内部-ram) |
| ROM バージョン | 7.2 など。`FFFF0h` と `FFFF1h` にある | [解析 24 章](../analysis/24_ROM_VERSIONS_BASIC.md) |
| SC62015 | PC-E500 シリーズの CPU | [解析 2 章](../analysis/02_CPU.md) |
| SCR | システム制御のレジスタ（FDh）。ブザーなど | [6 章](06_INCLUDE_FILES.md#ブザーと-onbrk) |
| `.spr` | キャラクタの絵のファイル | [12 章](12_DOT_EDITOR.md#129-キャラクタspr) |
| S スタック、U スタック | リターンアドレスを積むスタックと、`PUSHU` のスタック | [3 章](03_ASSEMBLER_TUTORIAL.md#310-例題-7-サブルーチンとスタック) |
| VSIX | VS Code の拡張機能のファイル | [2 章](02_INSTALL.md#22-何を入れるか) |
| X: ドライブ | CE-140F。エミュレータでは PC のフォルダ | [14 章](14_TRANSFER.md) |
| Z（ゼロ） | 結果が 0 だったことを表すフラグ | [3 章](03_ASSEMBLER_TUTORIAL.md#37-例題-4-繰り返し) |

## あ行、か行

| 言葉 | 意味 | くわしく |
|---|---|---|
| アセンブラ | ASM を機械語に変えるプログラム | [3 章](03_ASSEMBLER_TUTORIAL.md#31-機械語とは) |
| アドレッシング | 値のある場所の指定のしかた | [4 章](04_ASSEMBLER_REFERENCE.md#45-オペランド) |
| ウォッチ | 値を見続けたい式 | [9 章](09_EMULATOR.md#94-変数とウォッチ) |
| オペランド | 命令の対象。`MV A,1` の `A` と `1` | [3 章](03_ASSEMBLER_TUTORIAL.md#34-例題-1-最小のプログラム) |
| 仮想画面 | LCD に送る前に描いておくメモリ（`screen`） | [6 章](06_INCLUDE_FILES.md#screeninc) |
| 外部メモリ | 20 ビットのアドレスのメモリ。`[ ]` で書く | [3 章](03_ASSEMBLER_TUTORIAL.md#311-例題-8-内部-ram) |
| 機械語エリア | 機械語を置くために確保した RAM | [14 章](14_TRANSFER.md#143-機械語エリアを確保する) |
| 逆アセンブル | 機械語を ASM に戻すこと | [15 章](15_DISASSEMBLER.md) |
| 疑似命令 | CPU の命令ではなく、アセンブラへの指示 | [4 章](04_ASSEMBLER_REFERENCE.md#47-疑似命令) |
| コール スタック | 今の場所までの、呼び出しの道すじ | [10 章](10_DEBUG.md#103-見るところ) |
| コマ | キャラクタの絵の 1 枚 | [12 章](12_DOT_EDITOR.md#コマ) |
| コントローラ（LCD） | 画面を受け持つ IC。2 個ある | [19 章](19_FILE_FORMATS.md#193-lcd) |

## さ行、た行

| 言葉 | 意味 | くわしく |
|---|---|---|
| サイクル | CPU の時間の単位。約 1.3 マイクロ秒 | [5 章](05_INSTRUCTIONS.md#51-表の読み方) |
| シンボル | ラベルと定数の名前 | [4 章](04_ASSEMBLER_REFERENCE.md#ラベルと名前) |
| スタック | 後から積んだものを先に取り出す置き場 | [3 章](03_ASSEMBLER_TUTORIAL.md#310-例題-7-サブルーチンとスタック) |
| ステップ実行 | 1 命令（1 行）ずつ進めること | [10 章](10_DEBUG.md#102-操作) |
| スニペット | 短い言葉で入る、決まった数行 | [8 章](08_EDITOR.md#87-スニペット) |
| スロット | 内蔵 RAM とカードの区画（S1:〜S3:） | [解析 3 章](../analysis/03_MEMORY.md) |
| セグメント | 64 KB の区画。`JP` と `CALL` が届く範囲 | [4 章](04_ASSEMBLER_REFERENCE.md#46-分岐) |
| 即値 | 命令の中に書いた数。`MV A,1` の 1 | [4 章](04_ASSEMBLER_REFERENCE.md#44-数と式) |
| ターン | ゲームのループ 1 周 | [7 章](07_GAME.md#72-ゲームの流れ) |
| 中間コード | BASIC の命令を 1〜2 バイトにしたもの | [解析 14 章](../analysis/14_BASIC_REFERENCE.md) |
| デバッグサーバー | `e500dbg` | [設計 6 章](../design/06_DEBUG_SERVER.md) |

## な行〜わ行

| 言葉 | 意味 | くわしく |
|---|---|---|
| 内部 RAM | CPU の中の 256 バイト。`( )` で書く | [3 章](03_ASSEMBLER_TUTORIAL.md#311-例題-8-内部-ram) |
| ニーモニック | 命令の名前。`MV`、`ADD` など | [5 章](05_INSTRUCTIONS.md) |
| ヒープ、空き | BASIC のプログラムと変数の間の RAM | [10 章](10_DEBUG.md#メモリマップ) |
| ビット | 2 進の 1 桁。右端がビット 0 | [3 章](03_ASSEMBLER_TUTORIAL.md#数の書き方) |
| フラグ | 計算の結果の印。`C` と `Z` | [3 章](03_ASSEMBLER_TUTORIAL.md#38-例題-5-比べる) |
| ブレークポイント | 止める印を付けた行 | [10 章](10_DEBUG.md#101-はじめの一歩) |
| ページ（LCD） | 縦 8 ドットの行 | [19 章](19_FILE_FORMATS.md#193-lcd) |
| 変位 | 基準からの離れ。`[X+5]` の 5 | [4 章](04_ASSEMBLER_REFERENCE.md#外部メモリ) |
| マスク | キャラクタの、描く所と描かない所の印 | [12 章](12_DOT_EDITOR.md#129-キャラクタspr) |
| ラベル | アドレスに付けた名前 | [4 章](04_ASSEMBLER_REFERENCE.md#ラベルと名前) |
| リスト | アドレス、機械語、ソースを並べたファイル | [4 章](04_ASSEMBLER_REFERENCE.md#42-出力) |
| リトルエンディアン | 下位のバイトを小さいアドレスに置くこと | [3 章](03_ASSEMBLER_TUTORIAL.md#メモリとアドレス) |
| レジスタ | CPU の中の、計算用の領域 | [3 章](03_ASSEMBLER_TUTORIAL.md#レジスタ) |
| 割り込み | 今の処理を止めて、別の処理をすること | [解析 10 章](../analysis/10_SYSTEM.md) |
