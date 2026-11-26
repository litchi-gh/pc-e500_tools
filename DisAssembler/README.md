# e500dasm / E500Disassembler

SC62015（ESR-L）の機械語を、`e500asm` でアセンブルし直せる ASM に戻します。出力は、元のバイト列と完全に一致するように作ります。

- `e500dasm`: コマンドライン（Windows、Linux、macOS）
- `E500Disassembler`: 画面（Windows）

このフォルダで打つ例です。

Windows（PowerShell）

```powershell
.\e500dasm.cmd CODE.BIN --format ce140f -o code.asm
.\e500dasm.cmd program.bin --format raw --org B8000 -o program.asm
.\E500Disassembler.cmd
```

Linux、macOS

```sh
app/e500dasm CODE.BIN --format ce140f -o code.asm
app/e500dasm program.bin --format raw --org B8000 -o program.asm
```

| 行 | 何をするか |
|---|---|
| 1 | 実機の `SAVE M` で保存したファイルを ASM に戻す。アドレスはヘッダーから読む |
| 2 | 機械語だけのファイルを ASM に戻す。アドレスは `--org` で教える |
| 3 | 画面で使うツールを開く（Windows だけ） |

| 読みたいこと | 文書 |
|---|---|
| 入れ方 | [Windows](../docs/manual/02_INSTALL_WINDOWS.md#28-コマンドのツールを入れる)、[Linux](../docs/manual/02_INSTALL_LINUX.md#25-e500asme500dasm-を作る)、[macOS](../docs/manual/02_INSTALL_MACOS.md#25-e500asme500dasm-を作る) |
| 使い方、オプション、出力の読み方 | [逆アセンブラ](../docs/manual/15_DISASSEMBLER.md) |
| `SAVE M` のファイルの形 | [ファイル形式](../docs/manual/19_FILE_FORMATS.md#191-x-に置くファイル) |
| ソースの作り | [設計: 逆アセンブラ](../docs/design/03_DISASSEMBLER.md) |
| ビルドとテスト | [設計: テスト、ビルド、配布](../docs/design/09_BUILD_TEST_RELEASE.md) |

## 入手

| OS | 方法 |
|---|---|
| Windows | [Releases](https://github.com/litchi-gh/pc-e500_tools/releases) から `e500dasm.exe`、`E500Disassembler.exe` を取得して `app\` に置く。または `.\build.cmd` でビルドする |
| Linux | `sh build.sh` でビルドする。`app/e500dasm` ができる |
| macOS | `sh build.sh` でビルドする。`app/e500dasm` ができる |

ビルドには .NET 10 SDK が要ります。`build.cmd` と `build.sh` は、逆アセンブラとアセンブラの自動テストを動かし、通れば実行ファイルを作ります。Windows x64 用の実行ファイルは 1 つ 70〜120 MB あるため、リポジトリに入れていません。

## フォルダ

| 場所 | 内容 |
|---|---|
| `e500dasm.cmd`、`E500Disassembler.cmd` | `app/` の実行ファイルを呼び出す |
| `src/E500Disassembler.Core/` | 逆アセンブラ本体（C# のライブラリ） |
| `src/E500Disassembler.Cli/`、`src/E500Disassembler.Gui/` | コマンドライン、画面 |
| `tests/` | 自動テスト |
| `build.cmd`、`build.sh` | ビルド（`-TestOnly` / `--test-only` でテストだけ） |
