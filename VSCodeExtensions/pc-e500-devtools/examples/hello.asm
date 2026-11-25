; エミュレータでのデバッグとテストのサンプル。
; F5（エミュレータでデバッグ）で、機械語エリアを確保して書き込み、BASIC で CALL &HBEC00 を実行する。
; テストは hello.e500test.json（テスト エクスプローラーから実行）。
        ORG   $BEC00
IOCS    EQU   $FFFE8            ; IOCS エントリ
BL      EQU   $D4               ; x 座標 (0-39)
BH      EQU   $D5               ; y 座標 (0-3)
CL      EQU   $D6               ; device
CH      EQU   $D7               ; drive
WORK    EQU   $BED00            ; add2 の入力 2 バイトと結果

; 最下行に文字列を表示して BASIC へ戻る。
start:  PUSHU IMR               ; 割り込みマスクを退避
        MV    (CL),0            ; device 0 = LCD
        MV    (CH),0            ; drive 0
        MV    (BL),0            ; x = 0
        MV    (BH),3            ; y = 3
        MV    IL,$42            ; 指定位置へ n 文字表示
        MV    X,msg             ; 文字列先頭
        MV    Y,msg_end-msg     ; 長さ
        CALLF IOCS              ; C=1 なら A にエラー番号
        POPU  IMR
        RC
        RETF                    ; BASIC へ戻る (RET ではなく RETF)

; WORK と WORK+1 を足して WORK+2 に置く（A に結果、桁上がりは C）。
add2:   MV    IL,[WORK+1]
        MV    A,[WORK]
        ADD   A,IL
        MV    [WORK+2],A
        RETF

msg:    DB    "HELLO, PC-E500!"
msg_end:
        END
