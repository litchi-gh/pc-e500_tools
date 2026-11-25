# 1. クイックスタート（Linux）

この章は、ツールを初めて入れる人が、Linux で**キャラクタの動くゲームを自分の手で動かす**までの道のりです。プログラムを書いた経験も、機械語の知識も要りません。順に進めると、30 分ほどで、エミュレータの中で顔が動くところまで行けます。最後に、同じプログラムを実機へ送る手順も見ます。

くわしい説明はあとの章に回し、ここでは「動いた」を先に味わいます。画面は Ubuntu 26.04 のものです。Windows の人は[こちら](01_QUICKSTART_WINDOWS.md)、macOS の人は[こちら](01_QUICKSTART_MACOS.md)を読んでください。

[目次へ戻る](README.md)

```mermaid
flowchart TD
  A["VS Code と<br>拡張機能を入れる"] --> B["エミュレータと<br>e500 を用意する"] --> C["プログラムを<br>作る"] --> D["e500 run で<br>動かす"] --> E["絵を<br>描き直す"] --> F["BIN を作って<br>実機へ"]
```

Linux では、プログラムと絵を VS Code で作り、動かすのはコマンド `e500 run` で行います。VS Code の `F5`（実行、デバッグ）は Windows 専用です。

## 1.1 用意するもの

| もの | 用途 |
|---|---|
| Ubuntu 24.04 以降（x64）の PC | この章の手順は Ubuntu 26.04 で確かめたもの（[動作環境](02_INSTALL_LINUX.md#動作環境)） |
| [VS Code](https://code.visualstudio.com/) | プログラムと絵を作る |
| Node.js（20.12 以降） | コマンド `e500` を動かす |
| .NET 10 のランタイム | エミュレータを操作する部品を動かす |
| PC-E500 エミュレータの Linux 版 | `libe500core.so` が入ったもの |
| 自分の ROM | 自分の本体から吸い出したもの。ツールには入っていない |

実機で動かすには、CE-140F か互換機も使います（[実機へ送る](14_TRANSFER.md)）。

先に、ブラウザで次の 3 つを取っておきます。日本語の Ubuntu では、ホームの `ダウンロード` フォルダに入ります（英語の環境では `Downloads`。この章の `~/ダウンロード` を `~/Downloads` に読み替えます）。

| 取るもの | 場所 |
|---|---|
| VS Code の `.deb`（`code_…_amd64.deb`） | [VS Code のページ](https://code.visualstudio.com/) |
| `pc-e500-devtools-<バージョン>.vsix` | [ツールの Releases](https://github.com/litchi-gh/pc-e500_tools/releases) |
| `PC-E500-Emulator-<バージョン>-linux-x64.tar.gz` | [エミュレータの Releases](https://github.com/litchi-gh/pc-e500_emulator_pockecom/releases) |

自分の ROM（例 `PC-E500(7.2).ROM`）も、同じフォルダに置いておきます。

## 1.2 必要なものを入れる

端末を開いて（Ubuntu なら `Ctrl+Alt+T`）、次を 1 行ずつ打ちます。

```sh
sudo apt update
sudo apt install -y nodejs dotnet-runtime-10.0
sudo apt install ~/ダウンロード/code_*_amd64.deb
```

| コマンド | 何をするか |
|---|---|
| `sudo apt update` | 入れられるソフトの一覧を新しくする。`sudo` は管理者の権限で実行するという意味で、自分のパスワードを聞かれる（打っても表示されない） |
| `sudo apt install -y nodejs dotnet-runtime-10.0` | Node.js と .NET 10 のランタイムを入れる。`-y` は、確認の質問に「はい」と答える |
| `sudo apt install …deb` | ダウンロードした VS Code を入れる。`*` は「何でもよい」なので、バージョンの番号を打たなくて済む。Microsoft のリポジトリを足すか聞かれたら、どちらでもよい（足すと、VS Code も `apt` で新しくなる） |

入ったかどうかを確かめます。バージョンを表示するだけのコマンドです。

```sh
node --version
dotnet --list-runtimes
code --version
```

`node` は `v20.12` 以上、`dotnet` は `Microsoft.NETCore.App 10.` で始まる行があれば大丈夫です。

## 1.3 拡張機能を入れる

```sh
code --install-extension ~/ダウンロード/pc-e500-devtools-0.3.0.vsix
code --install-extension MS-CEINTL.vscode-language-pack-ja
```

| コマンド | 何をするか |
|---|---|
| 1 行目 | ダウンロードした拡張機能を VS Code に入れる。`0.3.0` は、取ったファイルのバージョンに合わせる |
| 2 行目 | VS Code のメニューを日本語にする拡張機能を、インターネットから入れる |

どちらも `was successfully installed` と出れば入りました。VS Code を開いたときに言語を変えるか聞かれたら、「変更して再起動」を選びます。

## 1.4 エミュレータと e500 を用意する

### 1. エミュレータと ROM を置く

```sh
mkdir -p ~/pockecom
tar xzf ~/ダウンロード/PC-E500-Emulator-*-linux-x64.tar.gz -C ~/pockecom
mv ~/pockecom/PC-E500-Emulator-*-linux-x64 ~/pockecom/Emulator
cp ~/ダウンロード/'PC-E500(7.2).ROM' ~/pockecom/Emulator/rom/
```

| コマンド | 何をするか |
|---|---|
| `mkdir -p ~/pockecom` | ホームに `pockecom` フォルダを作る |
| `tar xzf … -C ~/pockecom` | ダウンロードしたエミュレータを、そこに展開する |
| `mv 元 先` | 展開したフォルダの名前を、短い `Emulator` に変える |
| `cp 元 先` | 自分の ROM を、エミュレータの `rom` フォルダにコピーする。名前の `( )` は端末では特別な意味を持つので、`'…'` で囲む |

### 2. e500 と打てるようにする

コマンド `e500` は、入れた拡張機能の中にあります。どこからでも打てるように、それを呼び出す短いファイルを作ります。`0.3.0` は、入れたバージョンに合わせてください。

```sh
mkdir -p ~/.local/bin
cat > ~/.local/bin/e500 <<'EOF'
#!/bin/sh
exec sh "$HOME/.vscode/extensions/pokecom-tools.pc-e500-devtools-0.3.0/bin/e500" "$@"
EOF
chmod +x ~/.local/bin/e500
```

| 部分 | 何をするか |
|---|---|
| `mkdir -p ~/.local/bin` | 自分用のコマンドを置くフォルダを作る |
| `cat > ファイル <<'EOF'` 〜 `EOF` | 間の 2 行を、そのままファイルに書き込む。4 行をまとめて貼り付けてよい |
| `chmod +x ファイル` | そのファイルに「実行してよい」という印を付ける |

### 3. エミュレータの場所を教える

```sh
echo 'export PCE500_EMULATOR="$HOME/pockecom/Emulator"' >> ~/.bashrc
```

端末を開いたときに読まれる `~/.bashrc` の最後に、「エミュレータはここにある」という 1 行を書き加えます。**1 回だけ**打ちます。

ここで**一度ログアウトして、ログインし直します**。作ったコマンドと、書き加えた設定が効くようになります。

### 4. 確かめる

端末で次を打ちます。エミュレータと ROM を探し、実際に一度起動して、使えるかどうかを調べるコマンドです。何も変えません。

```sh
e500 check
```

![e500 check の結果](../images/manual/lq_check.png)

最後に `started: ROM Ver.7.2, …` と出れば準備完了です（画面は VS Code の中のターミナルで打ったところ）。

| 出たもの | 対処 |
|---|---|
| `コマンドが見つかりません` | ログインし直したか。`ls ~/.local/bin` に `e500` があるか |
| `エミュレータ（libe500core.so）が見つかりません` | `ls ~/pockecom/Emulator` に `libe500core.so` があるか |
| `ROM（*.ROM）がありません` | `ls ~/pockecom/Emulator/rom` に ROM があるか |

## 1.5 プログラムを作る

1. 空のフォルダを作って、VS Code で開きます。

   ```sh
   mkdir ~/mygame
   code ~/mygame
   ```

   1 行目でフォルダを作り、2 行目でそのフォルダを VS Code で開きます。「このフォルダーの作成者を信頼しますか」と聞かれたら「はい」を押します。

2. エクスプローラーの空いた所を右クリックし、**「新しいプログラムを作成」** を選びます。

   ![右クリックのメニュー](../images/manual/lq_menu.png)

3. テンプレートの一覧から **「キャラクタを動かすゲーム」** を選びます。

   ![テンプレートの一覧](../images/manual/lq_template.png)

4. 名前に `mygame` と入れて `Enter` を押します。

   ![名前の入力](../images/manual/lq_name.png)

次の 4 つのファイルができ、`mygame.asm` が開きます。

| ファイル | 内容 |
|---|---|
| `mygame.asm` | プログラム |
| `mygame.lcd` | 背景の絵 |
| `mygamep.spr` | 顔のキャラクタ（2 コマ） |
| `mygames.spr` | 星のキャラクタ（4 コマ） |

![できたプログラム](../images/manual/lq_made.png)

VS Code を使わないときは、端末で `cd ~/mygame` と `e500 new game mygame` を打つと、同じファイルができます。

## 1.6 動かす

VS Code のメニューの「ターミナル」→「新しいターミナル」を選びます（メニューが隠れているときは「…」の中）。下に開いたターミナルに、次を打ちます。

```sh
e500 run mygame.asm --seconds 2 --keys RIGHT,RIGHT,wait:1 --png screen.png
```

| 部分 | 意味 |
|---|---|
| `run mygame.asm` | アセンブル（ソースを機械語に変える）して、エミュレータに入れ、動かす |
| `--seconds 2` | 2 秒動かす |
| `--keys RIGHT,RIGHT,wait:1` | その後、右キーを 2 回押して 1 秒待つ |
| `--png screen.png` | 終わったときの画面を、`screen.png` という画像にする |

![e500 run の結果](../images/manual/lq_run.png)

枠の中は液晶の 40 文字 × 4 行です。絵は文字ではないので `□` になります。`state: running` は「時間まで動き続けていた」という意味で、ゲームなら正常です。

左のエクスプローラーで `screen.png` をクリックすると、そのときの画面が絵で見られます。顔が右へ動き、星が浮かんでいます。

![画面の画像](../images/manual/lq_png.png)

`--keys` の中身を変えると、ほかの動きも試せます。`LEFT`、`UP`、`DOWN` や、`wait:0.5`（0.5 秒待つ）を `,` で区切って並べます。

## 1.7 絵を描き直す

1. エクスプローラーで `mygamep.spr` をクリックします。
2. マウスで点を打って、好きな絵にします。

   ![キャラクタを描く](../images/manual/lq_edit.png)

3. `Ctrl+S` で保存し、ターミナルで 1.6 のコマンドをもう一度打ちます（`↑` キーで呼び出せます）。`screen.png` が新しい絵になります。

描き方は[ドットエディタ](12_DOT_EDITOR.md)にあります。

## 1.8 プログラムを直してみる

`mygame.asm` の次の行を探して、`2` を `4` に変え、`Ctrl+S` で保存します。

```asm
STEP    EQU   2                 ; 1 回に動くドット数
```

1.6 のコマンドをもう一度打つと、顔が前より右まで動きます。1 回に動く量が 2 倍になったからです。

書き間違えると、赤い波線が付きます。端末で全部のファイルを調べるには、次を打ちます。間違いを探すだけで、動かしません。

```sh
e500 lint .
```

`.` は「今いるフォルダ」です。`1 ファイル、エラー 0 件、そのほか 0 件` と出れば、間違いはありません。

## 1.9 実機で動かす

1. 実機用のファイルを作ります。

   ```sh
   e500 bin mygame.asm
   ```

   `LOAD M` で読める `MYGAME.BIN` を作り、実機で打つ行を表示するコマンドです。

   ![e500 bin の結果](../images/manual/lq_bin.png)

2. `MYGAME.BIN` を CE-140F（互換機の SD カードなど）にコピーします。ファイルの画面でコピーしても、次のように打ってもかまいません。`SDCARD` は自分の SD カードの名前に替えます（`ls /media/$USER` で分かります）。

   ```sh
   cp MYGAME.BIN /media/$USER/SDCARD/
   ```

3. 実機の BASIC で、表示された 3 行を順に打ちます。

   ```basic
   POKE &HBFE03,&H1A,&HFD,&H0B,&H00,&H1C,&H00:CALL &HFFFD8
   LOAD M "X:MYGAME.BIN"
   CALL &HBE000
   ```

   1 行目は機械語エリアの確保で、最初の 1 回だけです。メインメニューに戻るので `BASIC` キーで入り直します。

ゲームは矢印キーで動かします。`ON/BRK` で BASIC に戻ります。

## 1.10 画面の見方

VS Code の画面です。

![画面](../images/manual/lq_run.png)

| 場所 | 名前 | 使いみち |
|---|---|---|
| 左端 | アクティビティ バー | 上から、ファイル、検索、Git、デバッグ、拡張機能、テスト |
| 左 | サイド バー | ファイルの一覧など |
| 中央 | エディタ | プログラムを書く、絵を描く |
| 下 | パネル | 問題、出力、ターミナル |
| 一番下 | ステータス バー | 行番号、文字コード、言語（PC-E500 Assembly） |

## 1.11 BASIC から始める

機械語ではなく BASIC で作るときは、もっと簡単です。

1. フォルダに `hello.bas` というファイルを作り、次のプログラムを書いて保存します。

   ```basic
   10 CLS
   20 FOR I=1 TO 5
   30 PRINT "SUM";I,I*(I+1)/2
   40 NEXT I
   50 END
   ```

2. ターミナルで動かします。エミュレータに読み込んで `RUN` し、終わったときの画面と変数を表示するコマンドです。

   ```sh
   e500 run hello.bas
   ```

![BASIC を動かしたところ](../images/manual/lq_basic.png)

`state: ended` は「最後まで動いて、BASIC に戻った」という意味です。くわしくは [BASIC](13_BASIC.md) にあります。

## 1.12 うまくいかないとき

| 症状 | 見るところ |
|---|---|
| 「新しいプログラムを作成」が出ない | 拡張機能が入っているか（`code --list-extensions`）。フォルダを開いているか |
| `F5` を押しても動かない | `F5` は Windows 専用。`e500 run` を使う |
| `e500` が見つからない | ログインし直したか（[1.4](#14-エミュレータと-e500-を用意する)） |
| メッセージが英語 | `export E500_LANG=ja` を打ってから、もう一度打つ |
| 赤い波線が出て動かない | 「問題」（`Ctrl+Shift+M`）を読む |
| `state: menu` や `state: fault` と出る | プログラムが暴走した。直したところを元に戻して確かめる |

ほかは [24.9 困ったとき](24_COMMAND_LINE_LINUX.md#249-困ったとき)にあります。

## 次に読むもの

- 機械語を覚える: [アセンブラ入門](03_ASSEMBLER_TUTORIAL.md)
- このゲームを自分のものにする: [ゲームを作る](07_GAME.md)
- コマンドをもっと使う: [Linux のコマンド](24_COMMAND_LINE_LINUX.md)
- AI に書かせる: [24.7](24_COMMAND_LINE_LINUX.md#247-ai-に書かせる)
