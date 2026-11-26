; 02: 値をメモリに置く
        ORG   $BEC00
start:  MV    A,123             ; A に 123 を入れる
        MV    [RESULT],A        ; RESULT アドレスに書く
        RC
        RETF
RESULT: DB    0                 ; 結果を置く 1 バイト
        END
