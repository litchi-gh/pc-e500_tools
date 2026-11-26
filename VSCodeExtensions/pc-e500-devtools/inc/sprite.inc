; sprite.inc: キャラクタ（.spr）を仮想画面に描く、当たり判定（screen.inc が要る）
;
;           MVW   (sprite_x),100    ; 画面の外（負の値も）にはみ出してよい
;           MV    (sprite_y),8
;           MV    X,player          ; player: INCBIN "player.spr"
;           MV    A,0               ; コマの番号
;           CALL  sprite_draw
;
; .spr の中身: 幅、高さ/8、コマ数、1（マスクあり）の 4 バイト、続けて 1 コマずつ。
; 1 コマは縦 8 ドットの行ごとに、左から「マスク、絵」の 2 バイトが幅の数だけ並ぶ
; （マスクのビットが 1 の所だけ描く）。

sprite_x        EQU $24         ; x 座標（符号付き 2 バイト、-255〜）
sprite_y        EQU $26         ; y 座標（符号付き 1 バイト、-64〜）
hit_ax          EQU $40         ; box_hit の四角 A: x、y（0〜255。画面の左や上にはみ出すものは、0 に切って渡す）、幅、高さ
hit_ay          EQU $41
hit_aw          EQU $42
hit_ah          EQU $43
hit_bx          EQU $44         ; 四角 B
hit_by          EQU $45
hit_bw          EQU $46
hit_bh          EQU $47

; 作業用
sprite_w        EQU $28         ; 幅
sprite_rows     EQU $29         ; 残りの行
sprite_flags    EQU $2A         ; ビット 0 = マスクあり
sprite_bytes    EQU $2B         ; 1 行のバイト数
sprite_frame    EQU $2C
sprite_skip     EQU $2D         ; 左にはみ出した桁
sprite_dx       EQU $2E         ; 描き始める桁
sprite_n        EQU $2F         ; 描く桁の数
sprite_mode     EQU $30         ; 1 = 上の行に描く、2 = 下の行にも描く
sprite_left     EQU $31
sprite_mask     EQU $32         ; 2 バイト
sprite_bits     EQU $34         ; 2 バイト
sprite_shift    EQU $36         ; 3 バイト: ずらす処理のエントリ
sprite_page     EQU $39         ; 画面の行 + 8

; X のキャラクタの A 番目のコマを (sprite_x)、(sprite_y) に描く。
; A、B、I、X、Y が変わる。
sprite_draw:
        MV    (sprite_frame),A
        MV    A,[X++]
        MV    (sprite_w),A
        MV    A,[X++]
        MV    (sprite_rows),A
        MV    A,[X++]           ; コマ数は使わない
        MV    A,[X++]
        MV    (sprite_flags),A
        MV    A,(sprite_w)
        TEST  (sprite_flags),1
        JRZ   sprite_1
        ADD   A,A
sprite_1:
        MV    (sprite_bytes),A
sprite_2:                       ; コマの先頭へ
        CMP   (sprite_frame),0
        JRZ   sprite_4
        MV    IL,(sprite_bytes)
        MV    A,(sprite_rows)
sprite_3:
        ADD   X,IL
        DEC   A
        JRNZ  sprite_3
        DEC   (sprite_frame)
        JR    sprite_2

sprite_4:                       ; 横にはみ出す分を切る
        MV    A,(sprite_x+1)
        CMP   A,0
        JRZ   sprite_5
        CMP   A,$FF
        JPNZ  sprite_end
        MV    A,0               ; 左: x が負
        SUB   A,(sprite_x)
        JPZ   sprite_end
        CMP   (sprite_w),A
        JPC   sprite_end
        JPZ   sprite_end
        MV    (sprite_skip),A
        MV    (sprite_dx),0
        MV    A,(sprite_w)
        SUB   A,(sprite_skip)
        MV    (sprite_n),A
        JR    sprite_7
sprite_5:
        MV    A,(sprite_x)
        CMP   A,240
        JPNC  sprite_end
        MV    (sprite_dx),A
        MV    (sprite_skip),0
        MV    A,(sprite_w)
        MV    (sprite_n),A
        ADD   A,(sprite_dx)     ; 右
        JRC   sprite_6
        CMP   A,241
        JRC   sprite_7
sprite_6:
        MV    A,240
        SUB   A,(sprite_dx)
        MV    (sprite_n),A

sprite_7:                       ; 縦: 行と、その中でずらすドット数
        MV    A,(sprite_y)
        AND   A,7
        MV    (sprite_mode),A
        MV    A,7
        SUB   A,(sprite_mode)
        ADD   A,A               ; ADD BA,BA は 2 バイト
        MV    Y,sprite_shift7
        ADD   Y,A
        MV    (sprite_shift),Y
        MV    A,(sprite_y)
        ADD   A,64
        RC
        SHR   A
        RC
        SHR   A
        RC
        SHR   A
        MV    (sprite_page),A
        MVW   (sprite_mask),0

sprite_row:                     ; 縦 8 ドットの行ごとに
        MV    (sprite_mode),0
        CMP   (sprite_page),8
        JRC   sprite_r1
        CMP   (sprite_page),12
        JPNC  sprite_next
        MV    (sprite_mode),1
sprite_r1:
        CMP   (sprite_page),7
        JPC   sprite_next
        CMP   (sprite_page),11
        JRNC  sprite_r2
        OR    (sprite_mode),2
sprite_r2:
        MV    Y,screen-240      ; 描く先（1 行上から数える）
        MV    IL,(sprite_dx)
        ADD   Y,IL
        MV    IL,240
        MV    A,(sprite_page)
        SUB   A,7
sprite_r3:
        CMP   A,0
        JRZ   sprite_r4
        ADD   Y,IL
        DEC   A
        JR    sprite_r3
sprite_r4:
        PUSHU X
        MV    IL,(sprite_skip)
        ADD   X,IL
        TEST  (sprite_flags),1
        JRZ   sprite_r5
        ADD   X,IL
sprite_r5:
        MV    (sprite_left),(sprite_n)
sprite_column:
        TEST  (sprite_flags),1
        JRZ   sprite_c1
        MV    IL,[X++]
        MV    BA,I
        CALL  sprite_do_shift
        MV    (sprite_mask),BA
sprite_c1:
        MV    IL,[X++]
        MV    BA,I
        CALL  sprite_do_shift
        MV    (sprite_bits),BA
        TEST  (sprite_mode),1
        JRZ   sprite_c2
        MV    A,[Y]
        OR    A,(sprite_mask)   ; OR と XOR でマスクの所を消す
        XOR   A,(sprite_mask)
        OR    A,(sprite_bits)
        MV    [Y],A
sprite_c2:
        TEST  (sprite_mode),2
        JRZ   sprite_c3
        MV    A,[Y+240]
        OR    A,(sprite_mask+1)
        XOR   A,(sprite_mask+1)
        OR    A,(sprite_bits+1)
        MV    [Y+240],A
sprite_c3:
        INC   Y
        DEC   (sprite_left)
        JRNZ  sprite_column
        POPU  X
sprite_next:
        MV    IL,(sprite_bytes)
        ADD   X,IL
        INC   (sprite_page)
        DEC   (sprite_rows)
        JPNZ  sprite_row
sprite_end:
        RET

; BA を縦位置のぶんずらす。
sprite_do_shift:
        JP    (sprite_shift)
sprite_shift7:
        ADD   BA,BA
        ADD   BA,BA
        ADD   BA,BA
        ADD   BA,BA
        ADD   BA,BA
        ADD   BA,BA
        ADD   BA,BA
        RET

; 四角 A（hit_ax、hit_ay、hit_aw、hit_ah）と四角 B が重なっていれば C=1。
box_hit:
        MV    A,(hit_bx)
        SUB   A,(hit_ax)
        JRC   box_hit1
        CMP   (hit_aw),A
        JR    box_hit2
box_hit1:
        MV    A,(hit_ax)
        SUB   A,(hit_bx)
        CMP   (hit_bw),A
box_hit2:
        JRC   box_hit_no
        JRZ   box_hit_no
        MV    A,(hit_by)
        SUB   A,(hit_ay)
        JRC   box_hit3
        CMP   (hit_ah),A
        JR    box_hit4
box_hit3:
        MV    A,(hit_ay)
        SUB   A,(hit_by)
        CMP   (hit_bh),A
box_hit4:
        JRC   box_hit_no
        JRZ   box_hit_no
        SC
        RET
box_hit_no:
        RC
        RET
