; random.inc: 乱数
;
;           CALL  random            ; A = 0〜255
;           MV    IL,10
;           CALL  random_below      ; A = 0〜9
;
; 始めに random_seed（2 バイト、0 以外）を変えると、別の並びになる。

; A に 0〜255 の乱数を返す。B、IL が変わる。
random:
        MV    IL,8
        MV    BA,[random_seed]
random_1:
        RC                      ; 右へ 1 ビット。出たビットが 1 なら B400h と XOR
        EX    A,B
        SHR   A
        EX    A,B
        SHR   A
        JRNC  random_2
        EX    A,B
        XOR   A,$B4
        EX    A,B
random_2:
        DEC   IL
        JRNZ  random_1
        MV    [random_seed],BA
        RET

; A に 0〜IL-1 の乱数を返す（IL = 1〜255）。B が変わる。
random_below:
        PUSHU IL
        CALL  random
        POPU  IL
random_below1:
        SUB   A,IL
        JRNC  random_below1
        ADD   A,IL
        RET

random_seed: DW $ACE1
