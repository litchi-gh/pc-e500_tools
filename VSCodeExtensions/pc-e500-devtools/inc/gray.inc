; gray.inc: 4 階調（白、薄い灰色、濃い灰色、黒）で描く（hardware.inc が要る）
;
; 3 枚の画面を順に LCD に送り、点を 3 枚のうち濃さの枚数だけ点けて、灰色に見せる。
; 点ごとに点く順番を (x + y) mod 3 でずらすので、画面全体が一斉に明滅しない。
; game_start の後（割り込みを止めた後）に使う。
;
;           CALL  gray_clear        ; 3 枚の画面を白に
;           MV    X,pic_hi          ; 2 枚の .lcd の絵を読む
;           MV    Y,pic_lo
;           CALL  gray_load
;   loop:   （キーを読む、gray_pset、gray_sprite で描く）
;           CALL  gray_show         ; 3 枚のうち次の 1 枚を LCD へ
;           JP    loop
;
; 濃さは 0（白）〜3（黒）。絵やキャラクタでは「濃さのビット 1」と「濃さのビット 0」の
; 2 つの面に分けて持つ（濃さ 2 = ビット 1 だけ、濃さ 1 = ビット 0 だけ）。
; gray_show の間を 1〜2 ms（770〜1540 サイクル）あけると、ちらつきが少ない（PC-E650 の実機）。
; 送るのは 1 回 約 14,000 サイクル（18 ms）。描くのも遅い（点 1 つ 約 550 サイクル）ので、
; 動かすものは小さくするか、白黒の所に描く。

gray_x          EQU $50         ; x 座標（0〜239）
gray_row        EQU $51         ; 行（0〜3、1 行 = 縦 8 ドット）
gray_y          EQU $52         ; y 座標（0〜31）。gray_pset が使う
gray_frame      EQU $53         ; 次に送る画面（0〜2）
gray_m          EQU $54         ; 作業用: 描くビット
gray_hi         EQU $55         ; 作業用: 濃さのビット 1 の面
gray_lo         EQU $56         ; 作業用: 濃さのビット 0 の面
gray_c          EQU $57         ; 作業用: 位相（(x + 8 × 行) mod 3）
gray_t          EQU $58         ; 作業用
gray_n          EQU $59         ; 作業用
gray_ge1        EQU $5A         ; 作業用
gray_ge2        EQU $5B         ; 作業用
gray_ge3        EQU $5C         ; 作業用
gray_nm         EQU $5D         ; 作業用
gray_w          EQU $5E         ; 作業用
gray_k          EQU $5F         ; 作業用

; LCD（0A000h 台は CPU が遅くしない窓）
GRAY_LCD_ALL    EQU $0A000      ; 両方のコントローラへの命令
GRAY_LCD_B_ST   EQU $0A005      ; 両端のコントローラの状態
GRAY_LCD_B_DAT  EQU $0A006      ; 両端のコントローラのデータ
GRAY_LCD_A_ST   EQU $0A009      ; 中央のコントローラの状態
GRAY_LCD_A_DAT  EQU $0A00A      ; 中央のコントローラのデータ

; 3 枚の画面を白にし、次に送る画面を 1 枚目にする。
gray_clear:
        MV    X,gray_frames
        MV    I,2880
        MV    A,0
gray_clear1:
        MV    [X++],A
        DEC   I
        JRNZ  gray_clear1
        MV    (gray_frame),0
        RET

; 1 点を描く。(gray_x) = x（0〜239）、(gray_y) = y（0〜31）、A = 濃さ（0〜3）。
; (gray_row) が変わる。約 550 サイクル。
gray_pset:
        MV    (gray_hi),0
        MV    (gray_lo),0
        TEST  A,2
        JRZ   gray_pset1
        MV    (gray_hi),$FF
gray_pset1:
        TEST  A,1
        JRZ   gray_pset2
        MV    (gray_lo),$FF
gray_pset2:
        MV    A,(gray_y)
        AND   A,7
        MV    Y,gray_bits
        ADD   Y,A
        MV    A,[Y]
        MV    (gray_m),A
        MV    A,(gray_y)
        SHR   A
        SHR   A
        SHR   A
        AND   A,3
        MV    (gray_row),A
        CALL  gray_at
        JP    gray_put

; 4 階調のキャラクタを描く。X = データ、A = コマの番号、(gray_x) = 左端の x（0〜239）、
; (gray_row) = 上の行（0〜3）。縦は行（8 ドット）単位。画面の右と下にはみ出す所は描かない。
; データ: 幅（1〜240）、行数（1〜4）、コマ数、0 の 4 バイト、続けて 1 コマずつ。
; 1 コマは行ごとに、左の桁から「描くビット、濃さのビット 1、濃さのビット 0」の 3 バイト
; （ビット 0 が上。描くビットが 0 の所は前の絵が残る）。1 桁 約 490 サイクル（16 × 16 ドットで 20 ms）。
gray_sprite:
        MV    [gray_sp],X
        MV    (gray_k),A
        MV    A,[X]
        MV    [gray_sw],A
        MV    A,[X+1]
        MV    [gray_sr],A
        MV    I,0               ; 1 コマのバイト数 = 幅 × 行数 × 3
        MV    (gray_n),A
gray_sprite1:
        MV    A,[gray_sw]
        ADD   I,A
        ADD   I,A
        ADD   I,A
        DEC   (gray_n)
        JRNZ  gray_sprite1
        MV    X,[gray_sp]
        MV    A,4
        ADD   X,A
gray_sprite2:
        CMP   (gray_k),0
        JRZ   gray_sprite3
        ADD   X,I
        DEC   (gray_k)
        JR    gray_sprite2
gray_sprite3:
        MV    [gray_sp],X
        MV    A,(gray_x)
        MV    [gray_sx],A
        MV    A,(gray_row)
        MV    [gray_sy],A
        MV    A,[gray_sr]
        MV    (gray_k),A
gray_sprite4:
        CMP   (gray_row),4
        JRNC  gray_sprite9
        MV    A,[gray_sx]
        MV    (gray_x),A
        MV    A,[gray_sw]
        MV    (gray_w),A
        CALL  gray_at           ; 行の左端の場所と位相。あとは 1 桁ずつ進める
        MV    [gray_fp],X
gray_sprite5:
        MV    X,[gray_sp]
        CMP   (gray_x),240
        JRNC  gray_sprite6
        MV    A,[X++]
        MV    (gray_m),A
        MV    A,[X++]
        MV    (gray_hi),A
        MV    A,[X++]
        MV    (gray_lo),A
        MV    [gray_sp],X
        MV    X,[gray_fp]
        CALL  gray_put
        INC   X
        MV    [gray_fp],X
        INC   (gray_x)
        CALL  gray_next_c
        JR    gray_sprite7
gray_sprite6:
        MV    A,3               ; 右にはみ出した桁は飛ばす
        ADD   X,A
        MV    [gray_sp],X
gray_sprite7:
        DEC   (gray_w)
        JRNZ  gray_sprite5
        INC   (gray_row)
        DEC   (gray_k)
        JRNZ  gray_sprite4
gray_sprite9:
        MV    A,[gray_sx]
        MV    (gray_x),A
        MV    A,[gray_sy]
        MV    (gray_row),A
        RET

; 2 枚の .lcd の絵（1024 バイトずつ）から 3 枚の画面を作る。X = 濃さのビット 1 の面、
; Y = 濃さのビット 0 の面。約 0.7 秒。(gray_x) と (gray_row) が変わる。
gray_load:
        MV    [gray_sp],X
        MV    [gray_lp],Y
        MV    (gray_m),$FF
        MV    (gray_row),0
gray_load1:
        MV    (gray_x),0
        CALL  gray_at
        MV    [gray_fp],X
gray_load2:
        CALL  gray_lcd_at       ; I = .lcd の中の場所
        MV    X,[gray_sp]
        ADD   X,I
        MV    A,[X]
        MV    (gray_hi),A
        MV    X,[gray_lp]
        ADD   X,I
        MV    A,[X]
        MV    (gray_lo),A
        MV    X,[gray_fp]
        CALL  gray_put
        INC   X
        MV    [gray_fp],X
        CALL  gray_next_c
        INC   (gray_x)
        CMP   (gray_x),240
        JRNZ  gray_load2
        INC   (gray_row)
        CMP   (gray_row),4
        JRNZ  gray_load1
        RET

; 3 枚のうち次の 1 枚を LCD へ送る。約 14,000 サイクル（18 ms）。
gray_show:
        MV    A,$0F
; 3 枚のうち次の 1 枚の、A のビットが 1 の行（ビット 0 = 行 0 … ビット 3 = 行 3）だけを送る。
; 1 行 約 3,600 サイクル。灰色の所が一部の行だけなら、ほかの行を送らずに速くできる。
gray_show_rows:
        MV    (gray_w),A
        MV    X,gray_frames
        MV    A,(gray_frame)
        MV    (gray_n),A
gray_show1:
        CMP   (gray_n),0
        JRZ   gray_show2
        MV    I,960
        ADD   X,I
        DEC   (gray_n)
        JR    gray_show1
gray_show2:
        MV    [gray_base],X
        MV    (gray_k),0
gray_show3:
        TEST  (gray_w),1
        JPZ   gray_show8
        MV    A,(gray_k)        ; 左半分: ページ = 行
        ADD   A,LCD_PAGE
        CALL  gray_page
        MV    A,(gray_k)
        ADD   A,A
        MV    Y,gray_row_at
        ADD   Y,A
        MV    I,[Y]
        MV    X,[gray_base]
        ADD   X,I
        MV    Y,X               ; Y = x 0 から（両端のコントローラ）
        MV    A,64
        ADD   X,A               ; X = x 64 から（中央のコントローラ）
        MV    IL,56             ; 交互に書く。どちらのコントローラにも 24 サイクルおき
gray_show4:
        MV    A,[X++]           ; 4
        MV    [GRAY_LCD_A_DAT],A ; 5
        MV    A,[Y++]           ; 4
        MV    [GRAY_LCD_B_DAT],A ; 5
        DEC   IL                ; 3
        JRNZ  gray_show4        ; 3
        MV    IL,8              ; 両端の x 56〜63。17 サイクルおき
gray_show5:
        MV    A,[Y++]
        NOP
        NOP
        MV    [GRAY_LCD_B_DAT],A
        DEC   IL
        JRNZ  gray_show5
        MV    A,(gray_k)        ; 右半分: ページ = 行 + 4。桁は右から左
        ADD   A,LCD_PAGE+4
        CALL  gray_page
        MV    A,56
        ADD   X,A               ; X = x 176 の手前から（中央: 175〜120）
        MV    A,176
        ADD   Y,A               ; Y = x 240 の手前から（両端: 239〜176）
        MV    IL,56             ; 26 サイクルおき
gray_show6:
        MV    A,[--X]
        MV    [GRAY_LCD_A_DAT],A
        MV    A,[--Y]
        MV    [GRAY_LCD_B_DAT],A
        DEC   IL
        JRNZ  gray_show6
        MV    IL,8              ; 両端の x 183〜176。17 サイクルおき
gray_show7:
        MV    A,[--Y]
        NOP
        MV    [GRAY_LCD_B_DAT],A
        DEC   IL
        JRNZ  gray_show7
gray_show8:
        RC
        SHR   (gray_w)
        INC   (gray_k)
        CMP   (gray_k),4
        JPNZ  gray_show3
        INC   (gray_frame)
        CMP   (gray_frame),3
        JRNZ  gray_show9
        MV    (gray_frame),0
gray_show9:
        RET

; 両方のコントローラをページ A、桁 0 にする（中で使う）
gray_page:
        MV    (gray_t),A
        CALL  gray_busy
        MV    A,(gray_t)
        MV    [GRAY_LCD_ALL],A
        CALL  gray_busy
        MV    A,LCD_COLUMN
        MV    [GRAY_LCD_ALL],A
gray_busy:
        MV    A,[GRAY_LCD_A_ST]
        TEST  A,LCD_BUSY
        JRNZ  gray_busy
gray_busy1:
        MV    A,[GRAY_LCD_B_ST]
        TEST  A,LCD_BUSY
        JRNZ  gray_busy1
        RET

; X = 1 枚目の画面の (gray_x) 桁、(gray_row) 行のバイト、(gray_c) = 位相（中で使う）
gray_at:
        MV    A,(gray_row)
        ADD   A,A
        MV    Y,gray_row_at
        ADD   Y,A
        MV    I,[Y]
        MV    X,gray_frames
        ADD   X,I
        MV    I,0
        MV    A,(gray_x)
        ADD   I,A
        ADD   X,I
        MV    A,(gray_x)        ; (x + 8 × 行) mod 3 = (上位 4 ビット + 下位 4 ビット + 2 × 行) mod 3
        AND   A,$0F
        MV    (gray_t),A
        MV    A,(gray_x)
        SWAP  A
        AND   A,$0F
        ADD   A,(gray_t)
        ADD   A,(gray_row)
        ADD   A,(gray_row)
        MV    Y,gray_mod3
        ADD   Y,A
        MV    A,[Y]
        MV    (gray_c),A
        RET

; X の場所から 960 バイトおきに 3 枚の画面へ、(gray_m) のビットを濃さ (gray_hi)、(gray_lo) で描く
; （中で使う）。k 枚目の画面（k = 0〜2）で点くのは、(k − (x + y) mod 3) mod 3 が濃さより小さい点。
gray_put:
        MV    A,(gray_hi)
        OR    A,(gray_lo)
        AND   A,(gray_m)
        MV    (gray_ge1),A      ; 濃さ 1 以上
        MV    A,(gray_hi)
        AND   A,(gray_m)
        MV    (gray_ge2),A      ; 濃さ 2 以上
        MV    A,(gray_hi)
        AND   A,(gray_lo)
        AND   A,(gray_m)
        MV    (gray_ge3),A      ; 濃さ 3
        MV    A,(gray_m)
        XOR   A,$FF
        MV    (gray_nm),A
        MV    A,(gray_c)        ; Y = gray_slots + 位相 × 9
        MV    (gray_t),A
        ADD   A,A
        ADD   A,(gray_t)
        MV    (gray_t),A
        ADD   A,A
        ADD   A,(gray_t)
        MV    Y,gray_slots
        ADD   Y,A
        MV    (gray_n),3
gray_put1:
        MV    A,[Y++]
        AND   A,(gray_ge1)
        MV    (gray_t),A
        MV    A,[Y++]
        AND   A,(gray_ge2)
        OR    (gray_t),A
        MV    A,[Y++]
        AND   A,(gray_ge3)
        OR    A,(gray_t)
        MV    (gray_t),A
        MV    A,[X]
        AND   A,(gray_nm)
        OR    A,(gray_t)
        MV    [X],A
        MV    I,960
        ADD   X,I
        DEC   (gray_n)
        JRNZ  gray_put1
        MV    I,2880            ; X を戻す
        SUB   X,I
        RET

; 位相を次の桁のものにする（中で使う）
gray_next_c:
        INC   (gray_c)
        CMP   (gray_c),3
        JRNZ  gray_next_c1
        MV    (gray_c),0
gray_next_c1:
        RET

; I = .lcd の中で (gray_x) 桁、(gray_row) 行のバイトの場所（中で使う）
gray_lcd_at:
        MV    A,(gray_row)
        ADD   A,A
        ADD   A,A
        ADD   A,A
        ADD   A,A
        ADD   A,A
        ADD   A,A
        MV    (gray_t),A        ; 行 × 64
        MV    A,(gray_x)
        CMP   A,64
        JRNC  gray_lcd_at1
        ADD   A,(gray_t)        ; x 0〜63: 512 + 行 × 64 + x
        MV    I,512
        ADD   I,A
        RET
gray_lcd_at1:
        CMP   A,120
        JRNC  gray_lcd_at2
        SUB   A,64              ; x 64〜119: 行 × 64 + x − 64
        ADD   A,(gray_t)
        MV    I,0
        ADD   I,A
        RET
gray_lcd_at2:
        CMP   A,176
        JRNC  gray_lcd_at3
        MV    A,175             ; x 120〜175: 256 + 行 × 64 + 175 − x
        SUB   A,(gray_x)
        ADD   A,(gray_t)
        MV    I,256
        ADD   I,A
        RET
gray_lcd_at3:
        MV    A,239             ; x 176〜239: 768 + 行 × 64 + 239 − x
        SUB   A,(gray_x)
        ADD   A,(gray_t)
        MV    I,768
        ADD   I,A
        RET

; 位相 c、k 枚目の画面で、濃さ 1 以上、2 以上、3 で点くビット（c = 0〜2、k = 0〜2 の順）
gray_slots:
        DB    $49,$24,$92, $92,$49,$24, $24,$92,$49
        DB    $24,$92,$49, $49,$24,$92, $92,$49,$24
        DB    $92,$49,$24, $24,$92,$49, $49,$24,$92
gray_mod3:
        DB    0,1,2,0,1,2,0,1,2,0,1,2,0,1,2,0,1,2,0,1,2,0,1,2,0,1,2,0,1,2,0,1,2,0,1,2,0
gray_bits:
        DB    1,2,4,8,16,32,64,128
gray_row_at:
        DW    0,240,480,720

gray_sp:        DS 3
gray_lp:        DS 3
gray_base:      DS 3
gray_fp:        DS 3
gray_sx:        DS 1
gray_sy:        DS 1
gray_sw:        DS 1
gray_sr:        DS 1
; 3 枚の画面（960 バイトずつ。並びは screen.inc の screen と同じ）
gray_frames:    DS 2880
