# 24. Linux のコマンド

この章は Linux で `e500` を使えるようにして、プログラムを作り、動かし、実機用のファイルにするまでを、端末に打つとおりに説明します。1 行ごとに、何をするコマンドか、何が表示されるかを書きました。WSL の Linux でも同じです。

Windows の人は [23 章](23_COMMAND_LINE_WINDOWS.md)、macOS の人は [25 章](25_COMMAND_LINE_MACOS.md)を読んでください。オプションの全部の意味は [22 章](22_COMMAND_LINE_AI.md#224-それぞれのコマンド)にあります。

[目次へ戻る](README.md)

| 節 | 内容 |
|---|---|
| [24.1](#241-始める前に) | 端末の使い方 |
| [24.2](#242-e500-を使えるようにする) | どこからでも `e500` と打てるようにする |
| [24.3](#243-エミュレータを教える) | `run` と `test` の準備 |
| [24.4](#244-最初の-1-本を作る) | 作る、調べる、動かす、BIN にする |
| [24.5](#245-そのほかのコマンド) | アセンブル、逆アセンブル、調べもの、テスト |
| [24.6](#246-まとめて自動で行う) | スクリプトにする |
| [24.7](#247-ai-に書かせる) | Claude Code、Codex の準備 |
| [24.8](#248-nodejs-なしで使う) | `e500asm`、`e500dasm` だけを使う |
| [24.9](#249-困ったとき) | メッセージと対処 |

## 24.1 始める前に

### この章の書き方

| 書き方 | 意味 |
|---|---|
| 枠の中の行 | 打つもの。`名前@ホスト:~$` は打たない |
| `#` より右 | 説明。打たなくてよい |
| `~` | 自分のホームフォルダ（`/home/名前`） |
| `~/mygame` | 自分のプログラムを置くフォルダの例 |
| `~/pockecom` | ツールを置くフォルダの例 |

### 最初に覚える端末のコマンド

| コマンド | 何をするか |
|---|---|
| `cd フォルダ` | 今いるフォルダを移す。`cd` だけならホームへ |
| `cd ..` | 1 つ上のフォルダへ移る |
| `pwd` | 今いるフォルダを表示する |
| `ls` | 今いるフォルダのファイルを一覧にする |
| `mkdir フォルダ` | フォルダを作る |
| `xdg-open ファイル` | ファイルを、いつものアプリで開く（PNG なら画像のアプリ） |
| `↑` キー | 前に打ったコマンドを呼び出す |
| `Tab` キー | 途中まで打ったファイルの名前を補う |
| `Ctrl+C` | 動いているコマンドを止める |

空白や `( )` のある名前は `'…'` で囲みます。**ファイル名の大文字と小文字は区別されます**（`mygame.bin` と `MYGAME.BIN` は別のファイル）。

## 24.2 e500 を使えるようにする

[`install.sh`](02_INSTALL_LINUX.md#22-必要なものを入れる) で入れたなら、`e500` はもう使えます。[24.2 の 3](#3-確かめる) で確かめて、次の節へ進みます。ここは、自分で入れるときの手順です。`e500` は拡張機能の中にあり、Node.js（20.12 以降）が要ります。

### 1. 場所を調べる

`e500` のファイルは入れ方によって次の場所にあります。

| 入れ方 | 場所 |
|---|---|
| `.vsix` を展開した | `~/pockecom/devtools/extension/bin/e500` |
| VS Code に入れた | `~/.vscode/extensions/litchi-gh.pc-e500-devtools-<バージョン>/bin/e500` |
| Remote - SSH、WSL の VS Code に入れた | `~/.vscode-server/extensions/litchi-gh.pc-e500-devtools-<バージョン>/bin/e500` |
| リポジトリ | `~/pockecom/pc-e500_tools/VSCodeExtensions/pc-e500-devtools/bin/e500` |

リポジトリから使うときは、先に `pc-e500-devtools` フォルダで次を 1 回ずつ実行します（`npm` と .NET 10 SDK が要る。Ubuntu なら `sudo apt install -y npm dotnet-sdk-10.0`）。

```sh
npm ci
npm run compile
npm run build:server
```

| コマンド | 何をするか |
|---|---|
| `npm ci` | 作るのに要る部品を取ってくる |
| `npm run compile` | TypeScript のソースを、動かせる JavaScript（`out` フォルダ）に変える |
| `npm run build:server` | エミュレータを操作する `e500dbg` を作る（`run` と `test` に使う） |

### 2. どこからでも打てるようにする

拡張を入れた VS Code のターミナルでは、設定しなくても `e500` が使えます（拡張を入れた後に開いたターミナルから）。ここは、ほかのターミナルで使うときの設定です。

`e500` という名前の短いファイルを、コマンドを置くフォルダ（`~/.local/bin`）に作ります。中身は「本物の `e500` を呼び出す」だけです。

```sh
mkdir -p ~/.local/bin
cat > ~/.local/bin/e500 <<'EOF'
#!/bin/sh
exec sh "$HOME/pockecom/devtools/extension/bin/e500" "$@"
EOF
chmod +x ~/.local/bin/e500
```

| 部分 | 何をするか |
|---|---|
| `mkdir -p ~/.local/bin` | フォルダを作る。既にあれば何もしない |
| `cat > ファイル <<'EOF'` 〜 `EOF` | 間の行を、そのままファイルに書き込む。前の内容は置き換わる |
| `#!/bin/sh` | このファイルを `sh` で動かす、という印 |
| `exec sh "…/e500" "$@"` | 本物の `e500` を動かす。`"$@"` は、打った引数をそのまま渡すという意味。**パスは 1 の表の自分の場所に替える** |
| `chmod +x ファイル` | 「実行してよい」という印を付ける |

この方法なら、端末で打っても、スクリプトや AI から呼んでも動きます。

### 3. 確かめる

```sh
which e500
e500 --version
```

| コマンド | 何をするか | 正しいとき |
|---|---|---|
| `which e500` | `e500` と打ったときに動くファイルを表示する | `/home/名前/.local/bin/e500` |
| `e500 --version` | バージョンを表示する | `0.1.0` など |

`which` で何も出ないときは、`~/.local/bin` が PATH（コマンドを探すフォルダの一覧）に入っていません。Ubuntu ではこのフォルダを作った後でログインし直すと入ります。ログインし直しても出なければ、次の 2 行を打ちます。

```sh
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

1 行目は端末を開いたときに読まれる `~/.bashrc` の最後に、PATH を足す行を書き加えます。2 行目は今の端末でそれを読み直します。

### 4. メッセージを日本語にする

端末の言語が英語のときは、メッセージも英語です。日本語にするには次の 2 行を打ちます。

```sh
echo 'export E500_LANG=ja' >> ~/.bashrc
source ~/.bashrc
```

`E500_LANG` は `e500` の表示の言語を決める環境変数で、`ja` か `en` です。この章の実行例は日本語の表示です。

## 24.3 エミュレータを教える

`install.sh` で入れたなら、`~/pockecom/Emulator` を自分で見つけるので、この節は要りません。

`e500 run` と `e500 test` はエミュレータと ROM、.NET 10 のランタイムを使います。[エミュレータと ROM を置いて](02_INSTALL_LINUX.md#24-エミュレータと-rom-を置く)から、次のどれかをします。

| やり方 | することと、向いている人 |
|---|---|
| A | 何もしない。`.deb` で `/opt/pc-e500` に入れた人 |
| B | 環境変数で教える。`.tar.gz` を展開した人 |
| C | そのたびに `--emulator フォルダ` を付ける。いくつも使い分ける人 |

### B. 環境変数で教える

```sh
echo 'export PCE500_EMULATOR="$HOME/pockecom/Emulator"' >> ~/.bashrc
source ~/.bashrc
```

| 部分 | 意味 |
|---|---|
| `export 名前=値` | 環境変数（プログラムに渡す設定）を決める |
| `PCE500_EMULATOR` | 変数の名前。`e500` がこの名前を読む |
| `"$HOME/pockecom/…"` | エミュレータのフォルダ。`libe500core.so` があるフォルダを書く |
| `echo '…' >> ~/.bashrc` | その行を `~/.bashrc` の最後に書き加える。次に開く端末から、いつも効く |
| `source ~/.bashrc` | 今の端末で読み直す |

### 確かめる

```sh
e500 check
```

エミュレータと ROM を探し、実際に一度起動して、使えるかどうかを調べます。何も変えません。

```text
server: /home/名前/pockecom/devtools/extension/out/server/e500dbg.dll
emulator: /home/名前/pockecom/Emulator
core: /home/名前/pockecom/Emulator/libe500core.so
rom: /home/名前/pockecom/Emulator/rom/PC-E500(7.2).ROM
ram: 32
from: PCE500_EMULATOR
node: v22.22.1
started: ROM Ver.7.2, 32 KB, 223 ms
```

最後が `started:` なら使えます。`error:` なら、その右が理由です（[24.9](#249-困ったとき)）。各行の意味は [22.4](22_COMMAND_LINE_AI.md#e500-check) にあります。

## 24.4 最初の 1 本を作る

### 1. フォルダを作って、そこへ移る

```sh
mkdir -p ~/mygame
cd ~/mygame
```

1 行目でフォルダを作り、2 行目でそこへ移ります。この後のコマンドはここで打ちます。

### 2. ゲームのひな形を作る

```sh
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

`nano mygame.asm` で端末のエディタ、`code mygame.asm` で VS Code を開いて書き直せます。

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

枠の中は液晶の 40 文字 × 4 行です。文字でない絵は `□` になるので、絵を見たいときは `xdg-open screen.png` で画像を開きます。`state: running` は「時間まで動き続けていた」という意味で、ゲームなら正常です。

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
cp MYGAME.BIN /media/$USER/SDCARD/
```

`cp ファイル 先` はファイルをコピーするコマンドです。`/media/$USER/SDCARD` は SD カードの場所の例で、`$USER` は自分のユーザー名です。実際の場所は `ls /media/$USER` で調べます。

## 24.5 そのほかのコマンド

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

`--rom 8.5` は `rom` フォルダの中の、名前に `8.5` を含む ROM（`PC-E650(8.5).ROM` など）を使います。`--no-screen` は画面の文字を出しません。

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
OK: 4814 bytes, origin=BE000h -> /home/名前/mygame/mygame_raw.bin
```

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

## 24.6 まとめて自動で行う

何度も行う作業はスクリプトにしておくと 1 行で済みます。次を `build.sh` という名前で保存します。

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

`sh ファイル` はスクリプトを実行するコマンドです。テストのないフォルダでは `e500 test .` の行を消して使います。終了コードはコマンドのすぐ後に `echo $?` と打つと見られます。

## 24.7 AI に書かせる

### どのフォルダでも使えるようにする（おすすめ）

Node.js が入っていれば、次の 1 行を 1 回だけ実行します。`e500` が入っていなくてもかまいません。

```sh
npx -y pc-e500-tools@latest setup
```

| コマンド | 何をするか |
|---|---|
| `npx -y pc-e500-tools@latest` | 最新の `pc-e500-tools`（コマンド `e500` の入ったパッケージ）を取ってきて、その場で動かす。`-y` は、取ってくるかを聞かずに進めるという意味 |
| `setup` | ホームフォルダに、AI 用のスキルの入口を置く |

```text
/home/名前/.claude/skills/pc-e500/SKILL.md
/home/名前/.agents/skills/pc-e500/SKILL.md
Claude Code と Codex は、どのフォルダでも、このスキルを使います。本文は e500 guide が出します（いつも最新）。
```

これで、どのフォルダで AI を起動しても、PC-E500 のプログラムを頼めます。AI は作業のたびに最新の本文を読むので、置き直す必要はありません。

`e500` を自分でも使うなら、`npm install -g pc-e500-tools` で入れます。更新も同じコマンドです。

### 1 つのフォルダに置く

AI に渡すスキルを自分のフォルダに置きます。VS Code では、エクスプローラーでフォルダを右クリックして「AI 用のスキルを置く」を選んでも同じです。

```sh
cd ~/mygame
e500 skill
```

| コマンド | 何をするか |
|---|---|
| `cd ~/mygame` | プログラムを作るフォルダへ移る |
| `e500 skill` | そのフォルダに、AI 用の案内（スキル）を置く |

```text
/home/名前/mygame/.claude/skills/pc-e500/SKILL.md
/home/名前/mygame/.claude/skills/pc-e500/references/assembly.md
…
/home/名前/mygame/.agents/skills/pc-e500/SKILL.md
…
```

`.` で始まるフォルダは `ls` では見えません。`ls -a` で見えます。そのまま同じ端末で AI を起動します。

| AI | 起動のコマンド | 読む場所 |
|---|---|---|
| Claude Code | `claude` | `.claude/skills/pc-e500/` |
| Codex | `codex` | `.agents/skills/pc-e500/` |

新しい拡張機能に替えたら、`e500 skill --force` で置き直します。`--force` は前のものを新しいものに置き換えるという意味で、自分で書き足した部分も消えます。頼み方の例は [22.6](22_COMMAND_LINE_AI.md#226-ai-に書かせる) にあります。

## 24.8 Node.js なしで使う

アセンブルと逆アセンブルだけなら、`e500asm` と `e500dasm` で足ります。Node.js も .NET のランタイムも要りません。作り方は[インストール（Linux）の 2.5](02_INSTALL_LINUX.md#25-e500asme500dasm-を作る)にあります。

```sh
e500asm mygame.asm -o mygame_raw.bin
e500dasm mygame_raw.bin -f raw --org BE000 -o raw_dis.asm
```

| コマンド | 何をするか |
|---|---|
| 1 行目 | ソースを機械語にする。`iocs.inc` などを使うソースでは、`-I フォルダ` で INCLUDE ファイルのフォルダ（リポジトリの `VSCodeExtensions/pc-e500-devtools/inc`）を教える |
| 2 行目 | 機械語を ASM に戻す。`-f raw` は「ヘッダーのない機械語」という意味 |

Windows の PC で Linux 用の実行ファイルを作ることもできます（[ビルド](../design/09_BUILD_TEST_RELEASE.md#92-ビルド)）。Windows からコピーしたファイルには「実行してよい」という印がないので、次を打ちます。

```sh
chmod +x e500asm e500dasm
```

## 24.9 困ったとき

| 症状、メッセージ | 原因と対処 |
|---|---|
| `e500: command not found` | `~/.local/bin` が PATH にない（[24.2](#242-e500-を使えるようにする)） |
| `node: not found` | Node.js を入れる（[手順](02_INSTALL_LINUX.md#22-必要なものを入れる)） |
| `Permission denied` | `chmod +x ファイル` を打つか、`sh ファイル` で動かす |
| `エミュレータ（libe500core.so）が見つかりません` | `PCE500_EMULATOR` を設定する（[24.3](#243-エミュレータを教える)） |
| `ROM（*.ROM）がありません` | `rom` フォルダに ROM を置くか、`--rom ファイル` を付ける |
| `デバッグサーバーがありません` | `.vsix` を展開し直す。リポジトリから使うときは `npm run build:server` |
| `error:` に .NET のことが出る | `dotnet --list-runtimes` に `Microsoft.NETCore.App 10.` があるか確かめる |
| `RAW input requires a start address (--org)` | 機械語だけのファイル。`--org BE000` のように付ける |
| ファイルが見つからない | 大文字と小文字が違う。`ls` で確かめる |
| メッセージが英語 | `E500_LANG=ja` を設定する（[24.2](#242-e500-を使えるようにする)） |
