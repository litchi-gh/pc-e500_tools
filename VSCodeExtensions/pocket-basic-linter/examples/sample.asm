; PC-E500 / PC-E650 (SC62015) sample for the Pocket ASM linter.
; IOCS (device 0: LCD, command $42) で最下行に文字列を表示する。
; PC-E650 ROM 8.5 で BEC00h に 1000h バイト確保し、CALL &HBEC00 で検証済み。
        ORG   $BEC00
IOCS    EQU   $FFFE8            ; IOCS 入口
BL      EQU   $D4               ; x 座標 (0-39)
BH      EQU   $D5               ; y 座標 (0-3)
CL      EQU   $D6               ; device
CH      EQU   $D7               ; drive

start:  PUSHU IMR               ; 割込みマスクを退避
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

; 内部 RAM とアドレッシングの例
WORK    EQU   $20
        MV    A,(WORK)          ; 内部 RAM 絶対 (PRE 30h)
        MV    A,(BP+2)          ; BP 相対 (PRE なし)
        MV    (PX+1),(PY+2)     ; PRE 37h
        MV    A,[X++]
        MVW   (WORK),[Y+5]
        JRNZ  start

msg:    DB    "HELLO, PC-E650!"
msg_end:
        DW    msg_end-msg
        DP    start
        END
