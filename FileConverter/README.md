# ce140conv — Sharp CE-140F エミュレータ用ファイルコンバータ

[Sharp_ce140f_emul](https://github.com/ffxx68/Sharp_ce140f_emul) の SD カードに置く
ファイルと、現代の PC 上のファイルを相互変換するコマンドラインツールです。

| モード | 変換 | Sharp 側の操作 |
|---|---|---|
| `text2bas` | PC テキスト → ASCII BASIC | `LOAD` |
| `bas2text` | ASCII BASIC → PC テキスト | — |
| `bin2bas`  | 生バイナリ → バイナリ(機械語)ファイル | `LOAD M` |
| `bas2bin`  | バイナリ(機械語)ファイル → 生バイナリ | — |
| `info`     | SD カード上ファイルの内容確認 | — |

## ビルド

C++17 の単一ソース・依存ライブラリ無しです。

```bat
build.bat
```

`build.bat` は `cl`(MSVC) → `g++`(MinGW) → `clang++` の順に探します。
コンパイラが未導入の場合は、以下のいずれかを入れて PATH を通してから再実行してください。

- **Visual Studio Build Tools**（`cl` が入る／推奨）
- **MSYS2 / MinGW-w64**（`g++`）
- **LLVM**（`clang++`）

手動ビルド例:

```bat
cl /nologo /EHsc /std:c++17 /O2 ce140conv.cpp /Fe:ce140conv.exe
g++ -std=c++17 -O2 -o ce140conv.exe ce140conv.cpp
```

## 使い方

```
ce140conv text2bas <in.txt> <out.bas> [options]
ce140conv bas2text <in.bas> <out.txt> [options]
ce140conv bin2bas  <in.bin> <out.bas> [options]
ce140conv bas2bin  <in.bas> <out.bin> [options]
ce140conv info     <file>
```

### テキスト系オプション

| オプション | 意味 |
|---|---|
| `--sjis` | PC テキストを Shift-JIS(CP932) として扱う（既定は UTF-8。Windows ビルドのみ） |
| `--cr` | Sharp 側の改行を CR のみにする（既定は CR+LF） |
| `--no-eof` | 末尾に EOF マーカ `0x1A` を付けない（`text2bas`） |
| `--lf` | 出力の改行を LF にする（`bas2text`。既定は CR+LF） |
| `--ascii` | 文字コード表を無視し ASCII のみ変換 |
| `--charset <file>` | 使用する Sharp 文字コード表（既定は exe と同じ場所／カレントの `charset_e500.tab`） |

### バイナリ系オプション

| オプション | 意味 |
|---|---|
| `--addr <n>` | `bin2bas` のロードアドレス（例: `--addr 0xB0000` / `--addr &HB0000`） |
| `--header <file>` | ちょうど 16 バイトのヘッダを差し込む（`bin2bas`） |
| `--save-header <f>` | 剥がした 16 バイトヘッダを保存（`bas2bin`） |

### 例

```bat
rem テキスト → LOAD できる ASCII BASIC
ce140conv text2bas PROG.TXT PROG.BAS

rem 日本語カナ入りソース（Shift-JIS）を変換
ce140conv text2bas --sjis KANA.TXT KANA.BAS

rem SD 上の ASCII BASIC を読める形へ
ce140conv bas2text PROG.BAS PROG.TXT

rem 機械語イメージ → LOAD M 用（暫定ヘッダ）
ce140conv bin2bas --addr 0xB0000 CODE.BIN CODE.BAS

rem LOAD M 用ファイルから生バイナリを取り出し、ヘッダも保存
ce140conv bas2bin CODE.BAS CODE.BIN --save-header CODE.HDR

rem 中身の確認（ASCII/バイナリ判定・ヘッダ hex ダンプ）
ce140conv info CODE.BAS
```

## ファイル形式の要点

- **ASCII ファイル（LOAD）**: プレーンテキスト。行区切りは CR+LF（`SAVE` の出力に合わせる）、
  末尾に EOF `0x1A`。エミュレータは先頭バイトが `0xFF` 以外なら ASCII と判定します。
- **バイナリファイル（LOAD M）**: `先頭 16 バイトのヘッダ（ポケコンが生成） + 本体`。
  先頭バイトが `0xFF`。16 バイトを剥がせば生イメージ、付け直せば `LOAD M` で読めます。

### 16 バイトヘッダ（実機 PC-E650 の `SAVE M` で確定）

| offset | 長さ | 内容 |
|---|---|---|
| 0–3 | 4 | `FF 00 06 01`（種別: 機械語）固定 |
| 4 | 1 | `10` 固定 |
| 5–7 | 3 | データ長 24bit リトルエンディアン |
| 8–10 | 3 | 開始アドレス 24bit リトルエンディアン |
| 11–13 | 3 | `FF FF FF` 固定 |
| 14–15 | 2 | `00 0F` 固定 |

可変なのは長さと開始アドレスの 2 フィールドだけで、残り 11 バイトは実機ダンプ 5 本すべてで一致しました。

```
S3A.ROM   ff 00 06 01 10  00 00 04  00 00 0c  ff ff ff  00 0f   len=0x040000 addr=0x0C0000
S3B.ROM   ff 00 06 01 10  00 00 02  00 00 02  ff ff ff  00 0f   len=0x020000 addr=0x020000
GRAPHRAM  ff 00 06 01 10  00 00 01  00 00 0b  ff ff ff  00 0f   len=0x010000 addr=0x0B0000
```

`bin2bas --addr <実アドレス>` が生成するヘッダは、この 5 本の実機ファイルと
バイト単位で一致することを確認済みです（`bas2bin` → `bin2bas` の往復が完全一致）。
実ファイルのヘッダをそのまま使いたい場合は、従来どおり
`bas2bin --save-header hdr.bin` → `bin2bas --header hdr.bin` が使えます。

BASIC を ASCII で保存したファイル（`LOAD` で読むテキスト）にはヘッダが付きません。
先頭バイトが `0xFF` かどうかが、そのままバイナリ／ASCII の判定になります。

## 文字コード表 `charset_e500.tab`

Sharp バイト ↔ Unicode の対応表で、実行時に読み込みます（再コンパイル不要で編集可能）。

- `0x20–0x7E` ASCII: 確定
- `0xA1–0xDF` 半角カナ: JIS X 0201 配列を既定（`(verify)` 印。E500 の文字 ROM で要確認）
- その他の記号（ギリシャ文字・数式記号など）: 判明分を追記していく方針

**表に無いバイトは Unicode 私用領域（`0xHH ↔ U+E000+HH`）を経由して無損失で往復**するため、
未マッピングの字があっても `bas2text → text2bas` はバイト完全一致になります。
```
