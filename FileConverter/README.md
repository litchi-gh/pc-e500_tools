# ce140conv

CE-140F（[Sharp_ce140f_emul](https://github.com/ffxx68/Sharp_ce140f_emul) などの互換機の SD カード）に置くファイルと、PC のファイルを変換します。

| モード | 変換 | 実機の操作 |
|---|---|---|
| `text2bas` / `bas2text` | PC のテキスト ⇔ ASCII の BASIC | `LOAD` / `SAVE ,A` |
| `bin2bas` / `bas2bin` | 機械語 ⇔ `LOAD M` のファイル | `LOAD M` / `SAVE M` |
| `info` | 中身を調べる | − |

PATH に入れたときの例です。入れていないときは、`ce140conv` の所を Windows では `.\ce140conv.exe`、Linux と macOS では `./ce140conv` と打ちます（このフォルダで）。

```text
ce140conv text2bas PROG.TXT PROG.BAS
ce140conv bin2bas --addr 0xBEC00 code_raw.bin CODE.BIN
ce140conv info CODE.BIN
```

| 行 | 何をするか |
|---|---|
| 1 | PC のテキストから、実機の `LOAD` で読める BASIC を作る |
| 2 | 機械語に、アドレスと長さの入ったヘッダーを付けて、実機の `LOAD M` で読めるファイルを作る |
| 3 | ファイルの種類、大きさ、アドレスを表示する。ファイルは変えない |

| 読みたいこと | 文書 |
|---|---|
| オプション、文字コード表、困ったとき | [ファイル変換](../docs/manual/16_FILE_CONVERTER.md) |
| 実機との受け渡しの手順 | [実機へ送る](../docs/manual/14_TRANSFER.md) |
| ファイルの形 | [ファイル形式](../docs/manual/19_FILE_FORMATS.md#191-x-に置くファイル) |
| ソースの作り | [設計: ファイル変換](../docs/design/04_FILE_CONVERTER.md) |

## ビルド

C++17 の単一ソースです。このフォルダで打ちます。どちらも、最初に見つかったコンパイラで `ce140conv` を作るだけのスクリプトです。

| OS | コマンド | コンパイラを探す順 |
|---|---|---|
| Windows | `.\build.bat`（「Developer PowerShell for VS」などで） | `cl`、`g++`、`clang++` |
| Linux | `sh build.sh` | 環境変数 `CXX`、`g++`、`clang++`、`c++` |
| macOS | `sh build.sh` | 環境変数 `CXX`、`g++`、`clang++`、`c++` |

`ce140conv`（Windows は `ce140conv.exe`）と `charset_e500.tab` は同じ場所に置きます。
