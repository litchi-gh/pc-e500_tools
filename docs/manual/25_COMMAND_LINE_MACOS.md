# 25. macOS のコマンド

この章は、macOS で `e500` を使えるようにして、プログラムを作り、調べ、動かし、実機用のファイルにするまでを、**ターミナルに打つとおり**に説明します。1 行ごとに、何をするコマンドか、何が表示されるかを書きました。

Windows の人は [23 章](23_COMMAND_LINE_WINDOWS.md)、Linux の人は [24 章](24_COMMAND_LINE_LINUX.md)を読んでください。オプションの全部の意味は [22 章](22_COMMAND_LINE_AI.md#224-それぞれのコマンド)にあります。

[目次へ戻る](README.md)

| 節 | 内容 |
|---|---|
| [25.1](#251-始める前に) | ターミナルの使い方 |
| [25.2](#252-e500-を使えるようにする) | どこからでも `e500` と打てるようにする |
| [25.3](#253-エミュレータを教える) | `run` と `test` の準備 |
| [25.4](#254-最初の-1-本を作る) | 作る、調べる、動かす、BIN にする |
| [25.5](#255-そのほかのコマンド) | アセンブル、逆アセンブル、調べもの |
| [25.6](#256-まとめて自動で行う) | スクリプトにする |
| [25.7](#257-ai-に書かせる) | Claude Code、Codex の準備 |
| [25.8](#258-困ったとき) | メッセージと対処 |

## 25.1 始める前に

### この章の書き方

| 書き方 | 意味 |
|---|---|
| 枠の中の行 | 打つもの。`%` で終わるプロンプトは打たない |
| `~` | 自分のホームフォルダ（`/Users/名前`） |
| `~/mygame` | 自分のプログラムを置くフォルダの例 |
| `~/pockecom` | ツールを置くフォルダの例 |

### 最初に覚えるターミナルのコマンド

| コマンド | 何をするか |
|---|---|
| `cd フォルダ` | 今いるフォルダを移す。`cd` だけならホームへ |
| `cd ..` | 1 つ上のフォルダへ移る |
| `pwd` | 今いるフォルダを表示する |
| `ls` | 今いるフォルダのファイルを一覧にする |
| `mkdir フォルダ` | フォルダを作る |
| `open ファイル` | ファイルを、いつものアプリで開く。`open .` は今いるフォルダを Finder で開く |
| `↑` キー | 前に打ったコマンドを呼び出す |
| `tab` キー | 途中まで打ったファイルの名前を補う |
| `control+C` | 動いているコマンドを止める |

空白や `( )` のある名前は `'…'` で囲みます。macOS のふつうの設定では、**ファイル名の大文字と小文字は区別されません**（`mygame.bin` と `MYGAME.BIN` は同じファイル）。

## 25.2 e500 を使えるようにする

`e500` は拡張機能の中に入っています。先に[拡張機能を入れる](02_INSTALL_MACOS.md#23-拡張機能コマンド-e500を入れる)か、`.vsix` を展開してください。Node.js（20.12 以降）が要ります。

### 1. 場所を調べる

`e500` のファイルは、入れ方によって次の場所にあります。

| 入れ方 | 場所 |
|---|---|
| `.vsix` を展開した | `~/pockecom/devtools/extension/bin/e500` |
| VS Code に入れた | `~/.vscode/extensions/pokecom-tools.pc-e500-devtools-<バージョン>/bin/e500` |
| リポジトリ | `~/pockecom/pc-e500_tools/VSCodeExtensions/pc-e500-devtools/bin/e500` |

リポジトリから使うときは、先に `pc-e500-devtools` フォルダで次を 1 回ずつ実行します。

```sh
npm ci
npm run compile
```

| コマンド | 何をするか |
|---|---|
| `npm ci` | 作るのに要る部品を取ってくる（`npm` は Node.js に付いている） |
| `npm run compile` | TypeScript のソースを、動かせる JavaScript（`out` フォルダ）に変える |

### 2. どこからでも打てるようにする

`e500` という名前の短いファイルを、自分用のコマンドを置くフォルダ（`~/.local/bin`）に作ります。中身は「本物の `e500` を呼び出す」だけです。

```sh
mkdir -p ~/.local/bin
cat > ~/.local/bin/e500 <<'EOF'
#!/bin/sh
exec sh "$HOME/pockecom/devtools/extension/bin/e500" "$@"
EOF
chmod +x ~/.local/bin/e500
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

| 部分 | 何をするか |
|---|---|
| `mkdir -p ~/.local/bin` | フォルダを作る。既にあれば何もしない |
| `cat > ファイル <<'EOF'` 〜 `EOF` | 間の行を、そのままファイルに書き込む。前の内容は置き換わる |
| `#!/bin/sh` | このファイルを `sh` で動かす、という印 |
| `exec sh "…/e500" "$@"` | 本物の `e500` を動かす。`"$@"` は、打った引数をそのまま渡すという意味。**パスは 1 の表の自分の場所に替える** |
| `chmod +x ファイル` | 「実行してよい」という印を付ける |
| `echo '…' >> ~/.zshrc` | ターミナルを開いたときに読まれる `~/.zshrc` の最後に、PATH（コマンドを探すフォルダの一覧）へ `~/.local/bin` を足す行を書き加える。1 回だけ打つ |
| `source ~/.zshrc` | 今のターミナルで読み直す |

### 3. 確かめる

```sh
which e500
e500 --version
```

| コマンド | 何をするか | 正しいとき |
|---|---|---|
| `which e500` | `e500` と打ったときに動くファイルを表示する | `/Users/名前/.local/bin/e500` |
| `e500 --version` | バージョンを表示する | `0.3.0` など |

メッセージは、Mac の言語が日本語なら日本語です。英語で出るときは、次の 2 行を打ちます。

```sh
echo 'export E500_LANG=ja' >> ~/.zshrc
source ~/.zshrc
```

`E500_LANG` は `e500` の表示の言語を決める環境変数で、`ja` か `en` です。

## 25.3 エミュレータを教える

`e500 run` と `e500 test` は、エミュレータと ROM、.NET 10 のランタイムを使います。[エミュレータと ROM を置いて](02_INSTALL_MACOS.md#24-エミュレータと-rom-を置く)から、次のどちらかをします。

| やり方 | することと、向いている人 |
|---|---|
| A | 環境変数で教える。いつも同じものを使う人 |
| B | そのたびに `--emulator フォルダ` を付ける。いくつも使い分ける人 |

### A. 環境変数で教える

```sh
echo 'export PCE500_EMULATOR="$HOME/pockecom/pokecom-<バージョン>-osx-arm64"' >> ~/.zshrc
source ~/.zshrc
```

| 部分 | 意味 |
|---|---|
| `export 名前=値` | 環境変数（プログラムに渡す設定）を決める |
| `PCE500_EMULATOR` | 変数の名前。`e500` がこの名前を読む |
| `"$HOME/pockecom/…"` | エミュレータのフォルダ。`libe500core.dylib` があるフォルダを書く。Intel の Mac は `osx-x64` |
| `echo '…' >> ~/.zshrc` | その行を `~/.zshrc` の最後に書き加える。次に開くターミナルから、いつも効く |
| `source ~/.zshrc` | 今のターミナルで読み直す |

### 確かめる

```sh
e500 check
```

エミュレータと ROM を探し、実際に一度起動して、使えるかどうかを調べます。何も変えません。

```text
server: /Users/名前/pockecom/devtools/extension/out/server/e500dbg.dll
emulator: /Users/名前/pockecom/pokecom-<バージョン>-osx-arm64
core: /Users/名前/pockecom/pokecom-<バージョン>-osx-arm64/libe500core.dylib
rom: /Users/名前/pockecom/pokecom-<バージョン>-osx-arm64/rom/PC-E500(7.2).ROM
ram: 32
from: PCE500_EMULATOR
node: v22.23.5
started: ROM Ver.7.2, 32 KB, 223 ms
```

最後が `started:` なら使えます。`error:` なら、その右が理由です（[25.8](#258-困ったとき)）。各行の意味は [22.4](22_COMMAND_LINE_AI.md#e500-check) にあります。

## 25.4 最初の 1 本を作る

### 1. フォルダを作って、そこへ移る

```sh
mkdir -p ~/mygame
cd ~/mygame
```

1 行目でフォルダを作り、2 行目でそこへ移ります。この後のコマンドは、ここで打ちます。

### 2. ゲームのひな形を作る

```sh
e500 new game mygame
```

`new` は「テンプレートから作る」、`game` は種類、`mygame` は名前です。4 つのファイルができます。

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

`open -e mygame.asm` でテキストエディット、`code mygame.asm` で VS Code を開いて書き直せます。VS Code なら、`.lcd` と `.spr` の絵も描けます。

### 3. 間違いがないか調べる

```sh
e500 lint .
```

`lint` は「間違いを探す」、`.` は「今いるフォルダの全部」です。プログラムは動かしません。

```text
1 ファイル、エラー 0 件、そのほか 0 件
```

### 4. エミュレータで動かす

```sh
e500 run mygame.asm --seconds 2 --keys RIGHT,RIGHT,wait:1 --png screen.png
```

| 部分 | 意味 |
|---|---|
| `run mygame.asm` | アセンブルして、エミュレータに入れ、動かす |
| `--seconds 2` | 2 秒動かす（エミュレータの中の時間） |
| `--keys RIGHT,RIGHT,wait:1` | その後、右キーを 2 回押して 1 秒待つ |
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

枠の中は液晶の 40 文字 × 4 行です。文字でない絵は `□` になるので、絵を見たいときは `open screen.png` で画像を開きます。`state: running` は「時間まで動き続けていた」という意味で、ゲームなら正常です。

### 5. 実機用のファイルを作る

```sh
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

```sh
cp MYGAME.BIN /Volumes/SDCARD/
```

`cp ファイル 先` は、ファイルをコピーするコマンドです。`/Volumes/SDCARD` は SD カードの場所の例で、実際の名前は `ls /Volumes` で調べます。

## 25.5 そのほかのコマンド

### BASIC を動かす

```sh
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

```sh
e500 run hello.bas --rom 8.5 --no-screen
```

`--rom 8.5` は、`rom` フォルダの中の、名前に `8.5` を含む ROM（`PC-E650(8.5).ROM` など）を使います。`--no-screen` は、画面の文字を出しません。

### 命令や IOCS を調べる

```sh
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

```sh
e500 asm mygame.asm -o mygame_raw.bin -l mygame.lst -s mygame.sym
```

| 部分 | 意味 |
|---|---|
| `asm mygame.asm` | ソースを機械語にする |
| `-o mygame_raw.bin` | 機械語の出力先 |
| `-l mygame.lst` | リスト（アドレス、機械語、ソース）も作る |
| `-s mygame.sym` | シンボル表（ラベルとアドレス）も作る |

```text
OK: 4814 bytes, origin=BE000h -> /Users/名前/mygame/mygame_raw.bin
```

`-o mygame.bin` にすると、`e500 bin` で作った `MYGAME.BIN` と同じファイルになり、上書きされます。ここでは `_raw` を付けて分けています。

### 逆アセンブルする

```sh
e500 dis MYGAME.BIN -o game_dis.asm
e500 dis mygame_raw.bin --org BE000 -o raw_dis.asm
```

| コマンド | 何をするか |
|---|---|
| 1 行目 | `LOAD M` 用のファイルを ASM に戻す。アドレスはヘッダーから読む |
| 2 行目 | 機械語だけのファイルを ASM に戻す。アドレスを知らないので、`--org` で教える |

2 行目で `--org` を付けないと、`RAW input requires a start address (--org)` と出て止まります。

### メモリの中を見る

```sh
e500 run mygame.asm --seconds 2 --memory '(star_x):2'
```

2 秒動かした後の、内部 RAM の `star_x` から 2 バイトを表示します。`( )` はシェルの記号なので、`'…'` で囲みます。

```text
(star_x):2 = 42 02
```

### テストする

```sh
e500 test ~/pockecom/pc-e500_tools/Samples
```

フォルダの下の `*.e500test.json` を全部実行します。`✓` が成功、`✕` が失敗です。

```text
  ✓ 1000 ÷ 7
  ✓ 0 で割る
  ✓ BASIC のエラーになる
成功 59 件、失敗 0 件
```

1 つのファイルだけなら `e500 test 03_add.e500test.json`、1 件だけなら `--only '3 + 4'` を付けます。

### e500asm、e500dasm を使う

[ソースから作った](02_INSTALL_MACOS.md#25-e500asme500dasmce140conv-を作る) `e500asm` と `e500dasm` でも、同じことができます。こちらは Node.js が要りません。

```sh
e500asm mygame.asm -o mygame_raw.bin -I ~/pockecom/pc-e500_tools/VSCodeExtensions/pc-e500-devtools/inc
e500dasm mygame_raw.bin -f raw --org BE000 -o raw_dis.asm
```

| コマンド | 何をするか |
|---|---|
| 1 行目 | ソースを機械語にする。`-I フォルダ` は、`iocs.inc` などの INCLUDE ファイルがある場所（`e500` は自分で見つけるが、`e500asm` には教える） |
| 2 行目 | 機械語を ASM に戻す。`-f raw` は「ヘッダーのない機械語」という意味 |

## 25.6 まとめて自動で行う

何度も行う作業は、スクリプトにしておくと 1 行で済みます。次を `build.sh` という名前で保存します。

```sh
#!/bin/sh
set -e
e500 lint .
e500 test .
e500 bin mygame.asm
```

| 行 | 何をするか |
|---|---|
| `#!/bin/sh` | このファイルを `sh` で動かす、という印 |
| `set -e` | 途中のコマンドが失敗（終了コードが 0 以外）したら、そこで止まる |
| `e500 lint .` | 間違いを探す。エラーがあると終了コードが 1 になり、止まる |
| `e500 test .` | テストを実行する。失敗があると止まる |
| `e500 bin mygame.asm` | 全部よければ、実機用のファイルを作る |

```sh
sh build.sh
```

`sh ファイル` は、スクリプトを実行するコマンドです。テストのないフォルダでは、`e500 test .` の行を消して使います。終了コードは、コマンドのすぐ後に `echo $?` と打つと見られます。

## 25.7 AI に書かせる

AI に渡すスキルを、自分のフォルダに置きます。

```sh
cd ~/mygame
e500 skill
```

| コマンド | 何をするか |
|---|---|
| `cd ~/mygame` | プログラムを作るフォルダへ移る |
| `e500 skill` | そのフォルダに、AI 用の案内（スキル）を置く |

```text
/Users/名前/mygame/.claude/skills/pc-e500/SKILL.md
/Users/名前/mygame/.claude/skills/pc-e500/references/assembly.md
…
/Users/名前/mygame/.agents/skills/pc-e500/SKILL.md
…
```

`.` で始まるフォルダは `ls` では見えません。`ls -a` で見えます。そのまま同じターミナルで AI を起動します。

| AI | 起動のコマンド | 読む場所 |
|---|---|---|
| Claude Code | `claude` | `.claude/skills/pc-e500/` |
| Codex | `codex` | `.agents/skills/pc-e500/` |

AI が `e500 run` と `e500 test` も使えるように、[25.3](#253-エミュレータを教える)を先に済ませておきます。

新しい拡張機能に替えたら、`e500 skill --force` で置き直します。`--force` は、前のものを新しいものに置き換えるという意味で、自分で書き足した部分も消えます。頼み方の例は [22.6](22_COMMAND_LINE_AI.md#226-ai-に書かせる) にあります。

## 25.8 困ったとき

| 症状、メッセージ | 原因と対処 |
|---|---|
| `zsh: command not found: e500` | PATH に入っていない。ターミナルを開き直す（[25.2](#252-e500-を使えるようにする)） |
| `node: not found` | Node.js を入れる（[手順](02_INSTALL_MACOS.md#22-必要なものを入れる)） |
| `permission denied` | `chmod +x ファイル` を打つか、`sh ファイル` で動かす |
| `エミュレータ（libe500core.dylib）が見つかりません` | 場所を教える（[25.3](#253-エミュレータを教える)） |
| `ROM（*.ROM）がありません` | `rom` フォルダに ROM を置く |
| `spawn dotnet ENOENT` | .NET 10 を入れて、ターミナルを開き直す（[手順](02_INSTALL_MACOS.md#22-必要なものを入れる)） |
| `libe500core.dylib` が開けない、壊れていると言われる | `xattr -dr com.apple.quarantine フォルダ` を打つ（[手順](02_INSTALL_MACOS.md#24-エミュレータと-rom-を置く)） |
| `zsh: no matches found` | `*` や `( )` を含む値を `'…'` で囲む |
| `RAW input requires a start address (--org)` | 機械語だけのファイル。`--org BE000` のように付ける。BIN のつもりなら、同じ名前で上書きしていないか確かめる |
| `zsh: command not found: #` | 行の `#` より右は説明。打たない |
