# 文書

PC-E500 シリーズの文書は 4 冊の本に分かれています。本体を使う人は「ハンドブック」、PC で作る人は「マニュアル」、しくみを知りたい人は「解析」、このツール自体を直す人は「設計」から入ってください。

```mermaid
%%{init: {"htmlLabels": false, "flowchart": {"htmlLabels": false, "wrappingWidth": 1000}}}%%
flowchart LR
  H["ハンドブック<br>本体を使う"] --> M["マニュアル<br>PC で作る"]
  M --> A["解析<br>しくみを知る"]
  H --> A
  M --> D["設計<br>ツールを直す"]
  A --> D
```

| フォルダ | 内容 | こんな人に |
|---|---|---|
| [handbook/](handbook/README.md) | ハンドブック。電卓、統計、行列、BASIC の打ち込みなど、本体だけでの使い方 | 本体を使う人 |
| [manual/](manual/README.md) | マニュアル。クイックスタート、アセンブラ入門、全機能の使い方 | 使う人 |
| [design/](design/README.md) | 設計。ソースの作り、処理の流れ、テスト、配布 | 直す人 |
| [analysis/](analysis/README.md) | CPU、ROM、ハードウェアの資料 | 調べる人 |
| [images/](images/) | 図（SVG）と画面（PNG） | − |

## ハンドブック

| # | 文書 | # | 文書 |
|---|---|---|---|
| 1 | [はじめて使う](handbook/01_START.md) | 12 | [プログラムを書く](handbook/12_PROGRAMMING.md) |
| 2 | [キーボード](handbook/02_KEYBOARD.md) | 13 | [デバッグ](handbook/13_DEBUGGING.md) |
| 3 | [表示と電源](handbook/03_DISPLAY_POWER.md) | 14 | [関数と計算の範囲](handbook/14_FUNCTIONS.md) |
| 4 | [RAM カード](handbook/04_RAM_CARD.md) | 15 | [ファイルとドライブ](handbook/15_FILES.md) |
| 5 | [電卓（CAL）](handbook/05_CAL.md) | 16 | [PF キーと便利な使い方](handbook/16_PF_KEYS.md) |
| 6 | [RUN モードの計算](handbook/06_RUN.md) | 17 | [エラー一覧](handbook/17_ERRORS.md) |
| 7 | [エンジニアソフト（ENG）](handbook/07_ENG.md) | 18 | [文字コード表とキー一覧](handbook/18_CODES.md) |
| 8 | [AER（式の登録）](handbook/08_AER.md) | 19 | [困ったとき](handbook/19_TROUBLE.md) |
| 9 | [統計（STAT）](handbook/09_STAT.md) | 20 | [仕様と保守](handbook/20_SPECS.md) |
| 10 | [行列（MATRIX）](handbook/10_MATRIX.md) | 21 | [ほかの機種のプログラム](handbook/21_OTHER_MACHINES.md) |
| 11 | [BASIC の考え方](handbook/11_BASIC_CONCEPTS.md) | 22 | [機械語プログラムを動かす](handbook/22_MACHINE_CODE.md) |

## マニュアル

| # | 文書 | # | 文書 |
|---|---|---|---|
| 1 | [クイックスタート](manual/01_QUICKSTART.md)（[Windows](manual/01_QUICKSTART_WINDOWS.md)、[Linux](manual/01_QUICKSTART_LINUX.md)、[macOS](manual/01_QUICKSTART_MACOS.md)） | 14 | [実機へ送る](manual/14_TRANSFER.md) |
| 2 | [インストールと設定](manual/02_INSTALL.md)（[Windows](manual/02_INSTALL_WINDOWS.md)、[Linux](manual/02_INSTALL_LINUX.md)、[macOS](manual/02_INSTALL_MACOS.md)） | 15 | [逆アセンブラ](manual/15_DISASSEMBLER.md) |
| 3 | [アセンブラ入門](manual/03_ASSEMBLER_TUTORIAL.md) | 16 | [BASIC のファイルと文字](manual/16_BASIC_FILES.md) |
| 4 | [アセンブラの文法](manual/04_ASSEMBLER_REFERENCE.md) | 17 | [設定とコマンド](manual/17_SETTINGS.md) |
| 5 | [命令一覧](manual/05_INSTRUCTIONS.md) | 18 | [困ったとき](manual/18_TROUBLESHOOTING.md) |
| 6 | [INCLUDE ファイル](manual/06_INCLUDE_FILES.md) | 19 | [ファイル形式](manual/19_FILE_FORMATS.md) |
| 7 | [ゲームを作る](manual/07_GAME.md) | 20 | [逆引きレシピ](manual/20_RECIPES.md) |
| 8 | [編集](manual/08_EDITOR.md) | 21 | [用語集](manual/21_GLOSSARY.md) |
| 9 | [エミュレータのパネル](manual/09_EMULATOR.md) | 22 | [コマンド e500 と AI](manual/22_COMMAND_LINE_AI.md) |
| 10 | [デバッグ](manual/10_DEBUG.md) | 23 | [Windows のコマンド](manual/23_COMMAND_LINE_WINDOWS.md) |
| 11 | [テスト](manual/11_TESTS.md) | 24 | [Linux のコマンド](manual/24_COMMAND_LINE_LINUX.md) |
| 12 | [ドットエディタ](manual/12_DOT_EDITOR.md) | 25 | [macOS のコマンド](manual/25_COMMAND_LINE_MACOS.md) |
| 13 | [BASIC](manual/13_BASIC.md) | | |

## 設計

| # | 文書 | # | 文書 |
|---|---|---|---|
| 1 | [全体の構造](design/01_ARCHITECTURE.md) | 6 | [デバッグサーバー](design/06_DEBUG_SERVER.md) |
| 2 | [アセンブラ](design/02_ASSEMBLER.md) | 7 | [デバッガー](design/07_DEBUGGER.md) |
| 3 | [逆アセンブラ](design/03_DISASSEMBLER.md) | 8 | [INCLUDE ファイル](design/08_INCLUDE_FILES.md) |
| 4 | [実機のファイル](design/04_DEVICE_FILES.md) | 9 | [テスト、ビルド、配布](design/09_BUILD_TEST_RELEASE.md) |
| 5 | [VS Code 拡張](design/05_VSCODE_EXTENSION.md) | | |

## サンプル

[Samples/](../Samples/README.md) にアセンブラの例題と、BASIC の例があります。ゲームは別のリポジトリ [PC-E500 ゲーム集](https://github.com/litchi-gh/pc-e500_games)にあります。

## 解析資料

目次は [analysis/](analysis/README.md) にあります。

| 調べたいこと | 資料 |
|---|---|
| CPU、命令の動作、オペコード | [CPU（SC62015）](analysis/02_CPU.md) |
| 機械語の配置、呼び出しの規約 | [機械語を実機で動かす](analysis/12_MACHINE_CODE.md) |
| IOCS、ファイル制御 | [IOCS と FCS](analysis/11_IOCS.md) |
| ハードウェアの全体、キーボード | [ハードウェアの全体](analysis/01_HARDWARE.md) |
| LCD | [液晶（LCD）](analysis/04_LCD.md) |
| メモリ、RAM ディスク | [メモリ](analysis/03_MEMORY.md) |
| カード | [カードスロット](analysis/05_CARD_SLOT.md) |
| 起動、割り込み、タイマ、音 | [起動、割り込み、タイマ、音](analysis/10_SYSTEM.md) |
| BASIC の命令、内部形式 | [BASIC の命令と関数](analysis/14_BASIC_REFERENCE.md)、[BASIC の内部形式](analysis/15_BASIC_INTERNALS.md) |
| カセット | [カセットインターフェース](analysis/20_CASSETTE.md) |
| CE-140F、テープ、シリアル | [CE-140F の通信](analysis/17_CE-140F_DISK.md)、[11 ピン（テープ、周辺機器）](analysis/06_PORT_11PIN.md)、[15 ピン（シリアル）](analysis/07_PORT_15PIN.md) |
| 周辺機器、プロッタ | [周辺機器](analysis/16_PERIPHERALS.md)、[CE-515P プロッタ](analysis/19_CE-515P_PLOTTER.md) |
| IC、回路 | [IC チップ](analysis/08_IC_CHIPS.md)、[回路とサービス](analysis/09_CIRCUIT.md) |
| 文字のドット | [フォント](analysis/13_FONT.md) |
| ROM の中、バージョンの違い | [ROM マップ](analysis/21_ROM_MAP.md)、[ROM バージョンの違い: 配置](analysis/23_ROM_VERSIONS_MAP.md)、[BASIC](analysis/24_ROM_VERSIONS_BASIC.md)、[ドライバ](analysis/25_ROM_VERSIONS_DRIVERS.md)、[システム](analysis/26_ROM_VERSIONS_SYSTEM.md)、[機種](analysis/27_ROM_VERSIONS_MODELS.md)、[G: ドライブ](analysis/22_ROM_GDRIVE.md) |
| 外部資料 | [外部資料](analysis/28_RESOURCES.md) |
| 機種（PC-E500S など）の違い | [機種ガイド](analysis/29_MODELS.md) |
| 機械語を速くする、LCD に速く送る | [機械語を速くする](analysis/30_SPEED.md) |
