# 基本のサンプル

[機械語を実機で動かす](../../../docs/analysis/12_MACHINE_CODE.md)で説明している 3 本です。どれも `BEC00h` に置きます。

| ソース | 内容 | 試し方 |
|---|---|---|
| [hello.asm](hello.asm) | IOCS で最下行に文字列を表示する | `CLS:CALL &HBEC00` |
| [add.asm](add.asm) | 2 バイトを足して書く | `POKE &HBED00,3,4:CALL &HBEC00:PRINT PEEK &HBED02` |
| [bcd.asm](bcd.asm) | 内部 RAM を退避して、10 進（BCD）の足し算をする | `CALL &HBEC00:PRINT PEEK &HBED00,PEEK &HBED01,PEEK &HBED02,PEEK &HBED03` |

![hello.asm](../../../docs/images/samples/hello.png)
