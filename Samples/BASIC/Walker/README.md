# 歩く人

テンキーの 4 6 8 2 で人を動かします。5 で終わります。

![画面](../../../docs/images/samples/walker.png)

| キー | 働き |
|---|---|
| 4 6 8 2 | 左 右 上 下 |
| 5 | 終わる |

## プログラム

[WALKER.BAS](WALKER.BAS)

```basic
10 REM *** WALKER ***
20 CLS:WAIT 0
30 A$="10884B3F4B881000"
40 B$="00100BFF4B881000"
50 X=116:Y=19:F=0
60 GOSUB 300
100 K$=INKEY$:IF K$="" THEN 100
110 U=X:V=Y
120 IF K$="4" AND X>0 THEN X=X-2
130 IF K$="6" AND X<232 THEN X=X+2
140 IF K$="8" AND Y>7 THEN Y=Y-2
150 IF K$="2" AND Y<31 THEN Y=Y+2
160 IF K$="5" THEN CLS:END
170 LINE (U,V-7)-(U+7,V),R,BF
180 F=1-F:GOSUB 300:GOTO 100
300 GCURSOR (X,Y)
310 IF F=0 THEN GPRINT A$; ELSE GPRINT B$;
320 RETURN
```

## 説明

| 行 | 内容 |
|---|---|
| 30、40 | 2 コマの絵。16 進 2 桁が縦 8 ドット（ビット 0 が上）で、8 桁ぶん |
| 170 | 前の場所を `LINE …,R,BF` で消す。`R` は消灯、`BF` は塗りつぶし |
| 180 | `F=1-F` で 0 と 1 を交互にして、コマを切り替える |
| 300 | `GCURSOR` の Y は、絵の一番下のドット。だから消すのは `V-7` から `V` |

## 変えてみる

- ドットエディタの「GP」で、自分の絵を `GPRINT` の行にする（[ドットエディタ](../../../docs/manual/12_DOT_EDITOR.md#127-書き出す)）
- 速さを変える（130〜150 行の `2`）
