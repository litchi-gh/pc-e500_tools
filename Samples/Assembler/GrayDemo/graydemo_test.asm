; graydemo_test.asm: テストだけで呼ぶ入口（本体の後ろに足す）
        INCLUDE "graydemo.asm"

t_cnt   EQU   $01

; 描いてから、gray_show を A 回呼ぶ
t_show: MV    (t_cnt),A
        CALL  gray_clear
        CALL  draw
t_show1:
        CALL  gray_show
        DEC   (t_cnt)
        JRNZ  t_show1
        RET

; 白い 1 枚目を送ってから描き、2 枚目の行 0 と 2 だけを送る
t_rows: CALL  gray_clear
        CALL  gray_show
        CALL  draw
        MV    A,5
        JP    gray_show_rows

; 右下にはみ出すキャラクタ
t_clip: CALL  gray_clear
        MV    (gray_x),230
        MV    (gray_row),3
        MV    X,ball
        MV    A,1
        CALL  gray_sprite
        JP    gray_show
