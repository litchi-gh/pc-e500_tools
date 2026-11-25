; 08: 内部 RAM を退避してから使う（16 バイトの並びを逆にする）
        ORG   $BEC00
WORK    EQU   $20               ; 内部 RAM の 20h〜2Fh を使う
PX_REG  EQU   $ED               ; PX レジスタのアドレス
DATA:   DB    1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16

start:  MV    I,16
        MVL   [SAVE],(WORK)     ; 元の内容を外部メモリへ（I バイト）
        MV    I,16
        MVL   (WORK),[DATA]     ; 16 バイトまとめて読む
        MV    X,DATA+16
        MV    (PX_REG),WORK     ; PX = 20h
        MV    IL,16
loop:   MV    A,(PX)            ; PX が指す内部 RAM
        MV    [--X],A           ; X を 1 減らしてから書く
        INC   (PX_REG)
        DEC   IL
        JRNZ  loop
        MV    I,16
        MVL   (WORK),[SAVE]     ; 元に戻す
        RC
        RETF
SAVE:   DS    16
        END
