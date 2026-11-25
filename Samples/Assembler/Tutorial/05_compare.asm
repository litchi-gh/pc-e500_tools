; 05: 2 つの数の大きい方を選ぶ
        ORG   $BEC00
DATA:   DB    0,0
MAX:    DB    0
TEMP    EQU   $20               ; 内部 RAM の 20h

start:  MV    A,[DATA]
        MV    (TEMP),A          ; 1 つ目を内部 RAM に置く
        MV    A,[DATA+1]        ; 2 つ目は A
        CMP   (TEMP),A          ; (TEMP) - A を計算して、フラグだけ変える
        JRC   done              ; C = 1: (TEMP) の方が小さい → A が大きい方
        MV    A,(TEMP)          ; そうでなければ (TEMP) が大きい方
done:   MV    [MAX],A
        RC
        RETF
        END
