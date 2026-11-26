# 2. インストールと設定

この章はツールを入れて、使える状態にするまでを説明します。[クイックスタート](01_QUICKSTART.md)で通った道を、もう少し広く、くわしく見る章です。

手順は OS ごとに分けてあります。自分の OS のものだけを上から順に進めてください。

[目次へ戻る](README.md)

| 自分の OS | 入れ方 | 入れた後の、コマンドでの使い方 |
|---|---|---|
| Windows | [インストールと設定（Windows）](02_INSTALL_WINDOWS.md) | [23 章](23_COMMAND_LINE_WINDOWS.md) |
| Linux | [インストールと設定（Linux）](02_INSTALL_LINUX.md) | [24 章](24_COMMAND_LINE_LINUX.md) |
| macOS | [インストールと設定（macOS）](02_INSTALL_MACOS.md) | [25 章](25_COMMAND_LINE_MACOS.md) |

このページにはどの OS でも同じこと（動作環境、何を入れるか、機種、ROM、フォルダ）を書きます。

## 2.1 動作環境

使えるのは次の環境です。OS ごとのくわしい表は [Windows](02_INSTALL_WINDOWS.md#動作環境)、[Linux](02_INSTALL_LINUX.md#動作環境)、[macOS](02_INSTALL_MACOS.md#動作環境) にあります。

| | Windows | Linux | macOS |
|---|---|---|---|
| OS | Windows 11 | Ubuntu 24.04 以降 | macOS 15 以降 |
| CPU | x64 | x64 | Apple シリコン、Intel |
| 動作を確かめた環境 | Windows 11 | Ubuntu 26.04（デスクトップ、WSL） | macOS 15（ROM を使わない動作） |

### ソフト

使う機能によって、要るものが違います。

| ソフト | バージョン | 要るとき |
|---|---|---|
| VS Code | 1.95 以降 | VS Code で作る |
| Node.js | 20.12 以降（22.22 と 24.22 で確認） | コマンド `e500`。Windows は、VS Code があればなくてもよい |
| .NET ランタイム | 10 | エミュレータで動かす（VS Code の `F5`、`e500 run`、`e500 test`） |
| .NET SDK | 10 | `e500asm`、`e500dasm`、拡張機能をソースから作る |
| PC-E500 エミュレータ | デバッグ用の関数があるもの | エミュレータで動かす |

配布している `e500asm.exe`、`e500dasm.exe`、`E500Disassembler.exe`（Windows）は、これだけで動きます。.NET も Node.js も要りません。

### PC の性能

| 項目 | 目安 |
|---|---|
| CPU | VS Code は 1.6 GHz 以上、エミュレータは 2 コア、2 GHz 程度以上 |
| メモリ | 4 GB 以上（VS Code だけで 1 GB 以上） |
| 画面 | 1280 × 800 以上 |
| インターネット | ダウンロードするときと、ソースから作る最初の 1 回だけ。使うときは要らない |

| 入れるもの | ディスクの大きさ |
|---|---|
| VS Code | 500 MB まで |
| 拡張機能 | 約 0.4 MB（VSIX の大きさ） |
| `e500asm`、`e500dasm` | 1 つ約 74 MB |
| `E500Disassembler`（Windows） | 約 116 MB |
| エミュレータ（Windows） | 約 120 MB |

VS Code の値は [VS Code の動作環境](https://code.visualstudio.com/docs/supporting/requirements)、エミュレータの値は[エミュレータの説明](https://github.com/litchi-gh/pc-e500_emulator_pockecom#動作環境)によります。.NET を使う機能の OS は [.NET 10 の対応 OS](https://github.com/dotnet/core/blob/main/release-notes/10.0/supported-os.md)に従います。

### 実機

| もの | 使えるもの |
|---|---|
| 本体 | PC-E500 シリーズ（PC-E500、PC-E500S、PC-E550、PC-E650、PC-1480U、PC-1490U、PC-1490UII、PC-U6000 など、CPU が SC62015 の機種） |
| ROM | 自分の本体から吸い出した 256 KB か 384 KB のもの（[2.4](#24-rom-について)）。エミュレータを使うときだけ要る |
| ファイルを渡す機器 | CE-140F か互換機（[実機へ送る](14_TRANSFER.md)）。実機で動かすときだけ要る |

## 2.2 何を入れるか

ツールはどれも独立していて、必要なものだけを入れられます。自分のしたいことの行を見て、入れるものを決めてください。

| したいこと | 入れるもの |
|---|---|
| VS Code で作って、エミュレータで動かす（Windows） | 拡張機能、エミュレータ、ROM、.NET 10 のランタイム |
| VS Code で書くだけ | 拡張機能 |
| コマンドで作る、AI に書かせる | 拡張機能（中に `e500` が入っている）、Node.js |
| コマンドで動かす、テストする | 上に加えて、エミュレータ、ROM、.NET 10 のランタイム |
| アセンブルだけする | `e500asm` |
| 機械語を読む | `e500dasm`（コマンド）か `E500Disassembler`（画面、Windows） |
| 実機用のファイル（BIN、BAS）を作る | 拡張機能（`e500 bin`）。機械語だけなら `e500asm` |

OS によって使えるものが違います。

| ツール | Windows x64 | Linux | macOS |
|---|---|---|---|
| VS Code 拡張の編集、診断、ドットエディタ | ○ | ○ | ○ |
| VS Code 拡張の実行、デバッグ、テスト（`F5` など） | ○ | − | − |
| コマンド `e500` の `asm` `dis` `lint` `bin` `help` `new` `skill` | ○ | ○ | ○ |
| コマンド `e500` の `run` `test` | ○ | ○ | ○ |
| `e500asm`、`e500dasm` | ○（EXE を配布） | ○（ソースから作る） | ○（ソースから作る） |
| `E500Disassembler`（画面） | ○ | − | − |

### 入れるものの正体

| もの | 何か | 何のために要るか |
|---|---|---|
| VS Code | Microsoft の無料のエディタ | プログラムを書く |
| 拡張機能（`.vsix`） | VS Code に機能を足すファイル。中にコマンド `e500` も入っている | 色分け、間違いの表示、実行、テスト |
| .NET 10 **ランタイム** | .NET のプログラムを**動かす**部品 | エミュレータを操作する `e500dbg` を動かす |
| .NET 10 **SDK** | .NET のプログラムを**作る**道具。ランタイムも入っている | `e500asm`、`e500dasm` をソースから作る |
| Node.js（20.12 以降） | JavaScript を動かすプログラム | コマンド `e500` を動かす（Windows で VS Code があれば、なくてもよい） |
| Git | ソースを取ってきて、変更を管理するプログラム | リポジトリを PC にコピーする |
| エミュレータ | PC の中で PC-E500 を動かすプログラム | 実機なしで試す |
| ROM | 本体から吸い出したデータ | エミュレータを動かす（[2.4](#24-rom-について)） |

ランタイムと SDK は、使うだけならランタイム、ソースから作るなら SDK です。SDK を入れれば、ランタイムを別に入れる必要はありません。

## 2.3 機種に合わせる

PC-E500 シリーズは同じ CPU と、ほぼ同じアドレスの使い方をしています。それでも、内蔵 RAM の大きさ、文字の形、BASIC の命令、キーの並びに違いがあります。自分の本体で動かすなら、ROM と RAM を自分の本体に合わせてから試すのが確実です。

動かしたい機種の ROM と、内蔵 RAM の大きさを選びます。

| 機種 | ROM の大きさ | 内蔵 RAM（KB） |
|---|---|---|
| PC-E500、PC-E500PJ、PC-1480U | 256 KB | 32 |
| PC-E550、PC-1490UII | 256 KB | 64 |
| PC-E500S | 384 KB | 32 |
| PC-E650、PC-U6000 | 384 KB | 64 |

機種ごとの違いは[機種ガイド](../analysis/29_MODELS.md)にあります。

### コマンドで動かすとき（どの OS も同じ）

```text
e500 run prog.asm --rom 8.5
e500 run prog.asm --rom 8.5 --ram 64
```

| 行 | 何をするか |
|---|---|
| 1 | 名前に `8.5` を含む ROM（`PC-E650(8.5).ROM` など）で動かす。内蔵 RAM の大きさは ROM の名前で決まる |
| 2 | 内蔵 RAM の大きさ（KB）も自分で決める |

どちらもそのときだけ機種が変わります。

### VS Code の F5 で動かすとき（Windows）

ROM と内蔵 RAM の大きさを設定に書きます。

```jsonc
// 設定（settings.json）の例: PC-E650
{
  "pcE500.romPath": "C:/PockeCom/rom/PC-E650(8.5).ROM",
  "pcE500.ramKB": 64
}
```

いくつかの機種で試すときは、`launch.json` に機種ごとの構成を並べておくと、「実行とデバッグ」の一覧から選べます。

```jsonc
{
  "version": "0.2.0",
  "configurations": [
    { "type": "pc-e500", "request": "launch", "name": "PC-E500", "program": "${file}",
      "rom": "C:/PockeCom/rom/PC-E500(7.2).ROM", "ram": 32 },
    { "type": "pc-e500", "request": "launch", "name": "PC-E500S", "program": "${file}",
      "rom": "C:/PockeCom/rom/PC-E500S(8.3).ROM", "ram": 32 },
    { "type": "pc-e500", "request": "launch", "name": "PC-E650", "program": "${file}",
      "rom": "C:/PockeCom/rom/PC-E650(8.5).ROM", "ram": 64 }
  ]
}
```

## 2.4 ROM について

ROM は自分の本体から吸い出したものを使います。ツールには入っていません。ほかの人に渡したり、公開したりしないでください。

| 確かめること | 方法 |
|---|---|
| 大きさ | 262144 バイト（256 KB）か 393216 バイト（384 KB） |
| バージョン | `e500 check`、または VS Code（Windows）の「環境を確認」の「起動の確認」に `ROM Ver.7.2` のように出る |
| 実機のバージョン | `PRINT PEEK &HFFFF0;PEEK &HFFFF1` |

## 2.5 フォルダの構成

リポジトリの中は次のとおりです。

| フォルダ | 内容 |
|---|---|
| `Assembler/` | e500asm |
| `DisAssembler/` | e500dasm、E500Disassembler |
| `VSCodeExtensions/pc-e500-devtools/` | VS Code 拡張、コマンド `e500` |
| `Samples/` | サンプル（アセンブラ、BASIC） |
| `docs/manual/` | このマニュアル |
| `docs/design/` | 設計 |
| `docs/analysis/` | CPU、ROM、ハードウェアの解析資料 |

自分のプログラムはどのフォルダに置いてもかまいません。
