# 23. Windows のコマンド

この章は Windows で `e500` を使えるようにして、プログラムを作り、動かし、実機用のファイルにするまでを、PowerShell に打つとおりに説明します。1 行ごとに、何をするコマンドか、何が表示されるかを書きました。

Linux の人は [24 章](24_COMMAND_LINE_LINUX.md)、macOS の人は [25 章](25_COMMAND_LINE_MACOS.md)を読んでください。オプションの全部の意味は [22 章](22_COMMAND_LINE_AI.md#224-それぞれのコマンド)にあります。

[目次へ戻る](README.md)

| 節 | 内容 |
|---|---|
| [23.1](#231-始める前に) | PowerShell の開き方と、打ち方 |
| [23.2](#232-e500-を使えるようにする) | PATH に入れる |
| [23.3](#233-エミュレータを教える) | `run` と `test` の準備 |
| [23.4](#234-最初の-1-本を作る) | 作る、調べる、動かす、BIN にする |
| [23.5](#235-そのほかのコマンド) | アセンブル、逆アセンブル、調べもの、テスト |
| [23.6](#236-まとめて自動で行う) | スクリプトにする |
| [23.7](#237-ai-に書かせる) | Claude Code、Codex の準備 |
| [23.8](#238-困ったとき) | メッセージと対処 |

## 23.1 始める前に

### PowerShell を開く

スタートボタンを右クリックして「ターミナル」を選びます。`PS C:\Users\名前>` と出たら、その右に打って `Enter` を押します。

### この章の書き方

| 書き方 | 意味 |
|---|---|
| 枠の中の行 | 打つもの。`PS …>` は打たない |
| `#` より右 | 説明。打たなくてよい |
| `C:\MyGame` | 自分のプログラムを置くフォルダの例 |
| `C:\PockeCom\Emulator` | エミュレータのフォルダの例 |

### 最初に覚える PowerShell のコマンド

| コマンド | 何をするか |
|---|---|
| `cd フォルダ` | 今いるフォルダを移す |
| `cd ..` | 1 つ上のフォルダへ移る |
| `pwd` | 今いるフォルダを表示する |
| `dir` | 今いるフォルダのファイルを一覧にする |
| `mkdir フォルダ` | フォルダを作る |
| `start ファイル` | ファイルを、いつものアプリで開く（PNG なら画像のアプリ） |
| `↑` キー | 前に打ったコマンドを呼び出す |
| `Tab` キー | 途中まで打ったファイルの名前を補う |
| `Ctrl+C` | 動いているコマンドを止める |

空白のある名前は `"…"` で囲みます（例 `cd "C:\My Game"`）。

## 23.2 e500 を使えるようにする

`e500` は拡張機能の中に入っています。先に[拡張機能を入れて](02_INSTALL_WINDOWS.md#24-拡張機能を入れる)ください。Node.js があれば Node.js で、なければ VS Code の中のもので動くので、VS Code があれば Node.js は要りません。

### 1. 場所を調べる

```powershell
(Get-ChildItem "$HOME\.vscode\extensions\litchi-gh.pc-e500-devtools-*\bin").FullName
```

| 部分 | 意味 |
|---|---|
| `Get-ChildItem "…"` | 当てはまるフォルダやファイルを探す。`*` は「何でもよい」なので、バージョンの番号を打たなくて済む |
| `$HOME` | 自分のフォルダ（`C:\Users\名前`） |
| `( … ).FullName` | 見つかったものの、先頭からの完全な名前を表示する |

`e500.cmd` の入っている `bin` フォルダの名前が出ます。何も出なければ、拡張機能が入っていません。

リポジトリから使うときは、`C:\PockeCom\pc-e500_tools\VSCodeExtensions\pc-e500-devtools\bin` です。先に、その 1 つ上の `pc-e500-devtools` フォルダで次を 1 回ずつ実行します。

```powershell
npm ci
npm run compile
npm run build:server
```

| コマンド | 何をするか |
|---|---|
| `npm ci` | 作るのに要る部品を取ってくる |
| `npm run compile` | TypeScript のソースを、動かせる JavaScript（`out` フォルダ）に変える |
| `npm run build:server` | エミュレータを操作する `e500dbg` を作る（.NET 10 SDK が要る。`run` と `test` に使う） |

### 2. PATH に入れる

VS Code のターミナルでは、拡張が PATH に足してあるので、そのまま `e500` が使えます（拡張を入れた後に開いたターミナルから）。ここは、ほかのターミナルで使うときの設定です。

PATH は、Windows がコマンドを探すフォルダの一覧です。1 で出たフォルダを足すと、どこにいても `e500` だけで動きます。

1. スタートメニューで「環境変数」と打ち、「環境変数を編集」を開く。
2. 上の段（ユーザー環境変数）の `Path` を選び、「編集」→「新規」。
3. 1 で出た `bin` フォルダの名前を入れて、「OK」で閉じる。
4. **ターミナルを開き直す。**

拡張機能を更新すると、フォルダの名前のバージョンが変わります。そのときは、ここも直します。

試しに今のターミナルだけで使うなら、次の 1 行で足せます。ターミナルを閉じると元に戻ります。

```powershell
$env:Path += ";" + (Get-ChildItem "$HOME\.vscode\extensions\litchi-gh.pc-e500-devtools-*\bin").FullName
```

`$env:Path` は今のターミナルの PATH、`+=` は「後ろに付け足す」です。

### 3. 確かめる

```powershell
Get-Command e500
e500 --version
```

| コマンド | 何をするか | 正しいとき |
|---|---|---|
| `Get-Command e500` | `e500` と打ったときに動くものの場所を表示する | `e500.cmd` が出る |
| `e500 --version` | バージョンを表示する | `0.2.0` など |

## 23.3 エミュレータを教える

`e500 run` と `e500 test` はエミュレータと ROM を使います。[エミュレータと ROM を置いて](02_INSTALL_WINDOWS.md#25-エミュレータと-rom-を置く)から、次のどれかをします。

| やり方 | することと、向いている人 |
|---|---|
| A | 何もしない。インストーラーで入れた人、VS Code のユーザー設定で場所を決めた人 |
| B | 環境変数で教える。ZIP で展開した人 |
| C | そのたびに `--emulator フォルダ` を付ける。いくつも使い分ける人 |

### B. 環境変数で教える

```powershell
[Environment]::SetEnvironmentVariable('PCE500_EMULATOR', 'C:\PockeCom\Emulator', 'User')
```

| 部分 | 意味 |
|---|---|
| `[Environment]::SetEnvironmentVariable(…)` | 環境変数（プログラムに渡す設定）を保存する。PC を再起動しても残る |
| `'PCE500_EMULATOR'` | 変数の名前。`e500` がこの名前を読む |
| `'C:\PockeCom\Emulator'` | エミュレータのフォルダ |
| `'User'` | 自分のユーザーだけに設定する |

ターミナルを開き直すと効きます。今のターミナルだけで試すなら `$env:PCE500_EMULATOR = 'C:\PockeCom\Emulator'` です。取り消すときは、2 つ目の値を `$null` にして同じコマンドを打ちます。

### 確かめる

```powershell
e500 check
```

エミュレータと ROM を探し、実際に一度起動して、使えるかどうかを調べます。何も変えません。

```text
server: C:\Users\名前\.vscode\extensions\litchi-gh.pc-e500-devtools-0.2.0\out\server\e500dbg.exe
emulator: C:\PockeCom\Emulator
core: C:\PockeCom\Emulator\bin\e500core.dll
rom: C:\PockeCom\Emulator\rom\PC-E500(7.2).ROM
ram: 32
from: PCE500_EMULATOR
node: v24.22.1
started: ROM Ver.7.2, 32 KB, 387 ms
```

最後が `started:` なら使えます。`error:` なら、その右が理由です（[23.8](#238-困ったとき)）。各行の意味は [22.4](22_COMMAND_LINE_AI.md#e500-check) にあります。

## 23.4 最初の 1 本を作る

### 1. フォルダを作って、そこへ移る

```powershell
mkdir C:\MyGame
cd C:\MyGame
```

1 行目でフォルダを作り、2 行目でそこへ移ります。この後のコマンドはここで打ちます。

### 2. ゲームのひな形を作る

```powershell
e500 new mygame
```

`new` は「新しく作る」、`mygame` は名前です。続けて 2 つ聞かれるので、「何で作りますか？」に `2`（機械語）、「何を作りますか？」にそのまま `Enter`（キャラクタを動かすゲーム）と答えます。4 つのファイルができます。

```text
mygame.asm
mygame.lcd
mygamep.spr
mygames.spr
```

| ファイル | 内容 |
|---|---|
| `mygame.asm` | プログラム |
| `mygame.lcd` | 背景の絵 |
| `mygamep.spr`、`mygames.spr` | 顔と星のキャラクタの絵 |

`notepad mygame.asm` でメモ帳、`code mygame.asm` で VS Code を開いて書き直せます。

### 3. 間違いがないか調べる

```powershell
e500 lint .
```

`lint` は「間違いを探す」、`.` は「今いるフォルダの全部」です。プログラムは動かしません。

```text
1 ファイル、エラー 0 件、そのほか 0 件
```

### 4. エミュレータで動かす

```powershell
e500 run mygame.asm --seconds 2 --keys "RIGHT,RIGHT,wait:1" --png screen.png
```

| 部分 | 意味 |
|---|---|
| `run mygame.asm` | アセンブルして、エミュレータに入れ、動かす |
| `--seconds 2` | 2 秒動かす（エミュレータの中の時間） |
| `--keys "RIGHT,RIGHT,wait:1"` | その後、右キーを 2 回押して 1 秒待つ |
| `--png screen.png` | 終わったときの画面を、`screen.png` という画像にする |

```text
ROM Ver.7.2（256KB）、内蔵 RAM 32KB
初期化して BASIC の RUN モードにしました。
機械語エリアを 1C00h バイト確保しました（BE000〜BFBFF）。
BE000〜BF2CD に 4814 バイト書き込みました。
実行中（4.0 秒）
+----------------------------------------+
|    □□     □                            |
|           □         □□                 |
|                     □□                 |
|□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□□|
+----------------------------------------+
screen.png
state: running
```

枠の中は液晶の 40 文字 × 4 行です。文字でない絵は `□` になるので、絵を見たいときは `start screen.png` で画像を開きます。`state: running` は「時間まで動き続けていた」という意味で、ゲームなら正常です。

### 5. 実機用のファイルを作る

```powershell
e500 bin mygame.asm
```

`LOAD M` で読める `MYGAME.BIN` を作り、実機で打つ行を表示します。

```text
MYGAME.BIN: 4814 バイト、BE000〜BF2CD、開始 BE000
  POKE &HBFE03,&H1A,&HFD,&H0B,&H00,&H1C,&H00:CALL &HFFFD8
  LOAD M "X:MYGAME.BIN"
  CALL &HBE000
```

`MYGAME.BIN` を CE-140F 互換機の SD カードにコピーし、下の 3 行を実機の BASIC で打ちます（[実機へ送る](14_TRANSFER.md)）。

```powershell
Copy-Item MYGAME.BIN E:\
```

`Copy-Item ファイル 先` はファイルをコピーするコマンドです。`E:` は SD カードのドライブの例です。

## 23.5 そのほかのコマンド

### BASIC を動かす

```powershell
e500 run hello.bas
```

`hello.bas` を読み込んで `RUN` します。終わると、画面の下に変数の値も出ます。

```text
HELLO.BAS を CE-140F から読み込みました（4 行）。
終了（0.5 秒）
+----------------------------------------+
|                                       9|
|                                      16|
|                                      25|
|>                                       |
+----------------------------------------+
I=6
state: ended
```

`state: ended` は「最後まで動いて、BASIC に戻った」という意味です。

### ほかの機種で動かす

```powershell
e500 run hello.bas --rom 8.5 --no-screen
```

`--rom 8.5` は名前に `8.5` を含む ROM（`PC-E650(8.5).ROM` など）を使います。`--no-screen` は画面の文字を出しません。

### 命令や IOCS を調べる

```powershell
e500 help SCRN_PUTS
```

その言葉の書き方を表示します。

```text
[IOCS] SCRN_PUTS EQU $42
  指定位置へ n 文字表示（右端で止まる）（画面）
  引数: (BL) = x 座標（0〜39）、(BH) = y 座標（0〜3）、X = 文字列の先頭、Y = 長さ
  戻り: (BL)(BH) = 次の位置、X = 次のアドレス、Y = 残り、C=1: 途中で止まった
```

### アセンブルする

```powershell
e500 asm mygame.asm -o mygame_raw.bin -l mygame.lst -s mygame.sym
```

| 部分 | 意味 |
|---|---|
| `asm mygame.asm` | ソースを機械語にする |
| `-o mygame_raw.bin` | 機械語の出力先 |
| `-l mygame.lst` | リスト（アドレス、機械語、ソース）も作る |
| `-s mygame.sym` | シンボル表（ラベルとアドレス）も作る |

```text
OK: 4814 bytes, origin=BE000h -> C:\MyGame\mygame_raw.bin
```

**Windows はファイル名の大文字と小文字を区別しません。** `-o mygame.bin` にすると、`e500 bin` で作った `MYGAME.BIN` と同じファイルになり、上書きされます。ここでは `_raw` を付けて分けています。

### 逆アセンブルする

```powershell
e500 dis MYGAME.BIN -o game_dis.asm
e500 dis mygame_raw.bin --org BE000 -o raw_dis.asm
```

| コマンド | 何をするか |
|---|---|
| 1 行目 | `LOAD M` 用のファイルを ASM に戻す。アドレスはヘッダーから読む |
| 2 行目 | 機械語だけのファイルを ASM に戻す。アドレスを知らないので、`--org` で教える |

2 行目で `--org` を付けないと、`RAW input requires a start address (--org)` と出て止まります。

### メモリの中を見る

```powershell
e500 run mygame.asm --seconds 2 --memory "(star_x):2"
```

2 秒動かした後の、内部 RAM の `star_x` から 2 バイトを表示します。`( )` は PowerShell では特別な意味を持つので、`"…"` で囲みます。`( )` のないラベルやアドレス（`--memory BEC00:4` など）は、囲まなくてかまいません。

```text
(star_x):2 = 42 02
```

### テストする

```powershell
e500 test C:\PockeCom\pc-e500_tools\Samples
```

フォルダの下の `*.e500test.json` を全部実行します。`✓` が成功、`✕` が失敗です。

```text
  ✓ 1000 ÷ 7
  ✓ 0 で割る
  ✓ BASIC のエラーになる
成功 59 件、失敗 0 件
```

1 つのファイルだけなら `e500 test 03_add.e500test.json`、1 件だけなら `--only "3 + 4"` を付けます。

## 23.6 まとめて自動で行う

何度も行う作業はスクリプトにしておくと 1 行で済みます。次を `build.ps1` という名前で保存します。

```powershell
e500 lint .
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

e500 test .
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

e500 bin mygame.asm
```

| 行 | 何をするか |
|---|---|
| `e500 lint .` | 間違いを探す。エラーがあると終了コードが 1 になる |
| `$LASTEXITCODE` | すぐ前のコマンドの終了コード（[22.5](22_COMMAND_LINE_AI.md#225-終了コードと-json)） |
| `if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }` | 0 でなければ（`-ne` は「等しくない」）、そこでやめる。スクリプトの終了コードも同じ値にする |
| `e500 test .` | テストを実行する。失敗があると終了コードが 1 になる |
| `e500 bin mygame.asm` | 全部よければ、実機用のファイルを作る |

実行するには次のように打ちます。

```powershell
powershell -ExecutionPolicy Bypass -File build.ps1
```

`-File build.ps1` はそのスクリプトを実行する、`-ExecutionPolicy Bypass` は今回だけスクリプトの実行を許す、という意味です。PC の設定は変わりません。内容を知っているスクリプトだけに使ってください。

`mygame.asm` しかなく、テストのないフォルダでは、`e500 test` の 2 行を消して使います。

結果をくわしく使いたいときは、`--json` を付けて読み込みます。

```powershell
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$test = e500 test . --json | ConvertFrom-Json
$test.tests | Where-Object { -not $_.passed } | Format-List name, messages
```

| 行 | 何をするか |
|---|---|
| 1 | コマンドの出力を UTF-8 として読む。これがないと日本語が化けることがある |
| 2 | テストを実行し、結果の JSON を、PowerShell で扱える形に変えて `$test` に入れる |
| 3 | 通らなかったテストだけを選んで、名前と理由を表示する |

### バッチファイル（.cmd）で書く

```bat
call e500 lint .
if errorlevel 1 exit /b 1
call e500 bin mygame.asm
```

| 行 | 何をするか |
|---|---|
| `call e500 …` | `e500` を動かして、終わったら次の行へ進む。`e500` もバッチファイルなので、`call` を付けないと、そこで終わってしまう |
| `if errorlevel 1 exit /b 1` | 終了コードが 1 以上なら、そこでやめる |

### 記号を含む引数

`--type` や `--basic` に `>`、`&`、`|`、`"` を含む文字を渡すときは、PowerShell と、`e500` の起動に使われる `cmd` の両方が記号を読みます。`--%` を付けると、その後ろは PowerShell が変えずに渡します。全体を `"` で囲み、中の `"` は `\"` にします。

```powershell
e500 --% run game.asm --basic "PRINT 5>3"
e500 --% run game.bas --type "PRINT \"A\"\n"
```

記号が多いときは、文字をファイルに書いて `--type-file ファイル`、`--basic-file ファイル` で渡すと、書き方を気にせずに済みます（改行は RETURN）。

```powershell
e500 run game.bas --type-file keys.txt
```

`--%` も `"` も付けないと、`>` の後ろの名前のファイルに結果が書き込まれ、前の中身が消えます。`--org` などのアドレスは `&HBE000` ではなく `BE000` と書きます。

## 23.7 AI に書かせる

### どのフォルダでも使えるようにする（おすすめ）

Node.js が入っていれば、次の 1 行を 1 回だけ実行します。`e500` が入っていなくてもかまいません。

```powershell
npx.cmd -y pc-e500-tools@latest setup
```

| コマンド | 何をするか |
|---|---|
| `npx.cmd -y pc-e500-tools@latest` | 最新の `pc-e500-tools`（コマンド `e500` の入ったパッケージ）を取ってきて、その場で動かす。`-y` は、取ってくるかを聞かずに進めるという意味 |
| `setup` | ホームフォルダに、AI 用のスキルの入口を置く |

```text
C:\Users\名前\.claude\skills\pc-e500\SKILL.md
C:\Users\名前\.agents\skills\pc-e500\SKILL.md
Claude Code と Codex は、どのフォルダでも、このスキルを使います。本文は e500 guide が出します（いつも最新）。
```

これで、どのフォルダで AI を起動しても、PC-E500 のプログラムを頼めます。AI は作業のたびに最新の本文を読むので、置き直す必要はありません。

`npx` ではなく `npx.cmd` と打つのは、PowerShell の設定によっては `npx` が「スクリプトの実行が無効」で止まるためです。コマンドプロンプトでは `npx` でもかまいません。Codex の中では `npx` が使えないことがあるので、`npm install -g pc-e500-tools` で入れておくと確実です。

`e500` を自分でも使うなら、`npm install -g pc-e500-tools` で入れます。更新も同じコマンドです。

### 1 つのフォルダに置く

AI に渡すスキルを自分のフォルダに置きます。VS Code では、エクスプローラーでフォルダを右クリックして「AI 用のスキルを置く」を選んでも同じです。

```powershell
cd C:\MyGame
e500 skill
```

| コマンド | 何をするか |
|---|---|
| `cd C:\MyGame` | プログラムを作るフォルダへ移る |
| `e500 skill` | そのフォルダに、AI 用の案内（スキル）を置く |

```text
C:\MyGame\.claude\skills\pc-e500\SKILL.md
C:\MyGame\.claude\skills\pc-e500\references\assembly.md
…
C:\MyGame\.agents\skills\pc-e500\SKILL.md
…
```

そのまま同じターミナルで AI を起動します。

| AI | 起動のコマンド | 読む場所 |
|---|---|---|
| Claude Code | `claude` | `.claude\skills\pc-e500\` |
| Codex | `codex` | `.agents\skills\pc-e500\` |

拡張機能を更新したら、`e500 skill --force` で置き直します。`--force` は前のものを新しいものに置き換えるという意味で、自分で書き足した部分も消えます。頼み方の例は [22.6](22_COMMAND_LINE_AI.md#226-ai-に書かせる) にあります。

## 23.8 困ったとき

| 症状、メッセージ | 原因と対処 |
|---|---|
| `e500` が認識されない | PATH に入っていない、ターミナルを開き直していない（[23.2](#232-e500-を使えるようにする)） |
| `Node.js or VS Code is needed` | Node.js か VS Code を入れる |
| `エミュレータ（e500core.dll）が見つかりません` | `PCE500_EMULATOR` を設定する（[23.3](#233-エミュレータを教える)） |
| `ROM（*.ROM）がありません` | `rom` フォルダに ROM を置くか、`--rom ファイル` を付ける |
| `デバッグサーバーがありません` | 拡張機能を入れ直す。リポジトリから使うときは `npm run build:server` |
| `error:` に .NET のことが出る | .NET 10 のランタイムを入れる（[手順](02_INSTALL_WINDOWS.md#23-net-10-のランタイムを入れる)） |
| `用語 'star_x' は…認識されません` | `( )` の付いた値を囲んでいない。`"(star_x):2"` と書く |
| `RAW input requires a start address (--org)` | 機械語だけのファイル。`--org BE000` のように付ける。BIN のつもりなら、同じ名前で上書きしていないか確かめる |
| `既に存在します` | `e500 new` で同じ名前がある。別の名前にする |
| `$BEC00` が消える | PowerShell では `$` が特別な意味を持つ。`BEC00` か `0xBEC00` と書く |
| 日本語が化ける | 先に `[Console]::OutputEncoding = [Text.Encoding]::UTF8` を打つ |
