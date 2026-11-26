; スターキャッチ: テンプレートのゲームに敵と終わりを足したもの
; 矢印キーで顔を動かし、星を取り、敵をよける。ON/BRK で BASIC へ戻る。
; 絵: starcatch.lcd（背景）、face.spr（顔、2 コマ）、star.spr（星、4 コマ）、enemy.spr（敵）。ドットエディタで描き直せる。
        ORG   $BE000            ; 置くアドレス。BFBFF までに収める
        INCLUDE "hardware.inc"

; 自分の変数は内部 RAM の 00h〜1Fh に置く（20h〜BFh は INCLUDE が使う）。
face_x  EQU   $00               ; 顔の位置
face_y  EQU   $01
star_x  EQU   $02               ; 星の位置
star_y  EQU   $03
count   EQU   $04               ; コマ送りの数（毎回 1 増える）
score   EQU   $05               ; 点数（2 バイト）
beep    EQU   $07               ; 音の残り
enemy_x EQU   $08               ; 敵の位置
enemy_y EQU   $09
STEP    EQU   2                 ; 1 回に動くドット数

start:  CALL  game_start
        MV    X,picture         ; 背景を用意する
        CALL  screen_load
        CALL  screen_keep
begin:  MV    (face_x),116
        MV    (face_y),12
        MV    (count),0
        MVW   (score),0
        MV    (beep),0
        MV    (enemy_x),232
        MV    (enemy_y),12
        CALL  new_star

loop:   CALL  pad_read
        TEST  (pad_now),PAD_BREAK
        JPNZ  quit
        CALL  move
        CALL  take
        CALL  enemy
        CALL  sound
        CALL  screen_restore    ; 背景に戻してから全部描く
        CALL  draw
        CALL  screen_show
        CALL  crash             ; 敵に当たったか
        JPC   over
        INC   (count)
        MV    A,3               ; 約 16 ミリ秒の 3 回分（処理込みで 1 秒に約 16 ターン）
        CALL  game_wait
        JP    loop

quit:   CALL  game_end
        RC
        RETF

; 敵に当たった: 文字を出し、SPACE で最初から、ON/BRK で終わり。
over:   CALL  sound_off
        MV    (text_x),90
        MV    (text_row),1
        MV    X,message
        CALL  text_draw
        CALL  screen_show
over_1: CALL  pad_read
        TEST  (pad_now),PAD_BREAK
        JPNZ  quit
        TEST  (pad_new),PAD_A
        JRZ   over_1
        JP    begin

; 敵を左へ動かす。端まで来たら、右端の別の高さから出す。
enemy:  CMP   (enemy_x),3
        JRC   enemy_1
        SUB   (enemy_x),3
        RET
enemy_1:
        MV    (enemy_x),232
        MV    IL,24
        CALL  random_below
        MV    (enemy_y),A
        RET

; 顔と敵が重なっていれば C = 1（周りの 1 ドットは見逃す）。
crash:  MV    (hit_ax),(face_x)
        INC   (hit_ax)
        MV    (hit_ay),(face_y)
        INC   (hit_ay)
        MV    (hit_aw),6
        MV    (hit_ah),6
        MV    (hit_bx),(enemy_x)
        MV    (hit_by),(enemy_y)
        MV    (hit_bw),8
        MV    (hit_bh),8
        JP    box_hit           ; box_hit の RET で、そのまま戻る

; 矢印キーで顔を動かす。
move:   TEST  (pad_now),PAD_LEFT
        JRZ   move_1
        CMP   (face_x),STEP
        JRC   move_1
        SUB   (face_x),STEP
move_1: TEST  (pad_now),PAD_RIGHT
        JRZ   move_2
        CMP   (face_x),240-8-STEP+1
        JRNC  move_2
        ADD   (face_x),STEP
move_2: TEST  (pad_now),PAD_UP
        JRZ   move_3
        CMP   (face_y),STEP
        JRC   move_3
        SUB   (face_y),STEP
move_3: TEST  (pad_now),PAD_DOWN
        JRZ   move_4
        CMP   (face_y),32-8-STEP+1
        JRNC  move_4
        ADD   (face_y),STEP
move_4: RET

; 顔が星に触れたら、点を足して次の星を出す。
take:   MV    (hit_ax),(face_x)
        MV    (hit_ay),(face_y)
        MV    (hit_aw),8
        MV    (hit_ah),8
        MV    (hit_bx),(star_x)
        MV    (hit_by),(star_y)
        MV    (hit_bw),8
        MV    (hit_bh),8
        CALL  box_hit
        JRNC  take_1
        MV    BA,(score)
        INC   BA
        MV    (score),BA
        MV    (beep),2
        MV    A,BZ_4K
        CALL  sound_on
        CALL  new_star
take_1: RET

; 星を出す場所を乱数で決める（点数を書く左上は避ける）。
new_star:
        MV    IL,180
        CALL  random_below
        ADD   A,50
        MV    (star_x),A
        MV    IL,24
        CALL  random_below
        MV    (star_y),A
        RET

; 音を止めるころあいを見る。
sound:  CMP   (beep),0
        JRZ   sound_1
        DEC   (beep)
        JRNZ  sound_1
        CALL  sound_off
sound_1:
        RET

; 点数、星、顔を描く。
draw:   MV    (text_x),4
        MV    (text_row),0
        MV    I,(score)
        CALL  number_draw
        MV    (sprite_x),(star_x)
        MV    (sprite_x+1),0
        MV    (sprite_y),(star_y)
        MV    X,star
        MV    A,(count)         ; 2 回ごとに次のコマ（4 コマ）
        RC
        SHR   A
        AND   A,3
        CALL  sprite_draw
        MV    (sprite_x),(enemy_x)
        MV    (sprite_x+1),0
        MV    (sprite_y),(enemy_y)
        MV    X,foe
        MV    A,0
        CALL  sprite_draw
        MV    (sprite_x),(face_x)
        MV    (sprite_x+1),0
        MV    (sprite_y),(face_y)
        MV    X,face
        MV    A,0               ; 動いている間は口を開け閉めする
        TEST  (pad_now),PAD_LEFT+PAD_RIGHT+PAD_UP+PAD_DOWN
        JRZ   draw_1
        MV    A,(count)
        RC
        SHR   A
        AND   A,1
draw_1: CALL  sprite_draw
        RET

picture:
        INCBIN "starcatch.lcd"
face:   INCBIN "face.spr"
star:   INCBIN "star.spr"
foe:    INCBIN "enemy.spr"
message:
        DB    "GAME OVER",0

        INCLUDE "game.inc"
        INCLUDE "screen.inc"
        INCLUDE "sprite.inc"
        INCLUDE "pad.inc"
        INCLUDE "text.inc"
        INCLUDE "random.inc"
        END
