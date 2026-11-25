; 09: IOCS で文字列を表示する
        ORG   $BEC00
        INCLUDE "iocs.inc"

start:  MV    (CL),DEV_SCRN     ; デバイス: 画面
        MV    (CH),0            ; ドライブ
        MV    (BL),5            ; x = 5 桁目
        MV    (BH),2            ; y = 2 行目
        MV    X,msg             ; 文字列の先頭
        MV    Y,msg_end-msg     ; 長さ
        MV    IL,SCRN_PUTS      ; 番号: 指定位置へ n 文字表示
        CALLF IOCS
        RC
        RETF

msg:    DB    "HELLO, IOCS!"
msg_end:
        END
