; 03: BASIC から 2 つの数を受け取って足す
        ORG   $BEC00
DATA:   DB    0,0               ; 足す数（BASIC が POKE する）
SUM:    DB    0,0               ; 結果（下位、上位）

start:  MV    A,[DATA]
        MV    IL,[DATA+1]
        ADD   A,IL              ; A = A + IL。桁上がりは C
        MV    [SUM],A
        MV    A,0
        ADC   A,0               ; A = 0 + 0 + C
        MV    [SUM+1],A
        RC
        RETF
        END
