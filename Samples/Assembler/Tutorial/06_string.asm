; 06: 文字列の長さを数え、小文字を大文字にする
        ORG   $BEC00
TEXT:   DB    "Hello, Pc-e500!",0
LENGTH: DB    0
TEMP    EQU   $20

start:  MV    X,TEXT            ; X = 文字列の先頭アドレス
        MV    IL,0              ; 長さ
next:   MV    A,[X]             ; 1 文字読む
        CMP   A,0               ; 0 なら終わり
        JRZ   finish
        CMP   A,'a'
        JRC   skip              ; 'a' より小さい
        CMP   A,'z'+1
        JRNC  skip              ; 'z' より大きい
        SUB   A,$20             ; 小文字 → 大文字
        MV    [X],A
skip:   INC   X                 ; 次のアドレス
        INC   IL
        JR    next
finish: MV    (TEMP),IL         ; IL から A へは直接移せないので内部 RAM を通す
        MV    A,(TEMP)
        MV    [LENGTH],A
        RC
        RETF
        END
