; 04: 1 から N までの和
        ORG   $BEC00
N:      DB    10                ; いくつまで足すか
SUM:    DB    0,0

start:  MV    BA,0              ; 和（16 ビット）
        MV    IL,[N]            ; 回数（IL に書くと IH は 0 になる）
loop:   ADD   BA,I              ; BA = BA + I
        DEC   IL                ; 1 減らす。0 になると Z = 1
        JRNZ  loop              ; Z = 0（まだ 0 でない）なら loop へ
        MV    [SUM],BA          ; 2 バイト書く（下位が先）
        RC
        RETF
        END
