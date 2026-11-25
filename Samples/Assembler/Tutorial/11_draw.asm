; 11: IOCS で線と四角を描く
        ORG   $BEC00
        INCLUDE "iocs.inc"
        INCLUDE "hardware.inc"

start:  MVW   (CX),DEV_SCRN
        MV    IL,SCRN_CLEAR     ; 画面を消す
        CALLF IOCS
        MV    A,0
        MV    [DOTSOP],A        ; 点灯
        MV    BA,$FFFF
        MV    [LINPTN],BA       ; 実線
        MVW   (CX),DEV_SCRN
        MV    X,0               ; 始点 (0,0)
        MV    Y,0
        MVW   (BX),239          ; 終点 (239,31)
        MVW   (DX),31
        MV    IL,SCRN_LINE
        CALLF IOCS
        MVW   (CX),DEV_SCRN
        MV    X,100             ; (100,10)〜(139,21) を塗る
        MV    Y,10
        MVW   (BX),139
        MVW   (DX),21
        MV    IL,SCRN_BOX
        CALLF IOCS
        RC
        RETF
        END
