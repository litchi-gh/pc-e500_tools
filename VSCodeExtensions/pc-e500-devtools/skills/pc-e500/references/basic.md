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

構造化（ROM 8.x だけ）

```basic
10 I=1
20 WHILE I<=3
30 PRINT I;:I=I+1
40 WEND
50 SWITCH N
60 CASE 1
70 PRINT "ONE"
80 DEFAULT
90 PRINT "?"
100 ENDSWITCH
110 IF N=1 THEN
120 PRINT "YES"
130 ELSE
140 PRINT "NO"
150 ENDIF
```

`SWITCH`、`CASE`、`DEFAULT`、`ENDSWITCH` は行の先頭に 1 つだけ書く。`SWITCH` の後は変数だけ（式は不可）。

## 絵と音

```basic
10 LINE (0,0)-(239,31),S,&HFFFF,B
20 GCURSOR (100,15):GPRINT "183C7E7E3C18"
30 PSET (10,10):BEEP 1,20,200
```

`GPRINT` は 16 進 2 桁が縦 8 ドット（上がビット 0）。`GCURSOR` の Y は、その一番下のドット。

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
