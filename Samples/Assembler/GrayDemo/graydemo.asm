; graydemo.asm: gray.inc の使い方。4 階調の絵、キャラクタ、点を描いて表示する
;
; 絵（pic_hi.lcd、pic_lo.lcd）とキャラクタ（ball.gsp）は make_data.py が作る。
; ON/BRK で BASIC に戻る。

        ORG   $BE000
        INCLUDE "hardware.inc"

i_pt    EQU   $00               ; 点の番号

start:  CALL  game_start
        CALL  gray_clear
        CALL  draw
loop:   CALL  gray_show         ; 3 枚のうち次の 1 枚を送る
        MV    I,128             ; 約 1 ms あける（ちらつきが少ない）
loop1:  DEC   I
        JRNZ  loop1
        TEST  (SSR),ONK
        JRZ   loop
        CALL  game_end
        RC
        RETF

; 3 枚の画面に描く
draw:   MV    X,pic_hi          ; 絵
        MV    Y,pic_lo
        CALL  gray_load
        MV    (gray_x),128      ; キャラクタ（コマ 0 と 1）
        MV    (gray_row),2
        MV    X,ball
        MV    A,0
        CALL  gray_sprite
        MV    (gray_x),152
        MV    X,ball
        MV    A,1
        CALL  gray_sprite
        MV    (i_pt),0          ; 点: x = 190 + i、y = 16 + i ÷ 4、濃さ = i mod 4
draw1:  MV    A,(i_pt)
        ADD   A,190
        MV    (gray_x),A
        MV    A,(i_pt)
        SHR   A
        SHR   A
        AND   A,$3F
        ADD   A,16
        MV    (gray_y),A
        MV    A,(i_pt)
        AND   A,3
        CALL  gray_pset
        INC   (i_pt)
        CMP   (i_pt),50
        JRNZ  draw1
        RET

        INCLUDE "game.inc"
        INCLUDE "gray.inc"

pic_hi: INCBIN "pic_hi.lcd"
pic_lo: INCBIN "pic_lo.lcd"
ball:   INCBIN "ball.gsp"
