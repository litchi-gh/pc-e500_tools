# PockeCom PC-E500 Tools

SHARP ポケットコンピュータ PC-E500 シリーズ（PC-E500 / PC-E550 / PC-E650 / PC-1480U など、CPU に SC62015〔ESR-L〕を搭載した機種）向けの開発ツールと解析資料をまとめたリポジトリです。

現代の PC 上で機械語・BASIC プログラムを書き、[Sharp_ce140f_emul](https://github.com/ffxx68/Sharp_ce140f_emul)（CE-140F ディスクドライブエミュレータ）の SD カード経由で実機へ転送するまでの一連の作業を対象にしています。

## 収録内容

| フォルダ | 内容 |
|---|---|
| [Assembler/](Assembler/) | SC62015 用クロスアセンブラ `e500asm`（C# / .NET、Windows x64 用 EXE 同梱） |
| [DisAssembler/](DisAssembler/) | SC62015 用逆アセンブラ `e500dasm`（CLI）と `E500Disassembler`（GUI） |
| [FileConverter/](FileConverter/) | CE-140F エミュレータ用ファイルコンバータ `ce140conv`（C++17 単一ソース） |
| [VSCodeExtensions/](VSCodeExtensions/) | VS Code 拡張 `Pocket BASIC / ASM Linter`（PC-E500 BASIC と `e500asm` 用 ASM の構文チェック・シンタックスハイライト） |
| [Analysis/](Analysis/) | ROM 8.5 解析結果および技術資料（BASIC 命令、IOCS、ハードウェア、CPU 命令セットなど） |

## ワークフロー

```text
  .asm ──(e500asm)──▶ .bin ──(ce140conv bin2bas)──▶ .bas(LOAD M 用) ──▶ SD カード ──▶ 実機で LOAD M
  .txt ──────────────────(ce140conv text2bas)──────▶ .bas(LOAD 用)   ──▶ SD カード ──▶ 実機で LOAD
  .bin ◀─(ce140conv bas2bin)── SAVE M したファイル ──(e500dasm --format ce140f)──▶ .asm
```

1. **機械語を書く**: [Analysis/PC-E650_ASSEMBLER_MANUAL.md](Analysis/PC-E650_ASSEMBLER_MANUAL.md) と [Analysis/IOCS_REFERENCE.md](Analysis/IOCS_REFERENCE.md) を参照しながら ASM ソースを書き（VS Code に `Pocket BASIC / ASM Linter` を入れると編集中に `e500asm` と同じエラーが表示されます）、`Assembler/e500asm.cmd` でアセンブルします。
2. **転送用ファイルにする**: `FileConverter/ce140conv.exe bin2bas --addr <ロードアドレス>` で 16 バイトヘッダ付きの `LOAD M` 用ファイルに変換し、CE-140F エミュレータの SD カードへ置きます。
3. **BASIC を書く**: VS Code に `Pocket BASIC / ASM Linter` を入れて編集し、`ce140conv text2bas` で `LOAD` 用ファイルに変換します。
4. **実機のデータを読む**: `SAVE M` したファイルは `DisAssembler/e500dasm.cmd --format ce140f` でそのまま逆アセンブルできます。出力は `e500asm` で再アセンブルするとバイト単位で元に戻ります。

## 各フォルダの詳細

### Assembler/ — クロスアセンブラ e500asm

SC62015 の全命令、内部 RAM アドレッシング（BP / PX / PY と PRE バイトの自動生成）、外部メモリの 20 ビットアドレッシングに対応したコマンドラインアセンブラです。機械語については解析資料を参照してください。

```powershell
cd Assembler
.\e500asm.cmd examples\sum.asm -o examples\sum.bin -l examples\sum.lst -s examples\sum.sym
```

| パス | 内容 |
|---|---|
| `app/e500asm.exe` | ビルド済み Windows x64 実行ファイル（.NET ランタイム不要）。リポジトリには含まれないため [Releases](https://github.com/litchi-gh/pc-e500_tools/releases) から取得するか `build.cmd` で生成 |
| `e500asm.cmd` | `app/e500asm.exe` を呼び出すラッパー |
| `src/E500Assembler.Core/` | アセンブラ本体（C# ライブラリ。逆アセンブラからも参照） |
| `src/E500Assembler.Cli/` | コマンドラインフロントエンド |
| `tests/E500Assembler.Tests/` | 自動テスト（命令バイト列、PRE 全組合せ、前方参照、Intel HEX など） |
| `tests/cli_smoke.py` | EXE の統合テスト（Python 3） |
| `examples/` | サンプルソースと生成結果（`sum.asm` → `.bin` / `.hex` / `.lst` / `.sym`） |
| `docs/SOURCES.md` | 仕様の参照元（SHARP ESR-L Instruction Manual のページ対応）と設計判断 |
| `build.cmd` / `build.ps1` | ビルドスクリプト（.NET 10 SDK が必要） |

出力形式はヘッダなし生バイナリと Intel HEX。詳細な文法・疑似命令・オプションは [Assembler/README.md](Assembler/README.md) を参照してください。

### DisAssembler/ — 逆アセンブラ e500dasm / E500Disassembler

機械語を `e500asm` で再アセンブル可能なソースへ戻します。各命令をアセンブラのエンコーダで照合してから出力するため、生成された ASM は元のバイナリと完全一致で往復できます。機械語については解析資料を参照してください。

```powershell
cd DisAssembler
.\e500dasm.cmd program.bin --format raw --org B8000 -o program.asm   # 生バイナリ
.\e500dasm.cmd CODE.BAS --format ce140f -o CODE.asm                  # SAVE M したファイル
.\E500Disassembler.cmd                                                # GUI
```

| パス | 内容 |
|---|---|
| `app/e500dasm.exe` | CLI 版（Windows x64、.NET ランタイム不要）。[Releases](https://github.com/litchi-gh/pc-e500_tools/releases) から取得するか `build.cmd` で生成 |
| `app/E500Disassembler.exe` | GUI 版（ファイルのドラッグ＆ドロップ、形式選択、プレビュー）。同上 |
| `e500dasm.cmd` / `E500Disassembler.cmd` | それぞれのラッパー |
| `src/E500Disassembler.Core/` | 逆アセンブラ本体 |
| `src/E500Disassembler.Cli/` | CLI |
| `src/E500Disassembler.Gui/` | Windows Forms GUI |
| `tests/E500Disassembler.Tests/` | 全 256 オペコード・ランダムバイト列・往復一致のテスト |
| `build.cmd` / `build.ps1` | ビルドスクリプト（.NET 10 SDK が必要） |

RAW 形式では `--org` で開始アドレスを指定し、CE-140F の `SAVE M` 形式では 16 バイトヘッダから自動で読み取ります。詳細は [DisAssembler/README.md](DisAssembler/README.md) を参照してください。

### FileConverter/ — ce140conv

CE-140F エミュレータの SD カードに置くファイルと PC 上のファイルを相互変換します。

| モード | 変換 |
|---|---|
| `text2bas` / `bas2text` | PC テキスト ⇔ ASCII BASIC（実機の `LOAD` / `SAVE`） |
| `bin2bas` / `bas2bin` | 生バイナリ ⇔ 16 バイトヘッダ付き機械語ファイル（実機の `LOAD M` / `SAVE M`） |
| `info` | ファイル種別の判定とヘッダの hex ダンプ |

| パス | 内容 |
|---|---|
| `ce140conv.cpp` | ソース（C++17、依存ライブラリなし） |
| `ce140conv.exe` | ビルド済み Windows 実行ファイル |
| `charset_e500.tab` | Sharp 文字コード ⇔ Unicode 対応表（実行時に読み込み。編集可） |
| `build.bat` | ビルドスクリプト（`cl` → `g++` → `clang++` の順に探索） |

`SAVE M` が生成する 16 バイトヘッダの構造は実機 PC-E650 のダンプから確定しており、`bin2bas --addr` の出力は実機ファイルとバイト一致します。詳細は [FileConverter/README.md](FileConverter/README.md) を参照してください。

### VSCodeExtensions/ — Pocket BASIC / ASM Linter

PC-E500 シリーズの BASIC と、`e500asm` 用の SC62015 アセンブリソースを VS Code で編集するための拡張機能です。

- **BASIC** (`.bas` / `.basic` / `.e500`): 行番号の重複・並び順、未知の命令、`FOR/NEXT` などの対応、`GOTO` の分岐先の存在などを「問題」パネルに表示します。
- **ASM** (`.asm` / `.inc` / `.e500asm`): `E500Assembler.Core` を TypeScript に移植した診断エンジンで、未知のニーモニック、命令とオペランドの組合せ、未定義・重複シンボル、即値のビット幅、`JR` の変位範囲、セグメント境界、出力の重複、`INCLUDE` の未検出などを編集中に表示します。生成バイト列は `e500asm.exe` と一致します。設定 `pocketAsm.assemblerPath` に `Assembler/app/e500asm.exe` を指定すると、右クリックの「e500asm でアセンブル」で本物のアセンブラも実行できます。

| パス | 内容 |
|---|---|
| `pocket-basic-linter/pocket-basic-linter-0.2.0.vsix` | インストール用パッケージ（VS Code の「VSIX からのインストール」で導入） |
| `pocket-basic-linter/src/` | 拡張本体（TypeScript）。`dialects/` に BASIC の機種別定義、`asm/` にアセンブラの移植 |
| `pocket-basic-linter/syntaxes/` | TextMate 文法（BASIC / ASM のシンタックスハイライト） |
| `pocket-basic-linter/examples/sample.e500`, `sample.asm` | サンプルソース |
| `pocket-basic-linter/README.md` | チェック項目・診断コード・設定・方言追加の手順 |

BASIC のキーワードセットは [Analysis/BASIC_REFERENCE.md](Analysis/BASIC_REFERENCE.md)（ROM 8.5 解析）、ASM の記法は [Assembler/README.md](Assembler/README.md) に基づいています。開発は `npm install` → `F5` で Extension Development Host が起動し、`npm test` でアセンブラ本体と同じ golden vector を実行します。`e500asm` の命令表を変更したときは `src/asm/encoder.ts` にも反映してください。

### Analysis/ — 解析資料

PC-E500 / PC-E650 の ROM 8.5 解析と一次資料から整理した、機械語・BASIC プログラミング向けのリファレンスです。

| ファイル | 内容 |
|---|---|
| [PC-E650_ASSEMBLER_MANUAL.md](Analysis/PC-E650_ASSEMBLER_MANUAL.md) | SC62015 のレジスタ、アドレッシング、全ニーモニック、オペコード表、機械語の配置と呼び出し手順、`e500asm` / `e500dasm` の使い方 |
| [IOCS_REFERENCE.md](Analysis/IOCS_REFERENCE.md) | IOCS / FCS の呼び出し方（`CALLF FFFE8h`）、コマンド番号、ROM 上の入口表 |
| [HARDWARE_REFERENCE.md](Analysis/HARDWARE_REFERENCE.md) | メモリマップ、I/O ポート、LCD コントローラ、キーボード、コネクタなどのハードウェア情報 |
| [BASIC_REFERENCE.md](Analysis/BASIC_REFERENCE.md) | BASIC 全 168 キーワードの索引（中間コード token、分類、ROM 処理入口）と各命令の書式・引数 |
| [CHARACTER_FONT.md](Analysis/CHARACTER_FONT.md) | キャラクタフォント（6×8 ドット）の ROM 上の格納形式とポインタ |
| [PC-E650_ROM_MAP.md](Analysis/PC-E650_ROM_MAP.md) | ROM イメージのファイルオフセットと CPU アドレスの対応、主要入口 |
| [PC-E650_GDRIVE.md](Analysis/PC-E650_GDRIVE.md) | G: ドライブ（ROM 内蔵エンジニアソフト）のファイルシステム構造 |
| `asm_samples/` | `e500asm` でアセンブルできる小さなサンプル（`hello.asm`: IOCS で文字列表示、`add.asm`: メモリ加算、`bcd.asm`: DADL による BCD 加算） |

各資料は解析時点の記録です。参照元の操作説明書・技術資料の PDF 類は本リポジトリに含まれていません。

## 動作環境

- ビルド済みの実行ファイル（`e500asm.exe`, `e500dasm.exe`, `E500Disassembler.exe`, `ce140conv.exe`）は Windows x64 用で、追加ランタイムは不要です。
- .NET 製の 3 つの EXE（`e500asm.exe`, `e500dasm.exe`, `E500Disassembler.exe`）は自己完結型で 1 ファイル 70〜120 MB あり GitHub の上限を超えるため、リポジトリには含めていません。[Releases](https://github.com/litchi-gh/pc-e500_tools/releases) からダウンロードして `Assembler/app/`、`DisAssembler/app/` に置くか、各フォルダの `build.cmd` でビルドしてください（`app/` に生成されます）。`ce140conv.exe` と VSIX はリポジトリに含まれています。
- ソースからビルドする場合:
  - Assembler / DisAssembler: .NET 10 SDK
  - FileConverter: C++17 対応コンパイラ（MSVC / MinGW-w64 / LLVM のいずれか）
  - VSCodeExtensions: Node.js と npm
- 実機での動作検証は限定的です。アセンブラ・逆アセンブラは SHARP ESR-L Instruction Manual と既存の SC62015 エミュレータを基準に検証しています。

## 参考資料

- [Sharp_ce140f_emul](https://github.com/ffxx68/Sharp_ce140f_emul) — CE-140F ディスクドライブエミュレータ
  