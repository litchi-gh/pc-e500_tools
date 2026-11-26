; 10: 押されたキーの文字を返す（キーを待つ）
        ORG   $BEC00
        INCLUDE "iocs.inc"
KEY:    DB    0

start:  MVW   (CX),DEV_KYBD     ; デバイス 1、ドライブ 0 を一度に入れる
        MV    IL,KYBD_CLEAR     ; たまったキーを捨てる
        CALLF IOCS
        MVW   (CX),DEV_KYBD
        MV    A,$80             ; ビット 7 = 1: 押されるまで待つ
        MV    IL,KYBD_READ
        CALLF IOCS              ; A = 文字
        MV    [KEY],A
        RC
        RETF
        END
