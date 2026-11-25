# e500asm

SHARP PC-E500 シリーズ（CPU は SC62015 / ESR-L）用のクロスアセンブラです。SC62015 の全命令、PRE の自動生成、20 ビットのアドレス、`INCLUDE`、バイナリと Intel HEX の出力に対応しています。

このフォルダで、`examples` の `sum.asm` をアセンブルする例です。

Windows（PowerShell）

```powershell
.\e500asm.cmd examples\sum.asm -o examples\sum.bin -l examples\sum.lst -s examples\sum.sym
```

Linux、macOS

```sh
app/e500asm examples/sum.asm -o examples/sum.bin -l examples/sum.lst -s examples/sum.sym
```

`-o` は機械語、`-l` はリスト（アドレス、機械語、ソース）、`-s` はシンボル表（ラベルとアドレス）の出力先です。うまくいくと、大きさと先頭のアドレスが出ます。

```text
OK: 11 bytes, origin=B8000h -> ...\examples\sum.bin
```

| 読みたいこと | 文書 |
|---|---|
| 入れ方 | [Windows](../docs/manual/02_INSTALL_WINDOWS.md#28-コマンドのツールを入れる)、[Linux](../docs/manual/02_INSTALL_LINUX.md#25-e500asme500dasm-を作る)、[macOS](../docs/manual/02_INSTALL_MACOS.md#25-e500asme500dasm-を作る) |
| 機械語を 1 から | [アセンブラ入門](../docs/manual/03_ASSEMBLER_TUTORIAL.md) |
| オプション、書き方、疑似命令、エラー | [アセンブラの文法](../docs/manual/04_ASSEMBLER_REFERENCE.md) |
| 命令 | [命令一覧](../docs/manual/05_INSTRUCTIONS.md) |
| 実機で動かす | [実機へ送る](../docs/manual/14_TRANSFER.md) |
| ソースの作り | [設計: アセンブラ](../docs/design/02_ASSEMBLER.md) |
| ビルドとテスト | [設計: テスト、ビルド、配布](../docs/design/09_BUILD_TEST_RELEASE.md) |

## 入手

| OS | 方法 |
|---|---|
| Windows | [Releases](https://github.com/litchi-gh/pc-e500_tools/releases) から `e500asm.exe` を取得して `app\` に置く。または `.\build.cmd` でビルドする |
| Linux | `sh build.sh` でビルドする。`app/e500asm` ができる |
| macOS | `sh build.sh` でビルドする。`app/e500asm` ができる |

ビルドには .NET 10 SDK が要ります。`build.cmd` と `build.sh` は、自動テストを動かし、通れば、.NET を中に持った 1 つの実行ファイルを作ります。Windows x64 用の `e500asm.exe` は約 70 MB あるため、リポジトリに入れていません。

## フォルダ

| 場所 | 内容 |
|---|---|
| `e500asm.cmd` | `app/e500asm.exe` を呼び出す |
| `src/E500Assembler.Core/` | アセンブラ本体（C# のライブラリ） |
| `src/E500Assembler.Cli/` | コマンドライン |
| `tests/` | 自動テスト、実行ファイルの統合テスト（`cli_smoke.py`） |
| `examples/` | `sum.asm` と生成結果 |
| `docs/SOURCES.md` | 仕様の参照元と判断 |
| `build.cmd`、`build.sh` | ビルド（`-TestOnly` / `--test-only` でテストだけ） |
