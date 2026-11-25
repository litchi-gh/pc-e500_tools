# アセンブラ入門の例題

[アセンブラ入門](../../../docs/manual/03_ASSEMBLER_TUTORIAL.md)で使う 12 本です。どれも `BEC00h` に置き、テスト（`.e500test.json`）が付いています。

| # | ソース | 覚えること | 開始アドレス | BASIC での試し方 |
|---|---|---|---|---|
| 1 | [01_minimal.asm](01_minimal.asm) | `ORG`、`RC`、`RETF` | BEC00h | `CALL &HBEC00` |
| 2 | [02_store.asm](02_store.asm) | `MV`、`DB`、メモリへ書く | BEC00h | `CALL &HBEC00:PRINT PEEK &HBEC08` |
| 3 | [03_add.asm](03_add.asm) | `ADD`、`ADC`、値の受け渡し | BEC04h | `POKE &HBEC00,200,100:CALL &HBEC04:PRINT PEEK &HBEC02+256*PEEK &HBEC03` |
| 4 | [04_loop.asm](04_loop.asm) | `DEC`、`JRNZ`、16 ビット | BEC03h | `CALL &HBEC03:PRINT PEEK &HBEC01+256*PEEK &HBEC02` |
| 5 | [05_compare.asm](05_compare.asm) | `CMP`、`JRC` | BEC03h | `POKE &HBEC00,12,34:CALL &HBEC03:PRINT PEEK &HBEC02` |
| 6 | [06_string.asm](06_string.asm) | `[X]`、文字コード | BEC11h | `CALL &HBEC11:PRINT PEEK &HBEC10` |
| 7 | [07_call.asm](07_call.asm) | `CALL`、`PUSHU` | BEC03h | `POKE &HBEC00,7:CALL &HBEC03:PRINT PEEK &HBEC01+256*PEEK &HBEC02` |
| 8 | [08_internal.asm](08_internal.asm) | 内部 RAM、`MVL`、`PX` | BEC10h | `CALL &HBEC10:PRINT PEEK &HBEC00;PEEK &HBEC0F` |
| 9 | [09_iocs.asm](09_iocs.asm) | IOCS で表示 | BEC00h | `CLS:CALL &HBEC00` |
| 10 | [10_key.asm](10_key.asm) | IOCS でキーを待つ | BEC01h | `CALL &HBEC01:PRINT CHR$ PEEK &HBEC00` |
| 11 | [11_draw.asm](11_draw.asm) | IOCS で図形 | BEC00h | `CALL &HBEC00` |
| 12 | [12_divide.asm](12_divide.asm) | 割り算、BASIC のエラー | BEC06h | `POKE &HBEC00,232,3,7:CALL &HBEC06:PRINT PEEK &HBEC03` |

![例題 9](../../../docs/images/samples/tutorial-iocs.png)

![例題 11](../../../docs/images/samples/tutorial-draw.png)

`iocs.inc` などを使うもの（9〜11）を `e500asm` だけでアセンブルするときは、`-I` に拡張機能の `inc` を指定します（リポジトリでは `VSCodeExtensions/pc-e500-devtools/inc`）。
