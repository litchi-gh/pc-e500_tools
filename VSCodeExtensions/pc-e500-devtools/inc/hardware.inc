; hardware.inc: PC-E500 のハードウェア（内部 RAM のレジスタ、LCD、キー、作業域）に名前を付けたもの
; 名前は値を置き換えるだけで、プログラムの大きさは変わらない。

; 内部 RAM のレジスタ: MV A,(KI) のように使う（BP、PX、PY はそのまま書ける）
AMC     EQU $EF         ; アドレス修正
KOL     EQU $F0         ; キーの列 KO0〜KO7（1 = 調べる）
KOH     EQU $F1         ; キーの列 KO8〜KO11
KI      EQU $F2         ; 押されているキーの行 KI0〜KI7
EOL     EQU $F3         ; E ポートの出力（下位）
EOH     EQU $F4         ; E ポートの出力（上位）
EIL     EQU $F5         ; E ポートの入力（下位）
EIH     EQU $F6         ; E ポートの入力（上位）
UCR     EQU $F7         ; UART の制御
USR     EQU $F8         ; UART の状態
RXD     EQU $F9         ; UART の受信
TXD     EQU $FA         ; UART の送信
IMR     EQU $FB         ; 割り込みマスク
ISR     EQU $FC         ; 割り込みの要求
SCR     EQU $FD         ; システム制御（ブザーなど）
LCC     EQU $FE         ; コントラストなど
SSR     EQU $FF         ; システムの状態

; IMR・ISR のビット
MTI     EQU $01         ; 速いタイマ
STI     EQU $02         ; 遅いタイマ
KEYI    EQU $04         ; キー
ONKI    EQU $08         ; ON/BRK
TXRI    EQU $10         ; 送信
RXRI    EQU $20         ; 受信
EXI     EQU $40         ; 外部
IRM     EQU $80         ; IMR だけ: 全体の許可

; SCR のブザー（AND (SCR),BZ_OFF してから OR (SCR),BZ_2K）
BZ_OFF  EQU $8F
BZ_2K   EQU $20
BZ_4K   EQU $30

; SSR
ONK     EQU $08         ; ON/BRK が押されている

; LCD コントローラ: LCD_A は画面の中央、LCD_B は両端
LCD_ALL         EQU $2000   ; 両方への命令
LCD_B           EQU $2004   ; 命令
LCD_B_STATUS    EQU $2005   ; 状態
LCD_B_WRITE     EQU $2006   ; データを書く
LCD_B_READ      EQU $2007   ; データを読む
LCD_A           EQU $2008
LCD_A_STATUS    EQU $2009
LCD_A_WRITE     EQU $200A
LCD_A_READ      EQU $200B
LCD_BUSY        EQU $80     ; 状態のビット: 動作中
LCD_OFF         EQU $3E     ; 命令: 表示 OFF
LCD_ON          EQU $3F     ; 命令: 表示 ON
LCD_COLUMN      EQU $40     ; 命令: 桁（0〜63 を足す）
LCD_PAGE        EQU $B8     ; 命令: ページ（0〜7 を足す）
LCD_START       EQU $C0     ; 命令: 表示開始ライン（0〜63 を足す）

; IOCS の作業域
LCDMODE EQU $BFCA1      ; ビット 6 = 文字を反転
DOTSOP  EQU $BFC96      ; 点の描き方 0: 点灯、1: 消灯、2: 反転
LINPTN  EQU $BFC2A      ; 線種・模様（2 バイト）
FONT_20 EQU $BFC90      ; 20h〜7Fh の字形の先頭アドレス（3 バイト。1 文字 6 バイト）
FONT_80 EQU $BFC8A      ; 80h〜9Fh の字形の先頭アドレス
FONT_A0 EQU $BFC93      ; A0h〜DFh の字形の先頭アドレス
KEYWAIT EQU $BFCBA      ; キーの繰り返しまで（16 ms 単位）
KEYPITCH EQU $BFCBB     ; キーの繰り返しの間隔（16 ms 単位）
AUTOOFF EQU $BFCBC      ; 自動電源 OFF まで（約 0.5 秒単位、2 バイト）
ML_AREA EQU $BFD1A      ; 機械語エリアの先頭アドレス（3 バイト）
ML_TOP  EQU $BFC00      ; 機械語エリアはここの手前まで
