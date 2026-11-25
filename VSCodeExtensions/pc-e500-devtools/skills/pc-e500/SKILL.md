---
name: pc-e500
description: SHARP PC-E500 シリーズ（PC-E500、PC-E500S、PC-E550、PC-E650、PC-1480U、PC-U6000 など、CPU は SC62015 / ESR-L）のプログラムを書く、直す、確かめるときに使う。SC62015 アセンブリ（.asm、.inc、e500asm）、PC-E500 BASIC（.bas）、*.e500test.json、.lcd、.spr を扱う作業、ポケットコンピュータ（ポケコン）のゲームや機械語の作成が対象。
---

# PC-E500 シリーズのプログラム

珍しい機種なので、ほかの CPU や BASIC の知識で推測しない。**調べてから書き、書いたら必ず動かして確かめる。** そのためのコマンドが `e500`。

## コマンド `e500`

**まず `e500 check` をそのまま実行する。動いたら、場所を探さず、以後も `e500 …` とだけ書く**（フルパスや変数に入れない。1 回に 1 つのコマンドを実行する）。見つからないときだけ、次を順に探す。

1. PATH にある `e500`
2. このリポジトリの `VSCodeExtensions/pc-e500-devtools/bin/e500`（Windows は `e500.cmd`）
3. `~/.vscode/extensions/pokecom-tools.pc-e500-devtools-*/bin/e500`（Windows は `%USERPROFILE%\.vscode\extensions\…\bin\e500.cmd`）

```sh
# Bash: PATH にないときに、入れた拡張機能の e500 を探す
E500=$(printf '%s\n' ~/.vscode/extensions/pokecom-tools.pc-e500-devtools-*/bin/e500 ~/.vscode-server/extensions/pokecom-tools.pc-e500-devtools-*/bin/e500 | while read -r f; do [ -f "$f" ] && echo "$f"; done | tail -n 1); sh "$E500" --help
```

Node.js で動く（Windows では VS Code の中の Node.js でもよい）。Node.js がなければ、アセンブルは `e500asm`、逆アセンブルは `e500dasm`（実行ファイル。Linux 版もある）を使う。

| コマンド | すること |
|---|---|
| `e500 check` | エミュレータと ROM が使えるかを調べる。最初に 1 回 |
| `e500 new game mygame` | テンプレートから作る（`minimal` `text` `screen` `game` `routine`）。白紙から書かない |
| `e500 help MVL SCRN_PUTS LINE` | 命令、疑似命令、IOCS、BASIC の命令の書き方。**使う命令は先にこれで形を確かめる**。引数なしで一覧 |
| `e500 lint .` | 文法チェック（`.asm`、`.bas`） |
| `e500 asm prog.asm -o prog.bin -l prog.lst` | アセンブル（機械語、リスト、`-s` シンボル、`-f hex`）。`e500asm` と同じ出力 |
| `e500 dis CODE.BIN -o code.asm` | 逆アセンブル。`SAVE M` のファイルはアドレスを自分で読む。生のバイト列は `--org BEC00` |
| `e500 run prog.asm --png s.png` | エミュレータで動かし、画面の文字、状態、PNG を得る |
| `e500 test .` | `*.e500test.json` のテスト |
| `e500 bin prog.asm` | 実機用の BIN（ソースの隣に作る）と、実機で打つ行 |

終了コードは 0 = 成功、1 = 間違いやテストの失敗、2 = 使い方や環境。`--json` で機械向けの出力。`run` と `test` は Windows、Linux、macOS（Linux と macOS では、その OS 用のエミュレータと `dotnet` が要る）。使えないときは、ほかのコマンドで書いて調べ、動かす確認は利用者に頼む。ROM は利用者のもので、リポジトリや成果物に入れない。

### run の使い方

```text
e500 run game.asm --seconds 3 --keys SPACE,wait:1,RIGHT --png s.png --memory "(score):2"
e500 run prog.bas --type "21\n" --rom 8.5
```

- `.asm` は `CLS:CALL 開始` を、`.bas` は `LOAD` して `RUN` を実行する。`--basic` で打つ行を変えられる（`\n` で複数行）。
- 状態: `ended`（プロンプトに戻った）、`running`（まだ動いている。ゲームなら正常）、`error`（BASIC のエラー）、`menu`（暴走して BASIC から出た）、`fault`（未定義命令）。
- キーの名前: `SPACE` `ENTER` `UP` `DOWN` `LEFT` `RIGHT` `ON/BRK` `BS` `DEL` `INS` `C-CE` `MENU` `BASIC` `F1`〜`F5`、英字、数字、`COMMA`。`wait:秒` で待つ。
- `--memory` は `ラベル:長さ`（外部メモリ）、`(名前):長さ`（内部 RAM）。
- 絵を使うものは PNG を必ず見る。文字だけでは分からない。LCD へ送っている途中だと、8 ドットごとにずれて写ることがある。`--seconds` を少し変えて撮り直す。
- 経過は標準エラー出力、結果は標準出力。最後の行が `state: …`。

## 進め方

1. `e500 check`。だめなら、足りないものを利用者に伝える（`e500 lint` と `e500 bin` はエミュレータなしで使える）。
2. 近いテンプレートかサンプルから始める。
3. 使う命令と IOCS を `e500 help` で確かめて書く。
4. `e500 lint` → `e500 run` → 期待どおりか、画面とメモリで確かめる。
5. ルーチンごとに `*.e500test.json` を書き（テンプレートになければ作る）、`e500 test` を通す。直した間違いはテストに足す。
6. 終わったら、確かめたことと、エミュレータだけの確認であること（実機は別）を報告する。

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

INCLUDE ファイルの名前（`sprite_draw`、`random_seed`、`PAD_LEFT` など）も `e500 help` で調べられる。詳しくは [references/assembly.md](references/assembly.md)、ゲームは [references/game.md](references/game.md)。

## 間違えやすいこと（BASIC）

- すべての行に行番号（1〜65279）。1 行 254 文字まで。ラベルは行の先頭に `*NAME:`。
- 構造化の命令（`WHILE`、`REPEAT`、`SWITCH`、複数行の `IF`〜`ENDIF`）は **ROM 8.x だけ**（PC-E500S、PC-U6000、PC-E650）。7.2 などでは `Syntax error`、複数行の `IF` はエラーにならずに誤動作する。使うなら `--rom 8.5` で確かめる。
- 名前の先頭は命令の綴りにできない（`TOTAL` は `TO TAL` と読まれる）。
- `GCURSOR` の Y は文字や絵の一番下のドット。`LINE` は `…,S|R|X,線種,B|BF` の順。
- `AND`、`OR`、`XOR` は同じ強さで左から。`NOT` は関数と同じ強さ。
- `INKEY$` は待たない。`BEEP 回数,音程,長さ` の音程は大きいほど低い。
- 配列は使う前に `DIM`。`FOR` の途中で抜けない（6 段まで）。

詳しくは [references/basic.md](references/basic.md)。

## テスト

[references/testing.md](references/testing.md) の形で `名前.e500test.json` を書く。計算のルーチンは `RET` で終えて `"return": "near"` で 1 つずつ、入口は `"basic"` で 1 件、画面は `"screen"`（文字）か `"picture"`（`.lcd`）で確かめる。

## もっと調べる

このリポジトリ（pc-e500_tools）の中なら次を読む。ほかの場所なら <https://github.com/litchi-gh/pc-e500_tools> の同じパス。長いので、必要な節だけを検索して読む。

| 知りたいこと | 読む場所 |
|---|---|
| 命令の詳細、フラグ、サイクル | `docs/manual/05_INSTRUCTIONS.md`、`docs/analysis/02_CPU.md` |
| アセンブラの文法、疑似命令 | `docs/manual/04_ASSEMBLER_REFERENCE.md` |
| 短いルーチン（掛け算、割り算、10 進表示など） | `docs/manual/20_RECIPES.md`、`Samples/Assembler/Recipes` |
| IOCS の番号と引数 | `docs/analysis/11_IOCS.md` |
| LCD の配線と表示 RAM | `docs/analysis/04_LCD.md` |
| BASIC の命令 | `docs/analysis/14_BASIC_REFERENCE.md`（`### 命令名` で検索） |
| 動く見本 | `Samples/`（アセンブラのものはテスト付き） |
