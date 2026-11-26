---
name: pc-e500
description: SHARP PC-E500 シリーズ（PC-E500、PC-E500S、PC-E550、PC-E650、PC-1480U、PC-U6000 など、CPU は SC62015 / ESR-L）のプログラムを書く、直す、確かめるときに使う。SC62015 アセンブリ（.asm、.inc、e500asm）、PC-E500 BASIC（.bas）、*.e500test.json、.lcd、.spr を扱う作業、ポケットコンピュータ（ポケコン）のアプリ、ツール、計算プログラム、ゲームの作成が対象。
---

# PC-E500 シリーズのプログラム

珍しい機種なので、ほかの CPU や BASIC の知識で推測しない。**調べてから書き、書いたら必ず動かして確かめる。** そのためのコマンドが `e500`。

## 最初に決める: BASIC か機械語か

**新しいプログラムを頼まれたら、書き始める前に、BASIC と機械語のどちらで作るかを利用者に聞き、答えを待つ。** 質問の道具（Claude Code の AskUserQuestion など）があればそれで、なければ文で聞く。

1. 頼まれた内容を下の表に当てはめ、**BASIC で実現できるなら BASIC、難しいなら機械語**をすすめる。
2. すすめるほうを 1 番目の選択肢にして「（おすすめ）」を付け、理由と、もう一方を選んだときの違いを 1 行ずつ書く。
3. 答えのほうで作る。重い所だけを機械語にして BASIC から呼ぶ形（BASIC + 機械語）も選択肢にしてよい。

質問の例:

> 「家計簿」は BASIC と機械語のどちらで作りますか？
> 1. BASIC（おすすめ）— 入力、合計、保存が中心で、速さは要らない。後から読んで直しやすい
> 2. 機械語 — 表示は速いが、作る量が増え、直しにくい

聞かないで進めるとき: 利用者が言語を決めている（「機械語で」「BASIC で」）、既にある `.asm` / `.bas` を直す、質問の道具が使えず返事も来ない実行（自動実行、`claude -p` など）。話せないときは、すすめるほうで作り、選んだ理由を報告に書く。

| 内容 | BASIC で足りるか |
|---|---|
| **アプリ、ツール**: 計算、単位の換算、統計、表、家計簿、住所録、メモ、タイマ、クイズ、学習 | 足りる |
| 数百件までの一覧、検索、合計、ファイルへの保存 | 足りる |
| 文字で遊ぶゲーム（動くものが 3 つくらいまで、1 秒に 5〜10 コマ） | 足りる |
| 静止画、グラフ、ゆっくりした動き（`GPRINT`、`LINE`） | 足りる |
| ファイル、シリアル、印刷 | 足りる |
| 1 文字ずつ受ける端末、9600 bps のデータの取りこぼしを許さない受信 | 難しい → 機械語 |
| 数千件の並べ替えや検索、長い文字列の処理を待たせずに行う | 難しい → 重い所だけ機械語 |
| 常駐、割り込み、ハードウェアを直接さわる | 難しい → 機械語 |
| 絵のキャラクタを滑らかに動かす、背景の上を動く、1 秒に 10 コマを超える | 難しい → 機械語 |
| 画面全体を毎回描き直す、横スクロール | 難しい → 機械語 |
| 動くものが多い、当たり判定が多い、3D、音楽を鳴らし続ける | 難しい → 機械語 |
| 画像の処理、暗号、圧縮 | 難しい → 重い所だけ機械語 |
| キーを同時に押す、押し続けを見る | 難しい → 機械語 |

BASIC の速さの目安（ROM 7.2）: 空の `FOR` 1 回 2 ms、`A=A+1` 3 ms、`INKEY$` と `IF` 5 ms、`LOCATE` と 1 文字の `PRINT` 5 ms、8 桁の `GPRINT` 17 ms、`SIN` 35 ms、画面全体の `LINE …,BF` 6 秒。1 コマに要る文の時間を足して判断する。

## コマンド `e500`

**まず `e500 check` をそのまま実行する。動いたら、場所を探さず、以後も `e500 …` とだけ書く**（フルパスや変数に入れない。1 回に 1 つのコマンドを実行する）。見つからないときだけ、次を順に探す。

1. PATH にある `e500`
2. このリポジトリの `VSCodeExtensions/pc-e500-devtools/bin/e500`（Windows は `e500.cmd`）
3. `~/.vscode/extensions/litchi-gh.pc-e500-devtools-*/bin/e500`（Windows は `%USERPROFILE%\.vscode\extensions\…\bin\e500.cmd`）
4. どれもなく、Node.js があるなら `npx -y pc-e500-tools@latest`。以後は `e500 …` を `npx -y pc-e500-tools@latest …` と書く（入れなくても使える）。

```sh
# Bash: PATH にないときに、入れた拡張機能の e500 を探す
E500=$(printf '%s\n' ~/.vscode/extensions/litchi-gh.pc-e500-devtools-*/bin/e500 ~/.vscode-server/extensions/litchi-gh.pc-e500-devtools-*/bin/e500 | while read -r f; do [ -f "$f" ] && echo "$f"; done | tail -n 1); sh "$E500" --help
```

Node.js で動く（Windows では VS Code の中の Node.js でもよい）。Node.js がなければ、アセンブルは `e500asm`、逆アセンブルは `e500dasm`（実行ファイル。Linux 版もある）を使う。

| コマンド | すること |
|---|---|
| `e500 check` | エミュレータと ROM が使えるかを調べる。最初に 1 回 |
| `e500 new 名前 --kind 種類` | ひな形から作る。白紙から書かない。種類は、上の質問の答えで決める: **`basicapp`（BASIC のアプリ）`app`（機械語のアプリ）**、`basicgame` `game`（ゲーム）、`screen`（画面に描く）`routine`（BASIC から呼ぶ）`text` `minimal` |
| `e500 help MVL SCRN_PUTS LINE` | 命令、疑似命令、IOCS、BASIC の命令の書き方。**使う命令は先にこれで形を確かめる**。引数なしで一覧 |
| `e500 lint .` | 文法チェック（`.asm`、`.bas`） |
| `e500 asm prog.asm -o prog.bin -l prog.lst` | アセンブル（機械語、リスト、`-s` シンボル、`-f hex`）。`e500asm` と同じ出力 |
| `e500 dis CODE.BIN -o code.asm` | 逆アセンブル。`SAVE M` のファイルはアドレスを自分で読む。生のバイト列は `--org BEC00` |
| `e500 run prog.asm --png s.png` | エミュレータで動かし、画面の文字、状態、PNG を得る |
| `e500 test .` | `*.e500test.json` のテスト（`.asm` と `.bas`） |
| `e500 bin prog.asm` | 実機用の BIN（ソースの隣に作る）と、実機で打つ行。`e500 bin prog.bas -o OUT.BAS` は実機の `LOAD` 用 |

終了コードは 0 = 成功、1 = 間違いやテストの失敗、2 = 使い方や環境。`--json` で機械向けの出力。`run` と `test` は Windows、Linux、macOS（Linux と macOS では、その OS 用のエミュレータと `dotnet` が要る）。使えないときは、ほかのコマンドで書いて調べ、動かす確認は利用者に頼む。ROM は利用者のもので、リポジトリや成果物に入れない。

### run の使い方

```text
e500 run mytool.asm --seconds 1 --keys 1,2,5,5,ENTER --memory line:8
e500 run game.asm --seconds 3 --keys SPACE,wait:1,RIGHT --png s.png --memory "(score):2"
e500 run prog.bas --type "21\n" --rom 8.5
```

- `.asm` は `CLS:CALL 開始` を、`.bas` は `LOAD` して `RUN` を実行する。`--basic` で打つ行を変えられる（`\n` で複数行）。
- 状態: `ended`（プロンプトに戻った）、`running`（まだ動いている。ゲームなら正常）、`error`（BASIC のエラー）、`menu`（暴走して BASIC から出た、電源が切れた）。
- キーの名前: `SPACE` `ENTER` `UP` `DOWN` `LEFT` `RIGHT` `ON/BRK` `BS` `DEL` `INS` `C-CE` `MENU` `BASIC` `F1`〜`F5`、英字、数字、`COMMA`。`wait:秒` で待つ。
- 記号（`"` `>` `&`）を含む文字は、ファイルに書いて `--type-file`、`--basic-file` で渡す。
- `--memory` は `ラベル:長さ`（外部メモリ）、`(名前):長さ`（内部 RAM）。
- 絵を使うものは PNG を必ず見る。文字だけでは分からない。LCD へ送っている途中だと、8 ドットごとにずれて写ることがある。`--seconds` を少し変えて撮り直す。
- 経過は標準エラー出力、結果は標準出力。最後の行が `state: …`。

## 進め方

0. 新しいプログラムなら、BASIC か機械語かを聞く（上の節）。
1. `e500 check`。だめなら、足りないものを利用者に伝える（`e500 lint` と `e500 bin` はエミュレータなしで使える）。
2. 近いテンプレートかサンプルから始める。
3. 使う命令と IOCS を `e500 help` で確かめて書く。
4. `e500 lint` → `e500 run` → 期待どおりか、画面とメモリで確かめる。
5. ルーチンごとに `*.e500test.json` を書き（テンプレートになければ作る）、`e500 test` を通す。直した間違いはテストに足す。
6. 見せたい画面を `screens/` に残す（下の「画面を利用者に見せる」）。
7. `e500 bin` で実機用のファイルを作り、**説明書 `名前_MANUAL.txt` を書く**（[references/manual.md](references/manual.md) の形）。動かし方、操作、困ったとき。機械語なら、機械語エリアの確保、`LOAD M`、`CALL`、エリアの返し方も。頼まれて一部を直しただけのときは、説明書があれば合わせ、なければ作らない。
8. 終わったら、確かめたこと、残した画面の PNG と説明書の場所、エミュレータだけの確認であること（実機は別）を報告する。

### 画面を利用者に見せる

PNG は、会話の画面に出ないことが多い。**利用者が自分で開けるように残し、場所を伝える。**

- 確かめるためだけの PNG は、どこに置いてもよい。**見せたい画面（アプリはメニュー、入力、結果。ゲームはタイトル、プレイ中、終わり）は、作業フォルダの `screens/` に、中身の分かる名前で残す**。1〜4 枚。`--png` はフォルダがなければ作る。

```text
e500 run game.asm --seconds 2 --png screens/title.png
e500 run game.asm --seconds 1 --keys SPACE,wait:2,RIGHT --png screens/play.png
```

- 残す前に自分で見る。直したら撮り直し、古い画面を残さない。利用者が置いた同じ名前の画像は上書きせず、名前を変える。
- 最後の報告に、**PNG のパスと何の画面か**、開くコマンドを書く。Windows は `start screens\title.png`（PowerShell は `start screens/title.png`）、macOS は `open screens/title.png`、Linux は `xdg-open screens/title.png`、WSL は `explorer.exe screens`。VS Code ならファイルを選ぶだけで見られる。開くコマンドは、頼まれなければ自分では実行しない。
- 文字だけの画面は、`e500 run` が出した画面の文字を報告に貼ってもよい。

## 間違えやすいこと（アセンブリ）

- **BASIC の `CALL` に戻るのは `RETF`**。`RET` だと暴走してメインメニューになる。自分のサブルーチン（`CALL` で呼ぶ）は `RET`。
- BASIC から呼ばれたとき、`A` `BA` `I` `X` `Y` は壊してよい。`U` と `S` は積んだ数だけ戻す。
- **`RETF` の前に `RC`**。C = 1 のまま戻ると、A の値の番号の BASIC エラーになる。
- **`(n)` は内部 RAM（256 バイト）、`[n]` は外部メモリ（1 MB）**。別の場所。外部メモリどうしを直接移す命令はない。
- `MV A,IL`、`MV IL,A` はない。`IL` に書く（`INC IL` も）と `I` の上位が 0 になる。
- `MVL`、`ADCL` などは `I` がバイト数で、**実行後 `I` = 0**。`I` = 0 だと 65536 バイト。毎回入れ直す。
- `SHR`、`SHL` は C が入る。先に `RC`。
- `ADCL`（2 進）は下位が小さいアドレス、`DADL`（BCD）は最下位のアドレスを指定して減る向き。
- 条件アセンブル（`IFDEF` など）とマクロはない。テスト用のルーチンは別の `.asm` にして `INCLUDE` する。
- 数は `$BEC00`、`0BEC00h`、`0x…`。`&` も 16 進。10 進以外は印を付ける。比較の演算子はない。
- 場所は機械語エリア。`ORG $BEC00` などに置き、`BFBFFh` を越えない。大きくなったら `ORG` を下げる。
- 内部 RAM の 00h〜EBh は ROM も使う。使うなら退避して戻す（`game_start`〜`game_end` がしてくれる）。`BP`（ECh）、`PX`（EDh）、`PY`（EEh）を変えたら戻す。
- `PUSHU IMR` は割り込みも止める。`POPU IMR` と対にする。長い `MVL`、`WAIT` は割り込みを遅らせる。
- ROM の中のアドレスはバージョンで違う。使ってよいのは公開エントリ `FFFE8h`（IOCS）、`FFFE4h`（FCS）、`FFFD8h`、`FFFDCh`。

INCLUDE ファイルの名前（`sprite_draw`、`random_seed`、`PAD_LEFT` など）も `e500 help` で調べられる。詳しくは [references/assembly.md](references/assembly.md)、アプリは [references/app.md](references/app.md)、ゲームは [references/game.md](references/game.md)。

## 間違えやすいこと（BASIC）

- すべての行に行番号（1〜65279）。1 行 254 文字まで。ラベルは行の先頭に `*NAME:`。
- **構造化 BASIC（`WHILE`、`REPEAT`、`SWITCH`、複数行の `IF`〜`ENDIF`）は使わない。** PC-E650 など一部の機種（PC-E650、PC-U6000、PC-E500S）にしかない。ほかの機種では `Syntax error`、複数行の `IF` はエラーにならずに誤動作する。`IF`、`GOTO`、`FOR`、`GOSUB`、`ON … GOSUB` で書く（形は [references/basic.md](references/basic.md)）。使うのは、利用者がその機種だけでよいと言って頼んだときと、使っている既存のプログラムを直すときだけ。そのときは `--rom 8.5` で確かめる。
- 名前の先頭は命令の綴りにできない（`TOTAL` は `TO TAL` と読まれる）。
- `GCURSOR` の Y は文字や絵の一番下のドット。`LINE` は `…,S|R|X,線種,B|BF` の順。
- `AND`、`OR`、`XOR` は同じ強さで左から。`NOT` は関数と同じ強さ。
- `INKEY$` は待たない。`BEEP 回数,音程,長さ` の音程は大きいほど低い。
- **データは `DATA` に寄せる**: キャラクタの絵、面、表、単価、文言、音の列を、式や `PRINT` の中に直に書かない。プログラムの最後（900 行以降など）の `DATA` にまとめ、始めに `RESTORE 行` と `READ` で配列へ読む。書き方は [references/basic.md](references/basic.md)。
- 配列は使う前に `DIM`。`FOR` の途中で抜けない（6 段まで）。

詳しくは [references/basic.md](references/basic.md)。

## テスト

[references/testing.md](references/testing.md) の形で `名前.e500test.json` を書く。計算のルーチンは `RET` で終えて `"return": "near"` で 1 つずつ、入口は `"basic"` で 1 件、画面は `"screen"`（文字）か `"picture"`（`.lcd`）で確かめる。BASIC は `"program": "名前.bas"` とし、サブルーチンは `"call": 行番号` と `"variables"`、入力は `"type"`、ゲームは `"keys"` と `"state"` で確かめる。**テストしやすいように、動き、当たり判定、計算を `GOSUB` のサブルーチンに分けて書く。**

## もっと調べる

**まず、このスキルの中の資料を読む**（どのフォルダでも読める）。

| 資料 | 内容 |
|---|---|
| [references/hardware.md](references/hardware.md) | **ハードウェア**: 機種、メモリ、液晶、キー、割り込み、音、シリアル、11 ピン |
| [references/assembly.md](references/assembly.md) | アセンブリの書き方、IOCS の呼び方 |
| [references/app.md](references/app.md) | **アプリの作り方**: メニュー、入力、一覧、ファイル、印刷、エラー |
| [references/game.md](references/game.md) | ゲーム、`.lcd`、`.spr` |
| [references/basic.md](references/basic.md) | BASIC |
| [references/manual.md](references/manual.md) | 使う人への説明書（TXT）: 機械語エリアの確保、読み込み、操作 |
| [references/testing.md](references/testing.md) | `*.e500test.json`（機械語と BASIC） |

命令、IOCS、疑似命令、BASIC の命令、INCLUDE の名前は `e500 help 言葉` が早い。

**足りないときは、リポジトリの文書を読む。** pc-e500_tools の中なら下のパスを直接、ほかの場所なら `https://raw.githubusercontent.com/litchi-gh/pc-e500_tools/main/` に続けて同じパスを取る。1 章が 100 KB を超えるものもあるので、全部は読まず、見出し（`^#`）と言葉を検索して必要な節だけを読む。表の「」は見出しの名前。パスが見つからないときは、文書の番号が変わっているので、`docs/README.md` の一覧から同じ題の章を探す。

| 知りたいこと | 読む場所 |
|---|---|
| **ハードウェア** | |
| 命令の詳細、フラグ、サイクル、オペコード | `docs/manual/05_INSTRUCTIONS.md`、`docs/analysis/02_CPU.md`「命令リファレンス」「オペコード表」 |
| 内部 RAM の特別なアドレス、UART、ポート | `docs/analysis/02_CPU.md`「内部 RAM」「ポート」「UART」「システムのレジスタ」 |
| メモリマップ、作業域、システムアドレス | `docs/analysis/03_MEMORY.md`「作業域のポインタ」「IOCS の作業域」「システムアドレス」 |
| 液晶の配線、命令、表示 RAM、スクロール | `docs/analysis/04_LCD.md` |
| 割り込み、タイマ、音、電源、キーの流れ | `docs/analysis/10_SYSTEM.md` |
| RAM カード、ROM カード | `docs/analysis/05_CARD_SLOT.md` |
| 11 ピン（テープ、機器の制御） | `docs/analysis/06_PORT_11PIN.md`、`docs/analysis/20_CASSETTE.md` |
| 15 ピン（シリアル） | `docs/analysis/07_PORT_15PIN.md` |
| 回路、IC、電源、改造 | `docs/analysis/09_CIRCUIT.md`、`docs/analysis/08_IC_CHIPS.md` |
| CE-140F、CE-126P、CE-515P などの周辺機器 | `docs/analysis/16_PERIPHERALS.md`、`docs/analysis/17_CE-140F_DISK.md`、`docs/analysis/18_CE-126P_PRINTER.md`、`docs/analysis/19_CE-515P_PLOTTER.md` |
| フォント、文字コード | `docs/analysis/13_FONT.md`、`docs/handbook/18_CODES.md` |
| 機種の違い、ROM バージョンの違い | `docs/analysis/29_MODELS.md`、`docs/analysis/24_ROM_VERSIONS_BASIC.md`、`docs/analysis/26_ROM_VERSIONS_SYSTEM.md` |
| **機械語** | |
| アセンブラの文法、疑似命令、エラー | `docs/manual/04_ASSEMBLER_REFERENCE.md` |
| IOCS と FCS の番号、引数、エラー | `docs/analysis/11_IOCS.md` |
| 実機で動かす、エリアの確保、落とし穴 | `docs/analysis/12_MACHINE_CODE.md` |
| 短いルーチン（掛け算、割り算、10 進表示など） | `docs/manual/20_RECIPES.md`、`Samples/Assembler/Recipes` |
| INCLUDE ファイル、ゲームの作り方 | `docs/manual/06_INCLUDE_FILES.md`、`docs/manual/07_GAME.md` |
| 入門（例題 12 本） | `docs/manual/03_ASSEMBLER_TUTORIAL.md`、`Samples/Assembler/Tutorial` |
| ROM の中身の場所 | `docs/analysis/21_ROM_MAP.md` |
| **BASIC** | |
| 命令と関数の書式、例 | `docs/analysis/14_BASIC_REFERENCE.md`（`### 命令名` で検索） |
| エラーの番号と意味 | `docs/handbook/17_ERRORS.md` |
| 関数の範囲と精度 | `docs/handbook/14_FUNCTIONS.md` |
| ファイル、ドライブ、`MEM$` | `docs/handbook/15_FILES.md`、`docs/manual/16_BASIC_FILES.md` |
| プログラムの考え方 | `docs/handbook/11_BASIC_CONCEPTS.md`、`docs/handbook/12_PROGRAMMING.md` |
| 変数と中間コードの形式 | `docs/analysis/15_BASIC_INTERNALS.md` |
| ROM による動きの違い | `docs/analysis/24_ROM_VERSIONS_BASIC.md` |
| **道具** | |
| テストの書き方 | `docs/manual/11_TESTS.md` |
| ファイルの形式（`.lcd`、`.spr`、BIN） | `docs/manual/19_FILE_FORMATS.md` |
| 実機へ送る | `docs/manual/14_TRANSFER.md` |
| うまくいかないとき | `docs/manual/18_TROUBLESHOOTING.md` |
| 動く見本 | `Samples/Assembler`（StarCatch、Meteor、NineBox はゲーム。テスト付き）、`Samples/BASIC` |

文書にも無いことは、**推測せず、エミュレータで小さなプログラムを動かして確かめる**（`e500 run`、`PEEK`、`--memory`）。それでも分からなければ、利用者にそう伝える。
