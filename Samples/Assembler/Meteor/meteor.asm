; メテオ: 隕石を撃つゲーム
; ▲▼ で自機を動かし、SPACE で撃つ。隕石に 3 回当たると終わり。ON/BRK で BASIC へ戻る。
; 絵: meteor.lcd（背景）、ship.spr（自機、2 コマ）、rock.spr（隕石、4 コマ）、shot.spr（弾）。
        ORG   $BD800            ; 置くアドレス。BFBFF までに収める
        INCLUDE "hardware.inc"

; 変数（内部 RAM の 00h〜1Fh）
ship_y  EQU   $00               ; 自機の高さ
shot_x  EQU   $01               ; 弾の位置。0 なら撃っていない
shot_y  EQU   $02
count   EQU   $03               ; 毎ターン 1 増える
lives   EQU   $04               ; 残り
flash   EQU   $05               ; 当たった後の点滅の残り
beep    EQU   $06               ; 音の残り
speed   EQU   $07               ; 隕石の速さ
score   EQU   $08               ; 点数（2 バイト）
left    EQU   $0A               ; 繰り返しの残り
temp    EQU   $0B
table   EQU   $10               ; 隕石: x、y の 2 バイトが ROCKS 個
ROCKS   EQU   4
PX_REG  EQU   $ED

start:  CALL  game_start
title:  MV    X,picture         ; タイトル
        CALL  screen_load
        CALL  screen_keep
        MV    (text_x),84
        MV    (text_row),1
        MV    X,name
        CALL  text_draw
        MV    (text_x),78
        MV    (text_row),2
        MV    X,press
        CALL  text_draw
        CALL  screen_show
title_1:
        CALL  random            ; 押されるまでの時間で、並びを変える
        CALL  pad_read
        TEST  (pad_now),PAD_BREAK
        JPNZ  quit
        TEST  (pad_new),PAD_A
        JRZ   title_1

        CALL  init
loop:   CALL  pad_read
        TEST  (pad_now),PAD_BREAK
        JPNZ  quit
        CALL  move
        CALL  fire
        CALL  fly
        CALL  hit_rocks
        CALL  sound
        CALL  screen_restore
        CALL  draw
        CALL  screen_show
        INC   (count)
        CMP   (lives),0
        JPZ   over
        MV    A,3
        CALL  game_wait
        JP    loop

quit:   CALL  game_end
        RC
        RETF

; 終わり: SPACE でタイトルへ。
over:   CALL  sound_off
        MV    (text_x),90
        MV    (text_row),1
        MV    X,ending
        CALL  text_draw
        CALL  screen_show
over_1: CALL  pad_read
        TEST  (pad_now),PAD_BREAK
        JPNZ  quit
        TEST  (pad_new),PAD_A
        JRZ   over_1
        JP    title

; 初めの値。隕石は右側に、間をあけて並べる。
init:   MV    (ship_y),12
        MV    (shot_x),0
        MV    (count),0
        MV    (lives),3
        MV    (flash),0
        MV    (beep),0
        MV    (speed),2
        MVW   (score),0
        MV    (PX_REG),table
        MV    (left),ROCKS
        MV    (temp),231        ; 最初の隕石の x
init_1: MV    A,(temp)
        MV    (PX),A
        SUB   (temp),30         ; 次は 30 ドット左
        CALL  new_y
        MV    (PX+1),A
        PMDF  (PX_REG),2
        DEC   (left)
        JRNZ  init_1
        RET

; 隕石の高さを乱数で決める（0〜23）。
new_y:  MV    IL,24
        JP    random_below

; ▲▼ で動かす。
move:   TEST  (pad_now),PAD_UP
        JRZ   move_1
        CMP   (ship_y),2
        JRC   move_1
        SUB   (ship_y),2
move_1: TEST  (pad_now),PAD_DOWN
        JRZ   move_2
        CMP   (ship_y),23
        JRNC  move_2
        ADD   (ship_y),2
move_2: CMP   (flash),0
        JRZ   move_3
        DEC   (flash)
move_3: RET

; SPACE で撃つ。弾は 1 発だけ。
fire:   CMP   (shot_x),0
        JRNZ  fire_1
        TEST  (pad_new),PAD_A
        JRZ   fire_2
        MV    (shot_x),16
        MV    (shot_y),(ship_y)
        MV    (beep),2          ; このターンの sound で 1 減る
        MV    A,BZ_4K
        JP    sound_on
fire_1: ADD   (shot_x),8
        CMP   (shot_x),232
        JRC   fire_2
        MV    (shot_x),0        ; 画面の外
fire_2: RET

; 隕石を全部、左へ動かす。
fly:    MV    (PX_REG),table
        MV    (left),ROCKS
fly_1:  MV    A,(PX)
        MV    (temp),A
        MV    A,(speed)
        CMP   (temp),A
        JRC   fly_2             ; 左に抜けた
        SUB   (temp),A
        MV    A,(temp)
        MV    (PX),A
        JR    fly_3
fly_2:  CALL  reborn
fly_3:  PMDF  (PX_REG),2
        DEC   (left)
        JRNZ  fly_1
        RET

; (PX) の隕石を右端に出し直す。
reborn: MV    A,231
        MV    (PX),A
        CALL  new_y
        MV    (PX+1),A
        RET

; 隕石を 1 つずつ、弾と自機に当たっていないか調べる。
hit_rocks:
        MV    (PX_REG),table
        MV    (left),ROCKS
rock_1: MV    A,(PX)
        MV    (hit_bx),A
        MV    A,(PX+1)
        MV    (hit_by),A
        MV    (hit_bw),8
        MV    (hit_bh),8
        CMP   (shot_x),0
        JRZ   rock_2
        MV    (hit_ax),(shot_x)
        MV    A,(shot_y)
        ADD   A,3
        MV    (hit_ay),A
        MV    (hit_aw),8
        MV    (hit_ah),2
        CALL  box_hit
        JRNC  rock_2
        MV    (shot_x),0        ; 撃った
        CALL  gain
        CALL  reborn
        JR    rock_3
rock_2: CMP   (flash),0         ; 点滅中は当たらない
        JRNZ  rock_3
        MV    (hit_ax),5
        MV    A,(ship_y)
        INC   A
        MV    (hit_ay),A
        MV    (hit_aw),7
        MV    (hit_ah),6
        CALL  box_hit
        JRNC  rock_3
        DEC   (lives)
        MV    (flash),30
        MV    (beep),4
        MV    A,BZ_2K
        CALL  sound_on
        CALL  reborn
rock_3: PMDF  (PX_REG),2
        DEC   (left)
        JPNZ  rock_1
        RET

; 点を足す。16 点ごとに速くする（5 まで）。
gain:   MV    BA,(score)
        INC   BA
        MV    (score),BA
        AND   A,15
        JRNZ  gain_1
        CMP   (speed),5
        JRNC  gain_1
        INC   (speed)
gain_1: MV    (beep),2
        MV    A,BZ_2K
        JP    sound_on

; 音を止めるころあいを見る。
sound:  CMP   (beep),0
        JRZ   sound_1
        DEC   (beep)
        JRNZ  sound_1
        CALL  sound_off
sound_1:
        RET

; 点数、残り、隕石、弾、自機を描く。
draw:   MV    (text_x),60
        MV    (text_row),0
        MV    I,(score)
        CALL  number_draw
        MV    (text_x),4
        MV    (text_row),0
        MV    X,ships           ; 残りの数だけ * を出す
        MV    A,3
        SUB   A,(lives)
        ADD   X,A
        CALL  text_draw

        MV    (PX_REG),table
        MV    (left),ROCKS
draw_2: MV    A,(PX)
        MV    (sprite_x),A
        MV    (sprite_x+1),0
        MV    A,(PX+1)
        MV    (sprite_y),A
        MV    X,rock
        MV    A,(count)
        RC
        SHR   A
        ADD   A,(left)          ; 隕石ごとに回り方をずらす
        AND   A,3
        CALL  sprite_draw
        PMDF  (PX_REG),2
        DEC   (left)
        JRNZ  draw_2

        CMP   (shot_x),0
        JRZ   draw_3
        MV    (sprite_x),(shot_x)
        MV    (sprite_x+1),0
        MV    (sprite_y),(shot_y)
        MV    X,shot
        MV    A,0
        CALL  sprite_draw
draw_3: TEST  (flash),2         ; 点滅中は、消える回がある
        JRNZ  draw_4
        MVW   (sprite_x),4
        MV    (sprite_y),(ship_y)
        MV    X,ship
        MV    A,(count)
        AND   A,1
        CALL  sprite_draw
draw_4: RET

name:   DB    "M E T E O R",0
press:  DB    "PUSH SPACE KEY",0
ending: DB    "GAME OVER",0
ships:  DB    "***",0
picture:
        INCBIN "meteor.lcd"
ship:   INCBIN "ship.spr"
rock:   INCBIN "rock.spr"
shot:   INCBIN "shot.spr"

        INCLUDE "game.inc"
        INCLUDE "screen.inc"
        INCLUDE "sprite.inc"
        INCLUDE "pad.inc"
        INCLUDE "text.inc"
        INCLUDE "random.inc"
finish:
        ASSERT 1+(($BFC00-finish)>>63)
        END
