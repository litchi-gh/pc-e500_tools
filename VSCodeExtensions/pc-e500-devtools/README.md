# PC-E500 開発ツール

SHARP PC-E500 シリーズ（PC-E500 / PC-E500S / PC-E550 / PC-E650 / PC-1480U / PC-U6000 など）のプログラムを VS Code で作るための拡張機能です。

| できること | くわしい説明 |
|---|---|
| ASM と BASIC の色分け、間違いの表示、候補、説明、定義へ移動 | [編集](https://github.com/litchi-gh/pc-e500_tools/blob/main/docs/manual/08_EDITOR.md)、[BASIC](https://github.com/litchi-gh/pc-e500_tools/blob/main/docs/manual/13_BASIC.md) |
| エミュレータで実行、デバッグ（Windows） | [パネル](https://github.com/litchi-gh/pc-e500_tools/blob/main/docs/manual/09_EMULATOR.md)、[デバッグ](https://github.com/litchi-gh/pc-e500_tools/blob/main/docs/manual/10_DEBUG.md) |
| `*.e500test.json` の自動テスト（Windows） | [テスト](https://github.com/litchi-gh/pc-e500_tools/blob/main/docs/manual/11_TESTS.md) |
| 画面の絵 `.lcd` とキャラクタ `.spr` のドットエディタ | [ドットエディタ](https://github.com/litchi-gh/pc-e500_tools/blob/main/docs/manual/12_DOT_EDITOR.md) |
| テンプレート、INCLUDE ファイル（IOCS の名前、画面、キャラクタ、キー、文字） | [INCLUDE ファイル](https://github.com/litchi-gh/pc-e500_tools/blob/main/docs/manual/06_INCLUDE_FILES.md)、[ゲームを作る](https://github.com/litchi-gh/pc-e500_tools/blob/main/docs/manual/07_GAME.md) |
| 実機用の BIN（`LOAD M`） | [実機へ送る](https://github.com/litchi-gh/pc-e500_tools/blob/main/docs/manual/14_TRANSFER.md) |

全部の文書は[マニュアルの目次](https://github.com/litchi-gh/pc-e500_tools/blob/main/docs/manual/README.md)にあります。

## はじめに

1. コマンド **「PC-E500: 環境を確認」** で、エミュレータのフォルダを選びます（`e500core.dll` と ROM があるフォルダ。編集だけなら不要）。
2. フォルダを右クリック →「新しいプログラムを作成」→「キャラクタを動かすゲーム」。
3. `F5` で動きます。

くわしい手順は[クイックスタート](https://github.com/litchi-gh/pc-e500_tools/blob/main/docs/manual/01_QUICKSTART.md)にあります。

| 拡張子 | 扱い |
|---|---|
| `.asm` `.inc` `.e500asm` | PC-E500 アセンブリ（`e500asm` と同じ文法、同じバイト列） |
| `.bas` `.basic` `.e500` | PC-E500 BASIC |
| `.lcd` `.pixels` `.spr` | ドットエディタ |
| `*.e500test.json` | テスト |

## 必要なもの

- 編集、診断、ドットエディタ: VS Code 1.95 以降だけ（Windows、Linux、macOS）
- エミュレータでの実行、デバッグ、テスト（VS Code の中から）: Windows 11（x64）、[.NET 10 のランタイム](https://dotnet.microsoft.com/download/dotnet/10.0)、PC-E500 エミュレータ（デバッグ用の関数を持つ `e500core.dll`）、自分の ROM

ROM とエミュレータは入っていません。

## 表示の言語

VS Code の表示言語が日本語なら日本語、それ以外は英語です。

## 開発

このフォルダで打ちます。どの OS でも同じです。

```text
npm ci
npm run build:server
npm test
code .
```

| コマンド | 何をするか |
|---|---|
| `npm ci` | 作るのに要る部品を取ってくる（最初の 1 回） |
| `npm run build:server` | エミュレータを操作する `e500dbg` を作る（.NET 10 SDK が要る） |
| `npm test` | コンパイルして、テストを全部動かす |
| `code .` | このフォルダを VS Code で開く。`F5` で開発用の VS Code が起動する |

作りは[設計: VS Code 拡張](https://github.com/litchi-gh/pc-e500_tools/blob/main/docs/design/05_VSCODE_EXTENSION.md)、[デバッグサーバー](https://github.com/litchi-gh/pc-e500_tools/blob/main/docs/design/06_DEBUG_SERVER.md)、[デバッガー](https://github.com/litchi-gh/pc-e500_tools/blob/main/docs/design/07_DEBUGGER.md)にあります。

## ライセンス

MIT です。エミュレータのコアは GPL-2.0-or-later の別のプログラムで、実行時に利用者のものを読み込みます。
