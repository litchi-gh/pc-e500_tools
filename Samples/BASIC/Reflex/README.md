# 反応速度

音が鳴って「NOW!」が出たら、できるだけ速く SPACE を押します。鳴る前に押すと失敗です。

![画面](../../../docs/images/samples/reflex.png)

| キー | 働き |
|---|---|
| SPACE | 押す |
| Y / N | もう一度 / 終わる |

## プログラム

[REFLEX.BAS](REFLEX.BAS)

```basic
10 REM *** REFLEX ***
20 RANDOMIZE:WAIT 0:B=999
100 CLS:PRINT "PRESS SPACE AFTER THE BEEP"
110 IF INKEY$<>"" THEN 110
120 FOR I=1 TO 60+RND 150
130 IF INKEY$=" " THEN 400
140 NEXT I
150 BEEP 1,10,40:LOCATE 17,2:PRINT "NOW!";
160 C=0
170 C=C+1:IF INKEY$<>" " THEN 170
200 LOCATE 0,1:PRINT "COUNT:";C
210 IF C<B THEN B=C:PRINT "BEST!"
220 GOTO 500
400 PRINT "TOO EARLY":BEEP 1,200,200
500 LOCATE 0,3:PRINT "AGAIN? (Y/N)  BEST:";B;
510 K$=INKEY$:IF K$="Y" THEN 100
520 IF K$<>"N" THEN 510
530 CLS:END
```

## 説明

| 行 | 内容 |
|---|---|
| 110 | 押しっぱなしのキーが離されるのを待つ |
| 120〜140 | 待つ長さを `RND` で変える。途中で押したら 400 行へ |
| 170 | 押されるまで数える。数が小さいほど速い |
| 210 | 一番速い記録を残す |

## 変えてみる

- 待つ長さを変える（120 行）
- 5 回の平均を出す
