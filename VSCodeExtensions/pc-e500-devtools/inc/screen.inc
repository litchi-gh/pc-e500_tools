; screen.inc: 仮想画面に描いて、まとめて LCD に送る（hardware.inc が要る）
;
; screen は 240 × 32 ドットの仮想画面（960 バイト）。x 桁 r 行（1 行 = 縦 8 ドット）の
; バイトは screen + r*240 + x、ビット 0 が上。LCD の 4 つの区画を気にせずに描ける。
;
;           MV    X,picture         ; .lcd の絵を仮想画面へ
;           CALL  screen_load
;           CALL  screen_keep       ; 背景として覚える
;   loop:   CALL  screen_restore    ; 背景に戻す
;           （キャラクタを描く）
;           CALL  screen_show       ; LCD へ
;
; 変わった所だけを送るなら screen_part（screen_part.inc。この中で INCLUDE している）。

screen_n        EQU $3C         ; 作業用
screen_buffer   EQU $60         ; 作業用（60h〜BFh）

; 仮想画面を消す。
screen_clear:
        MV    X,screen
        MV    I,960
        MV    A,0
screen_clear1:
        MV    [X++],A
        DEC   I
        JRNZ  screen_clear1
        RET

; .lcd の絵（X = 先頭アドレス、1024 バイト）を仮想画面に入れる。
screen_load:
        MV    Y,screen
        MV    (screen_n),4
screen_load1:
        PUSHU X
        MV    I,512             ; 左の 64 桁: コントローラ B
        ADD   X,I
        MV    I,64
        MVL   (screen_buffer),[X++]
        MV    I,64
        MVL   [Y++],(screen_buffer)
        POPU  X
        PUSHU X
        MV    I,56              ; 続く 56 桁: コントローラ A
        MVL   (screen_buffer),[X++]
        MV    I,56
        MVL   [Y++],(screen_buffer)
        POPU  X
        PUSHU X
        MV    I,256+56          ; 右半分は桁が逆
        ADD   X,I
        MV    IL,56
screen_load2:
        MV    A,[--X]
        MV    [Y++],A
        DEC   IL
        JRNZ  screen_load2
        POPU  X
        PUSHU X
        MV    I,512+256+64
        ADD   X,I
        MV    IL,64
screen_load3:
        MV    A,[--X]
        MV    [Y++],A
        DEC   IL
        JRNZ  screen_load3
        POPU  X
        MV    IL,64
        ADD   X,IL
        DEC   (screen_n)
        JRNZ  screen_load1
        RET

; 仮想画面を背景として覚える。
screen_keep:
        MV    X,screen
        MV    Y,screen_back
        JR    screen_copy
; 仮想画面を背景に戻す。
screen_restore:
        MV    X,screen_back
        MV    Y,screen
screen_copy:
        MV    (screen_n),10
screen_copy1:
        MV    I,96
        MVL   (screen_buffer),[X++]
        MV    I,96
        MVL   [Y++],(screen_buffer)
        DEC   (screen_n)
        JRNZ  screen_copy1
        RET

; 仮想画面を LCD に送る。
screen_show:
        MV    X,screen
        MV    (screen_n),LCD_PAGE
screen_show1:
        MV    A,(screen_n)      ; x = 0〜63
        CALL  screen_set_b
        MV    IL,64
screen_show2:
        MV    A,[X++]
        MV    [LCD_B_WRITE],A
        DEC   IL
        JRNZ  screen_show2
        MV    A,(screen_n)      ; x = 64〜119
        CALL  screen_set_a
        MV    IL,56
screen_show3:
        MV    A,[X++]
        MV    [LCD_A_WRITE],A
        DEC   IL
        JRNZ  screen_show3
        MV    IL,56             ; x = 175〜120
        ADD   X,IL
        MV    A,(screen_n)
        ADD   A,4
        CALL  screen_set_a
        MV    IL,56
screen_show4:
        MV    A,[--X]
        MV    [LCD_A_WRITE],A
        DEC   IL
        JRNZ  screen_show4
        MV    IL,120            ; x = 239〜176
        ADD   X,IL
        MV    A,(screen_n)
        ADD   A,4
        CALL  screen_set_b
        MV    IL,64
screen_show5:
        MV    A,[--X]
        MV    [LCD_B_WRITE],A
        DEC   IL
        JRNZ  screen_show5
        MV    IL,64             ; 次の行へ
        ADD   X,IL
        INC   (screen_n)
        CMP   (screen_n),LCD_PAGE+4
        JRNZ  screen_show1
        RET

; コントローラの書く場所: ページ A、桁 0
screen_set_a:
        PUSHU A
screen_set_a1:
        MV    A,[LCD_A_STATUS]
        TEST  A,LCD_BUSY
        JRNZ  screen_set_a1
        POPU  A
        MV    [LCD_A],A
screen_set_a2:
        MV    A,[LCD_A_STATUS]
        TEST  A,LCD_BUSY
        JRNZ  screen_set_a2
        MV    A,LCD_COLUMN
        MV    [LCD_A],A
screen_set_a3:
        MV    A,[LCD_A_STATUS]
        TEST  A,LCD_BUSY
        JRNZ  screen_set_a3
        RET
screen_set_b:
        PUSHU A
screen_set_b1:
        MV    A,[LCD_B_STATUS]
        TEST  A,LCD_BUSY
        JRNZ  screen_set_b1
        POPU  A
        MV    [LCD_B],A
screen_set_b2:
        MV    A,[LCD_B_STATUS]
        TEST  A,LCD_BUSY
        JRNZ  screen_set_b2
        MV    A,LCD_COLUMN
        MV    [LCD_B],A
screen_set_b3:
        MV    A,[LCD_B_STATUS]
        TEST  A,LCD_BUSY
        JRNZ  screen_set_b3
        RET

screen:         DS 960
screen_back:    DS 960

        INCLUDE "screen_part.inc"
