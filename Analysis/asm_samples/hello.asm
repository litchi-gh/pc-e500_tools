; IOCS (device 0: LCD, command $42) で最下行に文字列を表示する
        ORG  $BEC00
IOCS    EQU  $FFFE8
BL      EQU  $D4              ; x 座標 (0-39)
BH      EQU  $D5              ; y 座標 (0-3)
CL      EQU  $D6              ; device
CH      EQU  $D7              ; drive
start:  MV   (CL),0            ; device 0 = LCD
        MV   (CH),0            ; drive 0
        MV   (BL),0            ; x = 0
        MV   (BH),3            ; y = 3
        MV   IL,$42            ; 指定位置へ n 文字表示
        MV   X,msg             ; 文字列先頭
        MV   Y,msg_end-msg     ; 長さ
        CALLF IOCS             ; C=1 なら A にエラー番号
        RETF                   ; C と A をそのまま BASIC へ返す
msg:    DB   "HELLO, PC-E650!"
msg_end:
        END
