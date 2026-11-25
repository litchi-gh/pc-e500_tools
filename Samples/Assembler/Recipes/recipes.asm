; 逆引きレシピのルーチン集（docs/manual/20_RECIPES.md）
; どれも CALL で呼び、RET で戻る。内部 RAM の 20h〜2Fh と 60h〜9Fh を使う。
        ORG   $BE000
        INCLUDE "iocs.inc"
        INCLUDE "hardware.inc"

start:  JP    demo

;@mem_fill
; X から I バイトを A で埋める。
mem_fill:
        MV    [X++],A
        DEC   I
        JRNZ  mem_fill
        RET

;@mem_copy
; X から Y へ I バイトコピーする（アドレスの小さい方から）。
mem_copy:
        MV    A,[X++]
        MV    [Y++],A
        DEC   I
        JRNZ  mem_copy
        RET

;@fast_copy
; X から Y へ 64 バイトのかたまりを A 個コピーする（内部 RAM の 60h〜9Fh を通す）。
fast_copy:
        MV    ($20),A
fast_1: MV    I,64
        MVL   ($60),[X++]
        MV    I,64
        MVL   [Y++],($60)
        DEC   ($20)
        JRNZ  fast_1
        RET

;@mem_comp
; X と Y の I バイトを比べる。同じなら Z = 1。
mem_comp:
        MV    A,[X++]
        MV    ($20),A
        MV    A,[Y++]
        CMP   ($20),A
        JRNZ  comp_1
        DEC   I
        JRNZ  mem_comp          ; 0 になったとき Z = 1
comp_1: RET

;@cmp16
; BA と I を比べる。BA < I なら C = 1、同じなら Z = 1。
cmp16:  MV    ($20),BA
        CMPW  ($20),I
        RET

;@mul8
; BA = A × IL。
mul8:   MV    ($20),A           ; かけられる数（16 ビット）
        MV    ($21),0
        MV    ($22),IL          ; かける数
        MV    BA,0
        MV    ($23),8           ; 8 ビットぶん
mul_1:  RC
        SHR   ($22)             ; かける数の一番下のビットを C へ
        JRNC  mul_2
        MV    I,($20)
        ADD   BA,I
mul_2:  MV    I,($20)           ; かけられる数を 2 倍
        ADD   I,I
        MV    ($20),I
        DEC   ($23)
        JRNZ  mul_1
        RET

;@div16
; BA ÷ I（1〜32767）。商 = BA、余り = I。
div16:  MV    ($20),BA          ; 割られる数。商に変わっていく
        MV    ($22),I           ; 割る数
        MVW   ($25),0           ; 余り
        MV    ($24),16
div_1:  RC                      ; 余り ← 割られる数を、1 ビット左へ
        SHL   ($20)
        SHL   ($21)
        SHL   ($25)
        SHL   ($26)
        MV    BA,($25)
        MV    I,($22)
        SUB   BA,I
        JRC   div_2             ; 引けない
        MV    ($25),BA
        OR    ($20),1           ; 商のビット
div_2:  DEC   ($24)
        JRNZ  div_1
        MV    BA,($20)
        MV    I,($25)
        RET

;@abs8
; A（符号付き）の絶対値。
abs8:   TEST  A,$80
        JRZ   abs_1
        XOR   A,$FF
        INC   A
abs_1:  RET

;@scmp8
; A と IL を符号付きで比べる。A < IL なら C = 1、同じなら Z = 1。
scmp8:  MV    ($20),IL
        XOR   ($20),$80         ; 符号を反転すると、符号なしの順になる
        XOR   A,$80
        MV    ($21),A
        CMP   ($21),($20)
        RET

;@to_dec
; I（0〜65535）を 5 桁の文字にして X から書く。
to_dec: MV    Y,powers
        MV    ($20),I
        MV    ($22),5
dec_1:  MV    ($23),'0'
        MV    I,[Y++]
dec_2:  MV    BA,($20)
        SUB   BA,I
        JRC   dec_3
        MV    ($20),BA
        INC   ($23)
        JR    dec_2
dec_3:  MV    A,($23)
        MV    [X++],A
        DEC   ($22)
        JRNZ  dec_1
        RET
powers: DW    10000,1000,100,10,1

;@to_hex
; A を 2 桁の 16 進の文字にして X から書く。
to_hex: MV    ($20),A
        SWAP  A                 ; 上の桁から
        CALL  hex_1
        MV    A,($20)
hex_1:  AND   A,$0F
        CMP   A,10
        JRC   hex_2
        ADD   A,7               ; '9' の次から 'A' まで
hex_2:  ADD   A,'0'
        MV    [X++],A
        RET

;@to_num
; X の 10 進の文字を数にして BA に返す（数字でない文字で終わる）。
to_num: MVW   ($20),0
num_1:  MV    A,[X++]
        SUB   A,'0'
        JRC   num_2
        CMP   A,10
        JRNC  num_2
        MV    ($22),A
        MV    ($23),0
        MV    BA,($20)          ; 10 倍 = 8 倍 + 2 倍
        ADD   BA,BA
        MV    I,BA
        ADD   BA,BA
        ADD   BA,BA
        ADD   BA,I
        MV    I,($22)
        ADD   BA,I
        MV    ($20),BA
        JR    num_1
num_2:  MV    BA,($20)
        RET

;@str_len
; X の文字列（0 で終わる）の長さを I に返す。
str_len:
        MV    I,0
len_1:  MV    A,[X++]
        CMP   A,0
        JRZ   len_2
        INC   I
        JR    len_1
len_2:  RET

;@str_comp
; X と Y の文字列を比べる。同じなら Z = 1、X が前なら C = 1。
str_comp:
        MV    A,[X++]
        MV    ($20),A
        MV    A,[Y++]
        CMP   ($20),A
        JRNZ  scmp_1
        CMP   A,0               ; 両方とも終わり
        JRNZ  str_comp
scmp_1: RET

;@bit_rev
; A のビットの並びを逆にする。
bit_rev:
        MV    ($20),A
        MV    IL,8
rev_1:  SHR   ($20)             ; 一番下のビットを C へ
        SHL   A                 ; C を一番下に入れる
        DEC   IL
        JRNZ  rev_1
        RET

;@bit_count
; A の 1 のビットの数を A に返す。
bit_count:
        MV    ($20),A
        MV    ($21),0
        MV    IL,8
cnt_1:  RC
        SHR   ($20)
        JRNC  cnt_2
        INC   ($21)
cnt_2:  DEC   IL
        JRNZ  cnt_1
        MV    A,($21)
        RET

;@checksum
; X から I バイトの和（16 ビット）を BA に返す。
checksum:
        MVW   ($20),0
sum_1:  MV    A,[X++]
        ADD   ($20),A
        ADC   ($21),0
        DEC   I
        JRNZ  sum_1
        MV    BA,($20)
        RET

;@sort8
; X から A 個のバイトを小さい順に並べ替える。
sort8:  MV    ($20),A
        MV    ($24),X           ; 先頭を覚えておく
sort_1: DEC   ($20)
        JRZ   sort_4            ; 残り 1 個
        MV    ($21),0           ; 入れ替えたか
        MV    X,($24)
        MV    IL,($20)
sort_2: MV    A,[X]
        MV    ($22),A
        MV    A,[X+1]
        CMP   ($22),A
        JRC   sort_3            ; 順番どおり
        JRZ   sort_3
        MV    [X],A
        MV    A,($22)
        MV    [X+1],A
        MV    ($21),1
sort_3: INC   X
        DEC   IL
        JRNZ  sort_2
        CMP   ($21),0
        JRNZ  sort_1
sort_4: RET

;@dispatch
; A（0〜2）番目のルーチンへ飛ぶ。
dispatch:
        MV    X,jumps
        ADD   X,A               ; 1 つ 3 バイト
        ADD   X,A
        ADD   X,A
        MV    X,[X]
        JP    X
jumps:  DP    case_0,case_1,case_2
case_0: MV    A,10
        RET
case_1: MV    A,20
        RET
case_2: MV    A,30
        RET

;@wait_ms
; 約 A ミリ秒待つ（1〜255）。
wait_ms:
        MV    I,760             ; 1 サイクルは約 1.3 マイクロ秒
        WAIT
        DEC   A
        JRNZ  wait_ms
        RET

;@beep
; 4 kHz を約 A ミリ秒鳴らす。
beep:   AND   (SCR),BZ_OFF
        OR    (SCR),BZ_4K
        CALL  wait_ms
        AND   (SCR),BZ_OFF
        RET

;@print
; X の文字列（0 で終わる）を (BL) 桁、(BH) 行に表示する。
print:  PUSHU X
        CALL  str_len
        MV    Y,I
        POPU  X
        MVW   (CX),DEV_SCRN
        MV    IL,SCRN_PUTS
        CALLF IOCS
        RET

;@print_num
; I の数を (BL) 桁、(BH) 行に表示する。
print_num:
        MV    X,number
        CALL  to_dec
        MV    X,number
        JP    print
number: DB    "00000",0

;@yes_no
; Y か N が押されるまで待つ。Y なら Z = 1。
yes_no: MVW   (CX),DEV_KYBD
        MV    A,$80             ; 押されるまで待つ
        MV    IL,KYBD_READ
        CALLF IOCS
        CMP   A,'Y'
        JRZ   yes_1
        CMP   A,'N'
        JRNZ  yes_no
        CMP   A,'Y'             ; N: Z = 0
yes_1:  RET

;@demo
; レシピをまとめて呼ぶ（BASIC から CALL &HBE000）。
demo:   MV    A,12
        MV    IL,34
        CALL  mul8
        MV    I,BA
        MV    (BL),0
        MV    (BH),1
        CALL  print_num
        MV    A,20
        CALL  beep
        RC
        RETF

;@end
text1:  DB    "PC-E500",0
text2:  DB    "PC-E650",0
text3:  DB    "PC-E500",0
digits: DB    "1234X"
list:   DB    5,3,9,1,7
buffer: DS    256
        END
