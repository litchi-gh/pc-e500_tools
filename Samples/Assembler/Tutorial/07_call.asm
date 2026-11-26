; 07: サブルーチンとスタック（数の 3 乗）
        ORG   $BEC00
NUM:    DB    0
CUBE:   DB    0,0
TEMP    EQU   $20               ; 内部 RAM（2 バイト）

start:  MV    IL,[NUM]
        MV    BA,I              ; BA = 数
        CALL  multiply          ; BA = BA × I
        CALL  multiply          ; もう一度かけて 3 乗
        MV    [CUBE],BA
        RC
        RETF

; BA = BA × I。I は変わらない。
multiply:
        PUSHU I                 ; 呼んだ側の I を U スタックに預ける
        MV    (TEMP),BA         ; かけられる数
        MV    BA,0
mul_1:  PUSHU I                 ; 回数を預けて、I を足し算に使う
        MV    I,(TEMP)
        ADD   BA,I
        POPU  I
        DEC   I
        JRNZ  mul_1
        POPU  I                 ; 預けた I を戻す
        RET                     ; 呼ばれた所へ戻る
        END
