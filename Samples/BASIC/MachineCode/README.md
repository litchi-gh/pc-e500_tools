# BASIC から機械語を呼ぶ

`DATA` の機械語を `POKE` で置き、2 つの数を足します。機械語は[例題 3](../../Assembler/Tutorial/03_add.asm) です。

## プログラム

[MCALL.BAS](MCALL.BAS)

```basic
10 REM *** CALL MACHINE CODE ***
20 REM RESERVE 1000H FIRST:
30 REM POKE &HBFE03,&H1A,&HFD,&HB,0,&H10,0:CALL &HFFFD8
40 IF PEEK &HBFD1B<>&HEC THEN PRINT "RESERVE FIRST":END
50 RESTORE 200
60 FOR I=0 TO 27:READ D:POKE &HBEC00+I,D:NEXT I
70 INPUT "A (0-255)? ";A
80 INPUT "B (0-255)? ";B
90 POKE &HBEC00,A,B
100 CALL &HBEC04
110 PRINT A;"+";B;"=";PEEK &HBEC02+256*PEEK &HBEC03
120 END
200 DATA 0,0,0,0
210 DATA &H88,&H00,&HEC,&H0B
220 DATA &H89,&H01,&HEC,&H0B
230 DATA &H46,&H01
240 DATA &HA8,&H02,&HEC,&H0B
250 DATA &H08,&H00,&H50,&H00
260 DATA &HA8,&H03,&HEC,&H0B
270 DATA &H9F,&H07
```

## 説明

| 行 | 内容 |
|---|---|
| 30 | 最初に 1 回だけ打つ、機械語エリアの確保（[実機へ送る](../../../docs/manual/14_TRANSFER.md#143-機械語エリアを確保する)） |
| 40 | 確保してあるかを、ポインタの値で調べる |
| 60 | 28 バイトを `BEC00h` から書く |
| 90 | 足す数を渡す |
| 100 | `start` は `BEC04h` |
| 110 | 結果は下位、上位の順 |

## 変えてみる

- 例題 7（3 乗）の機械語に入れ替える。バイト列はリスト（`e500asm -l`）で分かる
