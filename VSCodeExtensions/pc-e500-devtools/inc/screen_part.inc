; screen_part.inc: 仮想画面の四角い一部だけを LCD に送る（hardware.inc が要る）
;
; 仮想画面 screen（240 × 32 ドット、960 バイト、screen + r*240 + x、ビット 0 が上）の並びのまま
; 送る。screen.inc がこのファイルを INCLUDE している。仮想画面を自分で持つときは、
; screen という名前で 960 バイトを取り、このファイルだけを INCLUDE する。
;
;           MV    (screen_part_x),40     ; x = 40〜199 の行 1〜3 を送る
;           MV    (screen_part_w),160
;           MV    A,$0E                  ; 行 1〜3 のビット
;           CALL  screen_part

screen_part_lcd_b EQU $0A004    ; 両端のコントローラの命令（+1 状態、+2 データ）
screen_part_lcd_a EQU $0A008    ; 中央のコントローラ。0A000h 台は CPU が遅くしない窓（2000h 台と同じもの）
screen_part_x     EQU $3A       ; 左端の x
screen_part_w     EQU $3B       ; 幅
screen_part_rows  EQU $60       ; 作業用（60h〜69h。screen.inc の screen_buffer と同じ場所）
screen_part_x1    EQU $61
screen_part_lo    EQU $62
screen_part_hi    EQU $63
screen_part_a     EQU $64
screen_part_b     EQU $65
screen_part_o     EQU $66
screen_part_cmd   EQU $67
screen_part_page  EQU $68
screen_part_count EQU $69

; 仮想画面の四角い一部だけを LCD に送る。A = 送る行（ビット 0〜3 が行 0〜3）、
; (screen_part_x) = 左端の x（0〜239）、(screen_part_w) = 幅（1 以上、x + 幅は 240 まで）。
; A I X Y が変わる。
; 変わった所だけを送れば screen_show より速い。1 バイトに 14〜15 サイクルかける
; （実機の LCD は、14 サイクルより短い間隔で来たデータを取りこぼす）。
; x と幅が前に呼んだときと同じなら、区画の計算を省く（1 行ずつ呼んでも遅くならない）。
screen_part:
        AND   A,$0F
        JRZ   screen_part_end
        MV    (screen_part_rows),A
        MV    A,[screen_part_last]
        CMP   (screen_part_x),A
        JRNZ  screen_part0
        MV    A,[screen_part_last+1]
        CMP   (screen_part_w),A
        JRZ   screen_part1
screen_part0:
        CALL  screen_part_area
screen_part1:
        MV    X,screen
        MV    [screen_part_row],X
        MV    (screen_part_page),LCD_PAGE
screen_part2:
        TEST  (screen_part_rows),$01
        JRZ   screen_part3
        MV    Y,screen_part_lcd_b ; x = 0〜63: B、上半分
        MV    X,screen_part_tab
        CALL  screen_part_fwd
        MV    Y,screen_part_lcd_a ; x = 64〜119: A、上半分
        MV    X,screen_part_tab+3
        CALL  screen_part_fwd
        MV    Y,screen_part_lcd_a ; x = 175〜120: A、下半分（右から左）
        MV    X,screen_part_tab+6
        CALL  screen_part_rev
        MV    Y,screen_part_lcd_b ; x = 239〜176: B、下半分（右から左）
        MV    X,screen_part_tab+9
        CALL  screen_part_rev
screen_part3:
        RC
        SHR   (screen_part_rows)
        JRZ   screen_part_end
        MV    X,[screen_part_row]     ; 次の行へ
        MV    A,240
        ADD   X,A
        MV    [screen_part_row],X
        INC   (screen_part_page)
        JR    screen_part2

; 左から右の区画（X = 区画の表、Y = コントローラの命令のアドレス）
screen_part_fwd:
        CALL  screen_part_get
        JRZ   screen_part_end
        MV    A,(screen_part_page)
        CALL  screen_part_set
        MV    IL,(screen_part_count)
screen_part_fwd1:
        MV    A,[X++]
        MV    [Y],A
        DEC   IL
        JRNZ  screen_part_fwd1
screen_part_end:
        RET

; 右から左の区画（下半分のページ）
screen_part_rev:
        CALL  screen_part_get
        JRZ   screen_part_end
        MV    A,(screen_part_page)
        ADD   A,4
        CALL  screen_part_set
        MV    IL,(screen_part_count)
screen_part_rev1:
        MV    A,[--X]
        MV    [Y],A
        DEC   IL
        JRNZ  screen_part_rev1
        RET

; 区画の表（数、桁の命令、仮想画面の行の中の位置）を読み、X を仮想画面の位置にする。数が 0 なら Z = 1
screen_part_get:
        MV    A,[X++]
        CMP   A,0
        JRZ   screen_part_get1
        MV    (screen_part_count),A
        MV    A,[X++]
        MV    (screen_part_cmd),A
        MV    A,[X]
        MV    X,[screen_part_row]
        ADD   X,A               ; X は 0 にならないので Z = 0
screen_part_get1:
        RET

; ページ A、桁 (screen_part_cmd) にして、Y をデータのアドレスにする（BUSY を待つ）
screen_part_set:
        MV    (screen_part_o),A
screen_part_set1:
        MV    A,[Y+1]
        TEST  A,LCD_BUSY
        JRNZ  screen_part_set1
        MV    A,(screen_part_o)
        MV    [Y],A
screen_part_set2:
        MV    A,[Y+1]
        TEST  A,LCD_BUSY
        JRNZ  screen_part_set2
        MV    A,(screen_part_cmd)
        MV    [Y],A
screen_part_set3:
        MV    A,[Y+1]
        TEST  A,LCD_BUSY
        JRNZ  screen_part_set3
        INC   Y
        INC   Y
        RET

; x と幅から、4 つの区画の表を作る
screen_part_area:
        MV    A,(screen_part_x)
        MV    [screen_part_last],A
        ADD   A,(screen_part_w)
        DEC   A
        MV    (screen_part_x1),A
        MV    A,(screen_part_w)
        MV    [screen_part_last+1],A
        MV    X,screen_part_bounds
        MV    Y,screen_part_tab
screen_part_area1:
        MV    A,[X++]
        MV    (screen_part_lo),A
        MV    A,[X++]
        MV    (screen_part_hi),A
        CALL  screen_part_cut
        MV    [Y++],A
        CMP   (screen_part_lo),120
        JRC   screen_part_area2
        MV    A,(screen_part_hi) ; 右から左: 桁は hi − 右端、位置は右端 + 1
        SUB   A,(screen_part_b)
        ADD   A,LCD_COLUMN
        MV    [Y++],A
        MV    A,(screen_part_b)
        INC   A
        JR    screen_part_area3
screen_part_area2:
        MV    A,(screen_part_a) ; 左から右: 桁は左端 − lo、位置は左端
        SUB   A,(screen_part_lo)
        ADD   A,LCD_COLUMN
        MV    [Y++],A
        MV    A,(screen_part_a)
screen_part_area3:
        MV    [Y++],A
        CMP   (screen_part_lo),176
        JRNZ  screen_part_area1
        RET

; 送る所と区画（(screen_part_lo)〜(screen_part_hi)）の重なり: (screen_part_a) 左端、
; (screen_part_b) 右端、A = 数（重ならなければ 0）
screen_part_cut:
        MV    A,(screen_part_lo)
        CMP   (screen_part_x),(screen_part_lo)
        JRC   screen_part_cut1
        MV    A,(screen_part_x)
screen_part_cut1:
        MV    (screen_part_a),A
        MV    A,(screen_part_hi)
        CMP   (screen_part_x1),(screen_part_hi)
        JRNC  screen_part_cut2
        MV    A,(screen_part_x1)
screen_part_cut2:
        MV    (screen_part_b),A
        SUB   A,(screen_part_a)
        JRC   screen_part_cut3
        INC   A
        RET
screen_part_cut3:
        MV    A,0
        RET

screen_part_bounds: DB 0,63,64,119,120,175,176,239     ; 4 つの区画の x
screen_part_last:   DB 0,0      ; 表を作ったときの x と幅（幅 0 = まだ作っていない）
screen_part_tab:    DS 12       ; 区画ごとの数、桁の命令、位置
screen_part_row:    DS 3        ; 送る行の先頭
