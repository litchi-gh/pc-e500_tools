; pad.inc: ゲーム用のキー入力（hardware.inc が要る。割り込みを止めているとき用）
;
;           CALL  pad_read          ; A = (pad_now) = 押されているキー
;           TEST  A,PAD_LEFT
;           JRNZ  go_left
;           TEST  (pad_new),PAD_A   ; いま押されたところ
;
; 何度も押し直さなくてよいものは pad_now、1 回だけ効かせるものは pad_new を見る。

PAD_LEFT        EQU $01         ; 左
PAD_RIGHT       EQU $02         ; 右
PAD_UP          EQU $04         ; 上
PAD_DOWN        EQU $08         ; 下
PAD_A           EQU $10         ; SPACE
PAD_B           EQU $20         ; RETURN
PAD_C           EQU $40         ; Z
PAD_BREAK       EQU $80         ; ON/BRK

pad_now         EQU $20         ; 押されているキー
pad_new         EQU $21         ; 前に読んだときは押されていなかったキー
pad_old         EQU $22         ; 作業用

pad_read:
        MV    (pad_old),(pad_now)
        MV    (pad_now),0
        AND   (KOH),$F0         ; 上位 4 ビットは別の信号なので残す
        MV    (KOL),$10         ; KO4: 右は KI6、RETURN は KI7
        NOP
        MV    A,(KI)
        TEST  A,$40
        JRZ   pad_1
        OR    (pad_now),PAD_RIGHT
pad_1:  TEST  A,$80
        JRZ   pad_2
        OR    (pad_now),PAD_B
pad_2:  MV    (KOL),$08         ; KO3: 上は KI6、左は KI7
        NOP
        MV    A,(KI)
        TEST  A,$40
        JRZ   pad_3
        OR    (pad_now),PAD_UP
pad_3:  TEST  A,$80
        JRZ   pad_4
        OR    (pad_now),PAD_LEFT
pad_4:  MV    (KOL),$04         ; KO2: SPACE は KI6、下は KI7
        NOP
        MV    A,(KI)
        TEST  A,$40
        JRZ   pad_5
        OR    (pad_now),PAD_A
pad_5:  TEST  A,$80
        JRZ   pad_6
        OR    (pad_now),PAD_DOWN
pad_6:  MV    (KOL),$01         ; KO0: Z は KI5
        NOP
        TEST  (KI),$20
        JRZ   pad_7
        OR    (pad_now),PAD_C
pad_7:  MV    (KOL),0
        OR    (KOH),$08         ; KO11: ON/BRK は KI1
        NOP
        TEST  (KI),$02
        JRZ   pad_8
        OR    (pad_now),PAD_BREAK
pad_8:  AND   (KOH),$F0
        MV    A,(pad_old)       ; 新しく押されたもの = 今 かつ 前でない
        XOR   A,$FF
        AND   A,(pad_now)
        MV    (pad_new),A
        MV    A,(pad_now)
        RET
