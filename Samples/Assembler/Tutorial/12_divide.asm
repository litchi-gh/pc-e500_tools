; 12: 割り算（16 ビット ÷ 8 ビット）。0 で割ると BASIC のエラーにする
        ORG   $BEC00
NUM:    DW    0                 ; 割られる数
BY:     DB    0                 ; 割る数
QUOT:   DW    0                 ; 商
REST:   DB    0                 ; 余り

start:  MV    A,[BY]
        CMP   A,0
        JRZ   error
        MV    IL,[BY]           ; I = 割る数（16 ビット）
        MV    Y,0               ; 商を数える
        MV    BA,[NUM]
div:    SUB   BA,I              ; 引けるだけ引く
        JRC   done              ; 引きすぎた
        INC   Y
        JR    div
done:   ADD   BA,I              ; 引きすぎた分を戻す
        MV    [REST],A
        MV    BA,Y              ; Y の下位 16 ビット
        MV    [QUOT],BA
        RC
        RETF

error:  MV    A,21              ; C = 1 で戻ると、A が BASIC のエラー番号になる
        SC
        RETF
        END
