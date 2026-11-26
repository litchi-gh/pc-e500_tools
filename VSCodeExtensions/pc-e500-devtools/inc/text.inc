; text.inc: 仮想画面に文字と数字を描く（screen.inc と hardware.inc が要る）
;
;           MV    (text_x),0        ; x 座標（0〜234、ドット）
;           MV    (text_row),3      ; 行（0〜3）
;           MV    X,message         ; message: DB "SCORE",0
;           CALL  text_draw
;           MV    I,1234            ; 続けて数字（右詰め 5 桁）
;           CALL  number_draw
;
; 字形は本体の ROM のもの（6 × 8 ドット）。終わると (text_x) は次の文字の位置になる。

text_x          EQU $48
text_row        EQU $49
text_char       EQU $4A         ; 作業用
text_value      EQU $4C         ; 作業用（2 バイト）
text_digit      EQU $4E         ; 作業用
text_seen       EQU $4F         ; 作業用

; X の文字列（0 で終わる）を描く。右端を越える分は描かない。
text_draw:
        MV    A,[X++]
        CMP   A,0
        JRZ   text_end
        CALL  text_put
        JR    text_draw
text_end:
        RET

; A の文字を描く。X は変わらない。
text_put:
        CMP   (text_x),235
        JRNC  text_end
        MV    (text_char),A
        PUSHU X
        MV    X,[FONT_20]
        CMP   A,$A0
        JRC   text_put1
        MV    X,[FONT_A0]
        SUB   (text_char),$80
text_put1:
        SUB   (text_char),$20
        MV    IL,(text_char)    ; 1 文字 6 バイト
        MV    BA,I
        ADD   BA,BA
        ADD   BA,I
        ADD   BA,BA
        ADD   X,BA
        MV    Y,screen
        MV    IL,(text_x)
        ADD   Y,IL
        MV    IL,240
        MV    A,(text_row)
text_put2:
        CMP   A,0
        JRZ   text_put3
        ADD   Y,IL
        DEC   A
        JR    text_put2
text_put3:
        MV    I,6
        MVL   (screen_buffer),[X++]
        MV    I,6
        MVL   [Y++],(screen_buffer)
        POPU  X
        ADD   (text_x),6
        RET

; I の数（0〜65535）を右詰め 5 桁で描く。
number_draw:
        MV    (text_value),I
        MV    (text_seen),0
        MV    X,number_powers
number_1:
        MV    (text_digit),0
        MV    I,[X++]
number_2:
        MV    BA,(text_value)
        SUB   BA,I
        JRC   number_3
        MV    (text_value),BA
        INC   (text_digit)
        JR    number_2
number_3:
        CMP   (text_digit),0
        JRNZ  number_4
        CMP   (text_seen),0
        JRNZ  number_4
        MV    A,[X]             ; 1 の位は 0 でも書く
        CMP   A,0
        JRZ   number_4
        MV    A,' '
        JR    number_5
number_4:
        MV    (text_seen),1
        MV    A,(text_digit)
        ADD   A,'0'
number_5:
        CALL  text_put
        MV    A,[X]
        CMP   A,0
        JRNZ  number_1
        RET
number_powers:
        DW    10000,1000,100,10,1
        DB    0
