# PC-E500 BASIC の要点

命令の形は `e500 help 命令` で確かめる。ほかの BASIC と似ていても、引数の順や範囲が違う。

## 画面とキー

- 文字は 40 桁 × 4 行（`LOCATE 桁,行`）、ドットは 240 × 32（左上が 0,0）。
- `PRINT` の数は右詰めになる。つなげて出すなら `PRINT "A=";A` や `STR$`。
- スクロールさせないため、画面の最後の行では `PRINT …;` と `;` で終える。
- キーを待つ: `10 K$=INKEY$:IF K$="" THEN 10`。`RUN` の ENTER を拾わないように、先に `IF INKEY$<>"" THEN 自分の行` で離されるのを待つと確実。
- 止まった画面を見せて終わるなら、最後にキーを待つ（終わるとプロンプト `>` が出る）。

## 数と文字列

- 単精度 10 桁、倍精度（`A#`）20 桁、10 進で計算する。整数型はない。
- 文字列は 254 文字まで。`MID$(A$,位置,文字数)` の文字数は省けない。
- 16 進は `&HFF`。`HEX$`、`VAL("&H30")`。
- `A`〜`Z` は固定変数。`RUN` では消えないので、始めに値を入れる。ほかの変数は消える。
- 比較の結果は真 −1、偽 0。

## 流れ

```basic
10 FOR I=1 TO 10
20 IF I=5 THEN 40
30 PRINT I;
40 NEXT I
50 GOSUB *SUB1
60 END
100 *SUB1:PRINT "HI"
110 RETURN
```

- `IF 条件 THEN 文 ELSE 文`（1 行）。`THEN` の後に行番号も書ける。
- エラーは `ON ERROR GOTO 行`、`ERN`（番号）、`ERL`（行）、`RESUME`。

### 構造化 BASIC は使わない

`WHILE`〜`WEND`、`REPEAT`〜`UNTIL`、`SWITCH`〜`ENDSWITCH`、複数行の `IF`〜`ENDIF` は、一部の機種（PC-E650、PC-U6000、PC-E500S）だけの命令。どの機種でも動く形で書く。

| 書きたいこと | 書き方 |
|---|---|
| 条件が成り立つ間くり返す | 始めで逆の条件を調べて抜け、終わりで `GOTO` |
| 1 回はして、条件までくり返す | 終わりで `IF 続ける条件 THEN 始めの行` |
| 分けて何行もする | `IF 条件 THEN GOSUB 行 ELSE GOSUB 行` |
| 値で分ける | `ON N GOSUB 行,行`（1 から。範囲の外は次へ進む） |

```basic
10 CLEAR:CLS:WAIT 0
20 REM --- WHILE I<=3 ---
30 I=1
40 IF I>3 THEN 70
50 PRINT I;
60 I=I+1:GOTO 40
70 REM --- REPEAT UNTIL I=3 ---
80 I=0
90 I=I+1
100 IF I<3 THEN 90
110 REM --- IF, ELSE ---
120 IF I=3 THEN GOSUB 500 ELSE GOSUB 600
130 REM --- SWITCH N ---
140 N=2
150 ON N GOSUB 700,800
160 IF N<1 OR N>2 THEN GOSUB 900
170 END
500 PRINT "THREE":RETURN
600 PRINT "OTHER":RETURN
700 PRINT "ONE":RETURN
800 PRINT "TWO":RETURN
900 PRINT "ELSE":RETURN
```

構造化 BASIC を使うのは、利用者がその機種だけでよいと言って頼んだときと、使っている既存のプログラムを直すときだけ。形は `e500 help WHILE SWITCH IF`、確かめは `--rom 8.5`。`SWITCH`、`CASE`、`DEFAULT`、`ENDSWITCH` は行の先頭に 1 つだけ書き、`SWITCH` の後は変数だけ（式は不可）。

## 絵と音

```basic
10 LINE (0,0)-(239,31),S,&HFFFF,B
20 GCURSOR (100,15):GPRINT "183C7E7E3C18"
30 PSET (10,10):BEEP 1,20,200
```

`GPRINT` は 16 進 2 桁が縦 8 ドット（上がビット 0）。`GCURSOR` の Y は、その一番下のドット。

## データは DATA に寄せる

キャラクタの絵、面、敵の並び、表、単価、問題と答え、文言、音の高さと長さは、**プログラムの最後の `DATA` にまとめる**。絵や数を変えるときに `DATA` だけを直せばよく、命令の行は変えなくて済む。

```basic
10 CLEAR:CLS:WAIT 0
20 RESTORE 900:READ N:DIM C$(N)*36
30 FOR I=1 TO N:READ C$(I):NEXT I
40 RESTORE 950:READ M:DIM P(M),T(M)
50 FOR I=1 TO M:READ P(I),T(I):NEXT I
60 GCURSOR (60,15):GPRINT C$(1);
70 FOR I=1 TO M:BEEP 1,P(I),T(I):NEXT I
80 END
900 REM --- PICTURES: FACE, ROCK ---
910 DATA 2
920 DATA "3C42A581A5423C00"
930 DATA "187E7EFFFF7E7E18"
950 REM --- TUNE: PITCH,LENGTH ---
960 DATA 3
970 DATA 100,80,90,80,80,160
```

- **先頭に件数**を書いて `DIM` と `FOR` に使う。件数と中身が合わないと `Out of data` になる。
- 種類ごとに行番号の区切りを変え（900 = 絵、950 = 音など）、`REM` で中身と並び順を書く。読む前に `RESTORE 行` で、その種類の先頭に合わせる。
- 絵は `GPRINT` の 16 進の文字列（2 桁が縦 8 ドット、上がビット 0）。`DIM C$(N)*文字数` は、いちばん長い絵の文字数（幅 × 2）にする。高さが 16 以上の絵は、8 ドットの段ごとに分ける。消すための空白の絵も `DATA` に入れる。
- `READ` は始めに 1 回で配列に読む（1 つ約 5 ms）。**動いている間に `READ` しない。**
- 値は定数だけ（式は書けない）。16 進は `&HFF`。`,` や前後の空白を含む文字列は `"` で囲む。1 行 254 文字まで。
- プログラムの行が `DATA` に届いても何も起きないが、`END` を置いて、サブルーチンへ流れ込まないようにする。
- 面やコースは、1 行 1 段の文字列（`"#....@..#"`）にすると、見て直せる。

## ファイル

`E:`（RAM ディスク。`INIT "E:8K"` は直接打つときだけ）、`F:`、`X:`、`CAS:`、`COM:`。

```basic
10 OPEN "E:DATA" FOR OUTPUT AS #1
20 PRINT #1,A$
30 CLOSE #1
```

ないファイルを `FOR APPEND` で開くと `File not found`。

## 機械語と一緒に使う

`POKE アドレス,値,…`、`CALL アドレス`（引数なし）、`PEEK アドレス`。確保と読み込みの行は `e500 bin prog.asm` が出す。`LOAD M "X:PROG.BIN"` はプログラムの中でも使える。

## 速くする

`REM` を減らす、よく使う変数を早く使い始める、文字列をまとめて 1 回で `PRINT` する、重い所だけ機械語にする。
