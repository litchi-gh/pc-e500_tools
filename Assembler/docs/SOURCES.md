# 仕様の参照元

主な一次資料はSHARP CORPORATION **ESR-L INSTRUCTION MANUAL**です。
[Forth500 resourcesで公開されているスキャン](https://github.com/Robert-van-Engelen/Forth500/blob/main/resources/ESR%20L%20CPU%20technical%20manual.pdf)を参照しました。
PDFの先頭を0ページとしたインデックスが、本文の印刷ページ番号と一致しています。

- pp.42–46：内部RAM／外部メモリのアドレッシング。
- p.47：AとILの相互MVは禁止。
- pp.48–51：16／20ビットレジスタ、Sに対する外部メモリ指定の制限。
- pp.52–55、p.80：MVL、MVLD、EX。MVLの単純レジスタ間接は+0変位に置換。
- pp.56–57、p.82：ADD/SUBの幅と符号化。
- p.68：JRは命令位置+2を基準とし、PSを保持してPCの16ビット内で計算。
- pp.74–86：命令のビットパターン。
- p.87：PRE対応表。内部RAMオペランドが1個のときは第2オペランドがBP相対の列を使用。
- p.88：オペコード一覧。

[PockEmul](https://github.com/pockemul/PockEmul) 由来のSC62015エミュレータ実装（`sc62015.cpp`、`sc62015d.cpp`）を、実装との相互照合に使用しました。
これらはGPL-2.0-or-laterコードです。本アセンブラへのソースコード取り込みは行わず、独立したパーサ・エンコーダを実装しています。
統合テストは既存DLLを任意で呼び出すだけで、DLL・ROMを本アセンブラへ同梱しません。

[gikonekos/sc62015-opcode-reference](https://github.com/gikonekos/sc62015-opcode-reference) の命令再構成表も照合に使いました。
再構成資料と一次資料に差がある箇所は、一次資料を優先しています。
特に20hを有効PREとして出力せず、同一BP相対の組合せはPRE省略とします。

PC-E500本体／IOCS資料は、Sharp *Technical Reference Manual PC-E500* 等で確認しました。
IOCS呼び出しのアドレスやメモリの確保方法は、今回のアセンブラ本体の仕様には組み込んでいません。

## 検証の範囲

命令ファミリ別の既知バイト列、PREの全16組合せ、前方参照、EQU循環、範囲外、セグメント境界、Intel HEX復元、INCLUDE/INCBIN、CLIの終了コードと出力保護をテストします。
CPU実行テストは独自の合成ROMで行い、10..1の合計55、CALL/RET、PREを使う内部RAM参照、外部メモリ、内部RAM間接、MVLを確認します。
全命令の実機動作・タイミング・各機種ROMとの互換性を保証するテストではありません。
