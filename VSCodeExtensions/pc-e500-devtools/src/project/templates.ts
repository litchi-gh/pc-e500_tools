// What "new program" starts from. The sources are tried in the emulator by the tests.
import { L } from "../l10n";
import { encodeLcd, HEIGHT, WIDTH } from "../lcd/lcdFile";
import { encodeSpr } from "../lcd/sprFile";

export type TemplateId = "minimal" | "text" | "screen" | "game" | "routine" | "app" | "basicapp" | "basicgame";
export interface TemplateFile { readonly name: string; readonly content: string | Uint8Array }
export interface Template { readonly id: TemplateId; readonly icon: string; readonly label: string; readonly detail: string; files(name: string): TemplateFile[] }

const orgNote = (): string => L(
  "        ORG   $BEC00            ; 置くアドレス。BFBFF までに収める（大きくなったら下げる）",
  "        ORG   $BEC00            ; Where it goes: up to BFBFF (lower it as the program grows)");

const minimal = (name: string): string => `; ${name}
${orgNote()}

start:  RC                      ; ${L("C=0: エラーなし", "C=0: no error")}
        RETF                    ; ${L("BASIC へ戻る（RET ではなく RETF）", "Back to BASIC (RETF, not RET)")}
        END
`;

const text = (name: string): string => `; ${name}: ${L("文字を表示する", "shows a line of text")}
${orgNote()}
        INCLUDE "iocs.inc"      ; ${L("IOCS の名前", "The names of IOCS")}

start:  PUSHU IMR               ; ${L("割り込みを止める", "Interrupts off")}
        MV    (CL),DEV_SCRN     ; ${L("画面", "The screen")}
        MV    (CH),0
        MV    (BL),0            ; x = 0
        MV    (BH),3            ; y = 3
        MV    IL,SCRN_PUTS      ; ${L("指定位置へ n 文字表示", "Show n characters at a place")}
        MV    X,msg             ; ${L("文字列の先頭", "The text")}
        MV    Y,msg_end-msg     ; ${L("長さ", "Its length")}
        CALLF IOCS
        POPU  IMR
        RC                      ; ${L("C=0: エラーなし", "C=0: no error")}
        RETF                    ; ${L("BASIC へ戻る", "Back to BASIC")}

msg:    DB    "HELLO!"
msg_end:
        END
`;

const screen = (name: string): string => `; ${name}: ${L("画面を使うプログラム", "a program that draws on the screen")}
; ${L("背景の上の四角を矢印キーで動かす。SPACE で元の位置、ON/BRK で BASIC へ戻る。", "Moves a square over a background with the arrow keys. SPACE puts it back, ON/BRK returns to BASIC.")}
; ${L(`背景は ${name}.lcd（240x32 ドット、1024 バイト）。`, `The background is ${name}.lcd (240 x 32 dots, 1024 bytes).`)}
        ORG   $BE000            ; ${L("置くアドレス。BFBFF までに収める", "Where it goes: up to BFBFF")}
IOCS    EQU   $FFFE8            ; ${L("IOCS のエントリ", "IOCS entry")}
KOL     EQU   $F0               ; ${L("キーの列（KO0-KO7）", "Key columns (KO0-KO7)")}
KOH     EQU   $F1               ; ${L("キーの列（KO8-KO11）", "Key columns (KO8-KO11)")}
KI      EQU   $F2               ; ${L("押されているキーの行", "Rows of the keys held")}
ISR     EQU   $FC               ; ${L("割り込みの要求", "Interrupt requests")}
; ${L("IOCS に値を渡す内部 RAM（D4h-D7h）を作業用に使う。", "Work bytes: the internal RAM that passes values to IOCS (D4h-D7h).")}
dot_x   EQU   $D4
dot_y   EQU   $D5
work    EQU   $D6
found   EQU   $D7
; ${L("keys が返すビット", "Bits from keys")}
LEFT    EQU   1
RIGHT   EQU   2
UP      EQU   4
DOWN    EQU   8
SPACE   EQU   16
BREAK   EQU   32
SIZE    EQU   8                 ; ${L("四角の大きさ", "Size of the square")}
STEP    EQU   4                 ; ${L("1 回に動くドット数", "Dots a move")}

start:  PUSHU IMR               ; ${L("割り込みを止める（キーを自分で読むため）", "Interrupts off (the program reads the keys itself)")}
        CALL  lcd_on
redraw: CALL  draw
        CALL  show
loop:   CALL  keys
        TEST  A,BREAK
        JPNZ  quit
        CMP   A,0
        JRZ   loop              ; ${L("何も押されていない", "Nothing held")}
        CALL  move
        JP    redraw

; ${L("BASIC へ戻る。BRK が離されるのを待ってから割り込みを戻す。", "Back to BASIC: waits for BRK to be let go before interrupts are on again.")}
quit:   CALL  keys
        TEST  A,BREAK
        JRNZ  quit
        MV    (work),0          ; ${L("デバイス 0 = LCD", "device 0 = LCD")}
        MV    (found),0
        MV    IL,$51            ; ${L("画面を消す", "Clear the screen")}
        CALLF IOCS
        AND   (ISR),$F2         ; ${L("たまったキーと BRK の要求を消す", "Drop the key and BRK requests that came in")}
        POPU  IMR
        RC
        RETF

; ${L("A のキーで四角を動かす。", "Moves the square by the keys in A.")}
move:   MV    (found),A
        TEST  A,SPACE
        JRZ   m_left
        MV    A,116
        MV    [sq_x],A
        MV    A,12
        MV    [sq_y],A
        RET
m_left: TEST  (found),LEFT
        JRZ   m_right
        MV    A,[sq_x]
        CMP   A,STEP
        JRC   m_right
        SUB   A,STEP
        MV    [sq_x],A
m_right:
        TEST  (found),RIGHT
        JRZ   m_up
        MV    A,[sq_x]
        CMP   A,240-SIZE-STEP+1
        JRNC  m_up
        ADD   A,STEP
        MV    [sq_x],A
m_up:   TEST  (found),UP
        JRZ   m_down
        MV    A,[sq_y]
        CMP   A,STEP
        JRC   m_down
        SUB   A,STEP
        MV    [sq_y],A
m_down: TEST  (found),DOWN
        JRZ   m_end
        MV    A,[sq_y]
        CMP   A,32-SIZE-STEP+1
        JRNC  m_end
        ADD   A,STEP
        MV    [sq_y],A
m_end:  RET

; ${L("frame に背景と四角を描く。", "Draws the background and the square in frame.")}
draw:   MV    X,picture
        MV    Y,frame
        MV    I,1024
d_copy: MV    A,[X++]
        MV    [Y++],A
        DEC   I
        JRNZ  d_copy
        MV    A,[sq_y]
        MV    (dot_y),A
d_row:  MV    A,[sq_x]
        MV    (dot_x),A
d_dot:  CALL  point
        INC   (dot_x)
        MV    A,[sq_x]
        ADD   A,SIZE
        CMP   (dot_x),A
        JRNZ  d_dot
        INC   (dot_y)
        MV    A,[sq_y]
        ADD   A,SIZE
        CMP   (dot_y),A
        JRNZ  d_row
        RET

; ${L("frame の (dot_x),(dot_y) の点を点ける。A, IL, X, Y, (work) が変わる。", "Puts on the dot (dot_x),(dot_y) of frame. Changes A, IL, X, Y, (work).")}
point:  MV    A,(dot_y)         ; ${L("バイトの中のビット", "The bit in the byte")}
        AND   A,7
        MV    Y,bits
        ADD   Y,A
        MV    A,[Y]
        MV    (work),A
        MV    A,(dot_x)         ; ${L("画面の 4 つの区画: 先頭と桁の並びが違う", "The screen's four parts: their start and column order differ")}
        CMP   A,64
        JRC   p_1
        CMP   A,120
        JRC   p_2
        CMP   A,176
        JRC   p_3
        MV    X,frame+512+256
        MV    A,239
        SUB   A,(dot_x)
        JR    p_col
p_3:    MV    X,frame+256
        MV    A,175
        SUB   A,(dot_x)
        JR    p_col
p_2:    MV    X,frame
        SUB   A,64
        JR    p_col
p_1:    MV    X,frame+512
p_col:  ADD   X,A
        MV    A,(dot_y)         ; ${L("8 行ごとに 64 バイト", "64 bytes every 8 rows")}
        RC
        SHR   A
        RC
        SHR   A
        RC
        SHR   A
        MV    IL,64
p_page: CMP   A,0
        JRZ   p_set
        ADD   X,IL
        DEC   A
        JR    p_page
p_set:  MV    A,[X]
        OR    A,(work)
        MV    [X],A
        RET

; ${L("frame を LCD に送る。コントローラ 0（2008h）、1（2004h）の順に 512 バイトずつ。", "Sends frame to the LCD: 512 bytes to controller 0 (2008h), then to controller 1 (2004h).")}
show:   MV    X,frame
        MV    Y,$2008
        CALL  s_half
        MV    Y,$2004
s_half: MV    (work),$B8        ; ${L("ページ 0", "Page 0")}
s_page: CALL  ready
        MV    A,(work)
        MV    [Y],A
        CALL  ready
        MV    A,$40             ; ${L("桁 0", "Column 0")}
        MV    [Y],A
        MV    IL,64
s_byte: CALL  ready
        MV    A,[X++]
        MV    [Y+2],A
        DEC   IL
        JRNZ  s_byte
        INC   (work)
        CMP   (work),$C0
        JRNZ  s_page
        RET

; ${L("Y のコントローラが受け付けるまで待つ。", "Waits until the controller at Y takes a command.")}
ready:  MV    A,[Y+1]
        TEST  A,$80
        JRNZ  ready
        RET

; ${L("表示をオンにし、表示開始ラインを 0 にする。", "Display on, start line 0.")}
lcd_on: MV    Y,$2008
        CALL  l_on
        MV    Y,$2004
l_on:   CALL  ready
        MV    A,$3F
        MV    [Y],A
        CALL  ready
        MV    A,$C0
        MV    [Y],A
        RET

; ${L("押されているキーを A に返す。", "The keys held, in A.")}
keys:   MV    (found),0
        AND   (KOH),$F0         ; ${L("上位 4 ビットは別の信号", "The upper four bits are other lines")}
        MV    (KOL),$10         ; ${L("KO4: ▶ は KI6", "KO4: right is KI6")}
        NOP
        TEST  (KI),$40
        JRZ   k_1
        OR    (found),RIGHT
k_1:    MV    (KOL),$08         ; ${L("KO3: ▲ は KI6、◀ は KI7", "KO3: up is KI6, left is KI7")}
        NOP
        TEST  (KI),$40
        JRZ   k_2
        OR    (found),UP
k_2:    TEST  (KI),$80
        JRZ   k_3
        OR    (found),LEFT
k_3:    MV    (KOL),$04         ; ${L("KO2: SPACE は KI6、▼ は KI7", "KO2: SPACE is KI6, down is KI7")}
        NOP
        TEST  (KI),$40
        JRZ   k_4
        OR    (found),SPACE
k_4:    TEST  (KI),$80
        JRZ   k_5
        OR    (found),DOWN
k_5:    MV    (KOL),0
        OR    (KOH),$08         ; ${L("KO11: ON/BRK は KI1", "KO11: ON/BRK is KI1")}
        NOP
        TEST  (KI),$02
        JRZ   k_6
        OR    (found),BREAK
k_6:    AND   (KOH),$F0
        MV    A,(found)
        RET

sq_x:   DB    116               ; ${L("四角の位置", "Where the square is")}
sq_y:   DB    12
bits:   DB    1,2,4,8,16,32,64,128
picture:
        INCBIN "${name}.lcd"
frame:  DS    1024              ; ${L("描いてから LCD に送る画面（表示 RAM と同じ並び）", "The screen being drawn, in the order of display RAM")}
        END
`;

const game = (name: string): string => `; ${name}: ${L("キャラクタを動かすゲーム", "a game with sprites")}
; ${L("矢印キーで顔を動かし、星を取る。ON/BRK で BASIC へ戻る。", "The arrow keys move the face, which takes the stars. ON/BRK returns to BASIC.")}
; ${L(`絵: ${name}.lcd（背景）、${name}p.spr（顔、2 コマ）、${name}s.spr（星、4 コマ）。ドットエディタで描き直せる。`, `Pictures: ${name}.lcd (background), ${name}p.spr (the face, 2 frames), ${name}s.spr (the star, 4 frames), for the dot editor.`)}
        ORG   $BE000            ; ${L("置くアドレス。BFBFF までに収める", "Where it goes: up to BFBFF")}
        INCLUDE "hardware.inc"

; ${L("自分の変数は内部 RAM の 00h〜1Fh に置く（20h〜BFh は INCLUDE が使う）。", "Variables of the game's own go in 00h-1Fh of internal RAM (20h-BFh is for the INCLUDEs).")}
face_x  EQU   $00               ; ${L("顔の位置", "Where the face is")}
face_y  EQU   $01
star_x  EQU   $02               ; ${L("星の位置", "Where the star is")}
star_y  EQU   $03
count   EQU   $04               ; ${L("コマ送りの数（毎回 1 増える）", "Counts up every turn")}
score   EQU   $05               ; ${L("点数（2 バイト）", "The score (2 bytes)")}
beep    EQU   $07               ; ${L("音の残り", "How long the sound goes on")}
STEP    EQU   2                 ; ${L("1 回に動くドット数", "Dots a move")}

start:  CALL  game_start
        MV    X,picture         ; ${L("背景を用意する", "The background")}
        CALL  screen_load
        CALL  screen_keep
        MV    (face_x),116
        MV    (face_y),12
        MV    (count),0
        MVW   (score),0
        MV    (beep),0
        CALL  new_star

loop:   CALL  pad_read
        TEST  (pad_now),PAD_BREAK
        JPNZ  quit
        CALL  move
        CALL  take
        CALL  sound
        CALL  screen_restore    ; ${L("背景に戻してから全部描く", "The background again, and everything on it")}
        CALL  draw
        CALL  screen_show
        INC   (count)
        MV    A,3               ; ${L("約 16 ミリ秒の 3 回分（処理込みで 1 秒に約 16 ターン）", "Three of 16 ms (about 16 turns a second, with the work)")}
        CALL  game_wait
        JP    loop

quit:   CALL  game_end
        RC
        RETF

; ${L("矢印キーで顔を動かす。", "Moves the face by the arrow keys.")}
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

; ${L("顔が星に触れたら、点を足して次の星を出す。", "When the face touches the star: a point, and the next star.")}
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

; ${L("星を出す場所を乱数で決める（点数を書く左上は避ける）。", "A place for the star at random (not the top left, where the score is).")}
new_star:
        MV    IL,180
        CALL  random_below
        ADD   A,50
        MV    (star_x),A
        MV    IL,24
        CALL  random_below
        MV    (star_y),A
        RET

; ${L("音を止めるころあいを見る。", "Stops the sound in time.")}
sound:  CMP   (beep),0
        JRZ   sound_1
        DEC   (beep)
        JRNZ  sound_1
        CALL  sound_off
sound_1:
        RET

; ${L("点数、星、顔を描く。", "Draws the score, the star and the face.")}
draw:   MV    (text_x),4
        MV    (text_row),0
        MV    I,(score)
        CALL  number_draw
        MV    (sprite_x),(star_x)
        MV    (sprite_x+1),0
        MV    (sprite_y),(star_y)
        MV    X,star
        MV    A,(count)         ; ${L("2 回ごとに次のコマ（4 コマ）", "The next of 4 frames every 2 turns")}
        RC
        SHR   A
        AND   A,3
        CALL  sprite_draw
        MV    (sprite_x),(face_x)
        MV    (sprite_x+1),0
        MV    (sprite_y),(face_y)
        MV    X,face
        MV    A,0               ; ${L("動いている間は口を開け閉めする", "The mouth opens and shuts while it moves")}
        TEST  (pad_now),PAD_LEFT+PAD_RIGHT+PAD_UP+PAD_DOWN
        JRZ   draw_1
        MV    A,(count)
        RC
        SHR   A
        AND   A,1
draw_1: CALL  sprite_draw
        RET

picture:
        INCBIN "${name}.lcd"
face:   INCBIN "${name}p.spr"
star:   INCBIN "${name}s.spr"

        INCLUDE "game.inc"
        INCLUDE "screen.inc"
        INCLUDE "sprite.inc"
        INCLUDE "pad.inc"
        INCLUDE "text.inc"
        INCLUDE "random.inc"
        END
`;

/** The frames of a sprite drawn in letters: "#" on, "o" off, "." clear. */
function drawn(...frames: string[][]): Uint8Array {
  const width = frames[0][0].length, height = frames[0].length;
  return encodeSpr({ width, height, mask: true, frames: frames.map(f => Uint8Array.from(f.join(""), c => (c === "#" ? 1 : c === "o" ? 2 : 0))) });
}
const FACE = (): Uint8Array => drawn(
  ["..####..", ".#oooo#.", "#o#oo#o#", "#oooooo#", "#o#oo#o#", "#oo##oo#", ".#oooo#.", "..####.."],
  ["..####..", ".#oooo#.", "#o#oo#o#", "#oooooo#", "#o####o#", "#o####o#", ".#o##o#.", "..####.."]);
const STAR = (): Uint8Array => drawn(
  ["...#....", "...#....", ".#.#.#..", "..###...", "#######.", "..###...", ".#.#.#..", "...#...."],
  ["........", "...#....", "..#.#...", "...#....", ".#.#.#..", "...#....", "..#.#...", "...#...."],
  ["........", "........", "...#....", "..###...", ".#####..", "..###...", "...#....", "........"],
  ["........", "...#....", "..#.#...", "...#....", ".#.#.#..", "...#....", "..#.#...", "...#...."]);

/** A field: a frame and some grass, to see that the sprites go over it. */
function fieldPicture(): Uint8Array {
  const dots = new Uint8Array(WIDTH * HEIGHT);
  for (let x = 0; x < WIDTH; x++) { dots[(HEIGHT - 1) * WIDTH + x] = 1; if (x % 6 === 2 || x % 11 === 5) dots[(HEIGHT - 2) * WIDTH + x] = 1; if (x % 11 === 5) dots[(HEIGHT - 3) * WIDTH + x] = 1; }
  for (let i = 0; i < 40; i++) dots[(3 + (i * 7) % 22) * WIDTH + 50 + (i * 53) % 186] = 1;
  return encodeLcd(dots);
}

const routine = (name: string): string => `; ${name}: ${L("BASIC から呼ぶルーチン", "a routine for BASIC")}
; ${L("data と data+1 を足して、data+2（下位）と data+3（上位）に置く。", "Adds data and data+1 into data+2 (low) and data+3 (high).")}
; 10 POKE &HBEC00,3,4:CALL &HBEC04:PRINT PEEK &HBEC02
${orgNote()}

data:   DB    0,0               ; ${L("足す数", "The numbers")}
        DB    0,0               ; ${L("結果", "The sum")}

start:  MV    IL,[data+1]
        MV    A,[data]
        ADD   A,IL
        MV    [data+2],A
        MV    A,0
        ADC   A,0               ; ${L("桁上がり", "The carry")}
        MV    [data+3],A
        RC                      ; ${L("C=0: エラーなし", "C=0: no error")}
        RETF                    ; ${L("BASIC へ戻る", "Back to BASIC")}
        END
`;

const routineTests = (name: string): string => `{
  // ${L("テスト エクスプローラー（フラスコのアイコン）から実行する。", "Run these from the Test Explorer (the flask icon).")}
  "program": "${name}.asm",
  "tests": [
    {
      "name": "3 + 4 = 7",
      "call": "start",
      "memory": { "data": [3, 4] },
      "expect": { "registers": { "C": 0 }, "memory": { "data+2": [7, 0] } }
    },
    {
      "name": "200 + 100 = 300",
      "call": "start",
      "memory": { "data": [200, 100] },
      "expect": { "memory": { "data+2": [44, 1] } }
    },
    {
      "name": "${L("BASIC から呼ぶ", "From BASIC")}",
      "basic": "CLS:POKE &HBEC00,30,12:CALL &HBEC04:PRINT PEEK &HBEC02",
      "expect": { "screen": "42" }
    }
  ]
}
`;

const app = (name: string): string => `; ${name}: ${L("メニューのあるアプリ", "an application with a menu")}
; ${L("10 進 → 16 進、16 進 → 10 進。メニューは 1、2、Q。入力は BS で消し、RETURN で決める。ON/BRK で戻る。", "Decimal to hexadecimal and back. The menu takes 1, 2 and Q; BS deletes, RETURN enters, ON/BRK goes back.")}
        ORG   $BE000            ; ${L("置くアドレス。BFBFF までに収める", "Where it goes: up to BFBFF")}
        INCLUDE "iocs.inc"
        INCLUDE "keycode.inc"

; ---- ${L("流れ", "The flow")} ----
start:  MV    X,t_menu          ; ${L("メニュー", "The menu")}
        CALL  show
menu_1: CALL  get_key
        CMP   A,'1'
        JRZ   do_hex
        CMP   A,'2'
        JRZ   do_dec
        CMP   A,'Q'
        JRZ   quit
        CMP   A,KEY_BRK
        JRNZ  menu_1
quit:   TEST  ($FF),$08         ; ${L("ON/BRK が離されるのを待つ（BASIC が BREAK にならないように）", "Until ON/BRK is let go, or BASIC would break")}
        JRNZ  quit
        MV    A,[$BFCBE]        ; ${L("BREAK の印を消す", "No break is waiting")}
        AND   A,$7F
        MV    [$BFCBE],A
        CALL  cls
        RC                      ; ${L("C=0: エラーなし", "C=0: no error")}
        RETF                    ; ${L("BASIC へ戻る", "Back to BASIC")}

do_hex: MV    X,t_hex           ; ${L("10 進 → 16 進", "Decimal to hexadecimal")}
        CALL  show
        CALL  input             ; ${L("C=1: ON/BRK", "C=1: ON/BRK")}
        JRC   start
        CALL  to_num
        JRC   bad
        CALL  to_hex
        JR    answer

do_dec: MV    X,t_dec           ; ${L("16 進 → 10 進", "Hexadecimal to decimal")}
        CALL  show
        CALL  input
        JRC   start
        CALL  hex_num
        JRC   bad
        CALL  to_dec
answer: MV    X,line            ; ${L("結果を 3 行目に出す", "The answer on the third line")}
        JR    say
bad:    MV    X,t_bad
say:    MV    (BL),0
        MV    (BH),2
        CALL  print
        MV    X,t_key
        MV    (BL),0
        MV    (BH),3
        CALL  print
        CALL  get_key
        JP    start

; ---- ${L("計算（テストから 1 つずつ呼べる）", "The sums, which the tests call one by one")} ----
; ${L("line の 10 進の文字 → I。数でないか 65535 を越えれば C=1。", "The decimal text in line to I; C=1 when it is no number or above 65535.")}
to_num: MV    X,line
        MV    BA,0
        MV    (d_val),BA
        MV    (d_got),0
num_1:  MV    A,[X++]
        CMP   A,0
        JRZ   num_end
        SUB   A,'0'
        JRC   num_bad
        CMP   A,10
        JRNC  num_bad
        MV    (d_add),A
        MV    (d_add+1),0
        MV    (d_got),1
        MV    IL,10             ; ${L("10 倍する = 10 回足す", "Ten times: added ten times")}
        MV    BA,0
        MV    (d_sum),BA
num_2:  MV    BA,(d_sum)
        PUSHU I
        MV    I,(d_val)
        ADD   BA,I
        POPU  I
        JRC   num_bad
        MV    (d_sum),BA
        DEC   IL
        JRNZ  num_2
        MV    BA,(d_sum)
        MV    I,(d_add)
        ADD   BA,I
        JRC   num_bad
        MV    (d_val),BA
        JR    num_1
num_end:
        CMP   (d_got),1         ; ${L("1 文字もなければ C=1", "C=1 when there was none")}
        JRNZ  num_bad
        MV    I,(d_val)
        RC
        RET
num_bad:
        SC
        RET

; ${L("line の 16 進の文字（4 桁まで）→ I。", "The hexadecimal text in line, up to 4 digits, to I.")}
hex_num:
        MV    X,line
        MV    BA,0
        MV    (d_val),BA
        MV    (d_got),0
hxn_1:  MV    A,[X++]
        CMP   A,0
        JRZ   num_end
        SUB   A,'0'
        JRC   num_bad
        CMP   A,10
        JRC   hxn_2
        SUB   A,7               ; 'A' - '9' - 1
        CMP   A,10
        JRC   num_bad
        CMP   A,16
        JRNC  num_bad
hxn_2:  MV    (d_add),A
        MV    (d_got),1
        MV    (d_sum),4         ; ${L("4 ビット左へ", "Four bits to the left")}
hxn_3:  RC
        SHL   (d_val)
        SHL   (d_val+1)
        JRC   num_bad
        DEC   (d_sum)
        JRNZ  hxn_3
        MV    A,(d_add)
        OR    (d_val),A
        JR    hxn_1

; ${L("I → line に 16 進 4 桁。", "I to line as 4 hexadecimal digits.")}
to_hex: MV    (d_val),I
        MV    X,line
        MV    A,(d_val+1)
        CALL  hex_2
        MV    A,(d_val)
        CALL  hex_2
        MV    A,0
        MV    [X++],A
        RET
hex_2:  MV    (d_add),A
        SWAP  A
        CALL  hex_1
        MV    A,(d_add)
hex_1:  AND   A,$0F
        CMP   A,10
        JRC   hex_0
        ADD   A,7
hex_0:  ADD   A,'0'
        MV    [X++],A
        RET

; ${L("I → line に 10 進（先頭の 0 は付けない）。", "I to line as decimal, with no zeros in front.")}
to_dec: MV    (d_val),I
        MV    X,line
        MV    Y,powers
        MV    (d_got),0
        MV    (d_sum),5
dec_1:  MV    (d_add),'0'
        MV    I,[Y++]
dec_2:  MV    BA,(d_val)
        SUB   BA,I
        JRC   dec_3
        MV    (d_val),BA
        INC   (d_add)
        JR    dec_2
dec_3:  CMP   (d_add),'0'
        JRNZ  dec_4
        CMP   (d_got),1
        JRZ   dec_4
        CMP   (d_sum),1         ; ${L("1 の位は 0 でも書く", "The last digit is always written")}
        JRNZ  dec_5
dec_4:  MV    (d_got),1
        MV    A,(d_add)
        MV    [X++],A
dec_5:  DEC   (d_sum)
        JRNZ  dec_1
        MV    A,0
        MV    [X++],A
        RET
powers: DW    10000,1000,100,10,1

; ---- ${L("画面とキー", "Screen and keys")} ----
; ${L("画面を消して、X から 0 で終わる文字列を 1 行ずつ出す（空の文字列で終わり）。", "Clears the screen and shows texts from X, a line each, until an empty one.")}
show:   PUSHU X
        CALL  cls
        POPU  X
        MV    (BL),0
        MV    (BH),0
show_1: MV    A,[X]
        CMP   A,0
        JRZ   show_2
        MV    A,(BH)
        PUSHU A
        CALL  print             ; ${L("X は次の文字列へ進む", "X goes on to the next text")}
        POPU  A
        INC   A
        MV    (BH),A
        MV    (BL),0
        JR    show_1
show_2: RET

cls:    MVW   (CX),DEV_SCRN
        MV    IL,SCRN_CLEAR
        CALLF IOCS
        RET

; ${L("X の文字列を (BL) 桁、(BH) 行に出す。X は 0 の次へ進む。", "Shows the text at X at column (BL), row (BH). X goes past its 0.")}
print:  PUSHU X
        MV    Y,0
prt_1:  MV    A,[X++]
        CMP   A,0
        JRZ   prt_2
        INC   Y
        JR    prt_1
prt_2:  MV    (d_next),X
        POPU  X
        MVW   (CX),DEV_SCRN
        MV    IL,SCRN_PUTS
        CALLF IOCS
        MV    X,(d_next)
        RET

; ${L("キーを 1 つ待つ。A = 文字。", "Waits for a key: A = its character.")}
get_key:
        MVW   (CX),DEV_KYBD
        MV    A,$80             ; ${L("押されるまで待つ", "Until one is pressed")}
        MV    IL,KYBD_READ
        CALLF IOCS
        RET

; ${L("2 行目に 1 行入力して line に置く（7 文字まで）。ON/BRK なら C=1。", "A line typed on the second row, to line (up to 7 characters). C=1 for ON/BRK.")}
input:  MV    (d_len),0
inp_1:  CALL  inp_draw
        CALL  get_key
        CMP   A,KEY_BRK
        JRZ   inp_brk
        CMP   A,KEY_ENTER
        JRZ   inp_ok
        CMP   A,KEY_BS
        JRZ   inp_bs
        CMP   A,$21
        JRC   inp_1             ; ${L("文字でない", "Not a character")}
        CMP   A,$7F
        JRNC  inp_1
        CMP   (d_len),7
        JRNC  inp_1
        CALL  inp_at
        MV    [X],A
        INC   (d_len)
        JR    inp_1
inp_bs: CMP   (d_len),0
        JRZ   inp_1
        DEC   (d_len)
        JR    inp_1
inp_ok: CALL  inp_at
        MV    A,0
        MV    [X],A
        RC
        RET
inp_brk:
        SC
        RET
inp_at: PUSHU A                 ; X = line + (d_len)
        MV    X,line
        MV    A,(d_len)
        ADD   X,A
        POPU  A
        RET
inp_draw:
        CALL  inp_at            ; ${L("カーソルの代わりの _ と、消した跡の空白", "A _ for a cursor, and a blank over what was deleted")}
        MV    A,'_'
        MV    [X++],A
        MV    A,' '
        MV    [X++],A
        MV    A,0
        MV    [X++],A
        MV    X,line
        MV    (BL),0
        MV    (BH),1
        JP    print

; ---- ${L("データ", "Data")} ----
; ${L("内部 RAM。IOCS を呼ぶと変わる D4h〜DFh は使わない", "Internal RAM; not D4h-DFh, which IOCS uses")}
d_val   EQU   $20               ; ${L("数（2 バイト）", "A number, 2 bytes")}
d_sum   EQU   $22
d_add   EQU   $24
d_got   EQU   $26
d_len   EQU   $27
d_next  EQU   $28               ; ${L("3 バイト", "3 bytes")}
t_menu: DB    "${name.toUpperCase()}",0
        DB    "1  DEC -> HEX",0
        DB    "2  HEX -> DEC",0
        DB    "Q  QUIT",0
        DB    0
t_hex:  DB    "DECIMAL (0-65535)?",0,0
t_dec:  DB    "HEXADECIMAL (0-FFFF)?",0,0
t_bad:  DB    "NOT A NUMBER",0
t_key:  DB    "PRESS ANY KEY",0
line:   DS    16
        END
`;

const appTests = (name: string): string => `{
  // ${L("e500 test か、テスト エクスプローラーで動かす。", "Run with e500 test or the Test Explorer.")}
  "program": "${name}.asm",
  "tests": [
    { "name": "${L("10 進を読む", "Reads decimal")}", "call": "to_num", "return": "near", "memory": { "line": "255\\u0000" }, "expect": { "registers": { "I": 255, "C": 0 } } },
    { "name": "${L("いちばん大きい数", "The largest number")}", "call": "to_num", "return": "near", "memory": { "line": "65535\\u0000" }, "expect": { "registers": { "I": 65535, "C": 0 } } },
    { "name": "${L("大きすぎる", "Too large")}", "call": "to_num", "return": "near", "memory": { "line": "65536\\u0000" }, "expect": { "registers": { "C": 1 } } },
    { "name": "${L("数でない", "No number")}", "call": "to_num", "return": "near", "memory": { "line": "12A\\u0000" }, "expect": { "registers": { "C": 1 } } },
    { "name": "${L("空", "Empty")}", "call": "to_num", "return": "near", "memory": { "line": "\\u0000" }, "expect": { "registers": { "C": 1 } } },
    { "name": "${L("16 進を読む", "Reads hexadecimal")}", "call": "hex_num", "return": "near", "memory": { "line": "BEC\\u0000" }, "expect": { "registers": { "I": "$BEC", "C": 0 } } },
    { "name": "${L("16 進が 5 桁", "Five hexadecimal digits")}", "call": "hex_num", "return": "near", "memory": { "line": "10000\\u0000" }, "expect": { "registers": { "C": 1 } } },
    { "name": "${L("16 進にする", "To hexadecimal")}", "call": "to_hex", "return": "near", "registers": { "I": "$0A5F" }, "expect": { "memory": { "line": "0A5F\\u0000" } } },
    { "name": "${L("10 進にする", "To decimal")}", "call": "to_dec", "return": "near", "registers": { "I": 1024 }, "expect": { "memory": { "line": "1024\\u0000" } } },
    { "name": "${L("0 を 10 進に", "Zero to decimal")}", "call": "to_dec", "return": "near", "registers": { "I": 0 }, "expect": { "memory": { "line": "0\\u0000" } } },
    { "name": "${L("メニュー", "The menu")}", "basic": "CALL &HBE000", "maxCycles": 1536000, "expect": { "screen": ["DEC -> HEX", "QUIT"] } },
    { "name": "${L("255 を入れる", "Enters 255")}", "basic": "CALL &HBE000", "maxCycles": 1536000, "keys": ["1", "2", "5", "5", "ENTER"], "expect": { "screen": ["00FF", "PRESS ANY KEY"] } },
    { "name": "${L("消して入れ直す", "Deletes and enters again")}", "basic": "CALL &HBE000", "maxCycles": 1536000, "keys": ["2", "F", "0", "BS", "ENTER"], "expect": { "screen": ["15", "PRESS ANY KEY"] } },
    { "name": "${L("終わる", "Quits")}", "basic": "CALL &HBE000", "maxCycles": 1536000, "keys": ["Q"], "expect": { "screen": ">" } }
  ]
}
`;

// In BASIC, the machine's own characters only: its comments are English.
const basicApp = (name: string): string => `10 REM *** ${name.toUpperCase()} ***
20 CLEAR:WAIT 0:M=50
30 DIM A$(M)*16,V(M),Q$(M)*16,W(M):N=0
100 REM --- MENU ---
110 ON ERROR GOTO 0:CLS:PRINT "${name.toUpperCase()}";N;"ITEMS"
120 PRINT "1 ADD  2 LIST  3 TOTAL"
130 PRINT "4 SAVE 5 LOAD  Q QUIT"
140 K$=INKEY$:IF K$="" THEN 140
150 IF K$="Q" THEN CLS:END
160 K=VAL K$:IF K<1 OR K>5 THEN 140
170 CLS:ON K GOSUB 200,300,400,600,700
180 GOTO 110
200 REM --- ADD ---
210 IF N=M THEN PRINT "FULL":GOSUB 900:RETURN
220 B$="":INPUT "NAME=";B$:IF B$="" THEN RETURN
230 V$="":INPUT "VALUE=";V$:IF V$="" THEN RETURN
240 GOSUB 800:GOSUB 850:IF E=1 THEN PRINT "NOT A NUMBER":GOSUB 900:RETURN
250 REM ADD B$ AND V TO THE LIST
260 N=N+1:A$(N)=LEFT$(B$,16):V(N)=V:RETURN
300 REM --- LIST ---
310 IF N=0 THEN PRINT "NO ITEMS":GOSUB 900:RETURN
320 FOR I=1 TO N:PRINT LEFT$(A$(I)+"                    ",20);V(I)
330 IF I/3=INT (I/3) OR I=N THEN GOSUB 900:CLS
340 NEXT I:RETURN
400 REM --- TOTAL ---
410 GOSUB 500:PRINT "TOTAL  =";T
420 IF N>0 THEN PRINT "AVERAGE=";T/N
430 GOSUB 900:RETURN
500 REM T = THE SUM OF V(1)-V(N)
510 T=0:FOR I=1 TO N:T=T+V(I):NEXT I:RETURN
600 REM --- SAVE TO E: ---
610 ON ERROR GOTO 980
620 OPEN "E:ITEMS" FOR OUTPUT AS #1:PRINT #1,N
630 FOR I=1 TO N:PRINT #1,A$(I):PRINT #1,V(I):NEXT I
640 CLOSE:ON ERROR GOTO 0:PRINT "SAVED":GOSUB 900:RETURN
700 REM --- LOAD FROM E:, THE LIST IS KEPT WHEN IT FAILS ---
710 ON ERROR GOTO 980
720 OPEN "E:ITEMS" FOR INPUT AS #1:INPUT #1,C
730 IF C<0 OR C>M THEN CLOSE:ON ERROR GOTO 0:PRINT "NOT A LIST":GOSUB 900:RETURN
740 IF C>0 THEN FOR I=1 TO C:INPUT #1,Q$(I):INPUT #1,W(I):NEXT I
750 CLOSE:ON ERROR GOTO 0:N=C
760 IF N>0 THEN FOR I=1 TO N:A$(I)=Q$(I):V(I)=W(I):NEXT I
770 PRINT "LOADED":GOSUB 900:RETURN
800 REM A FILE CANNOT KEEP COMMAS AND QUOTES IN B$
810 IF LEN B$=0 THEN RETURN
820 FOR I=1 TO LEN B$:C$=MID$(B$,I,1):IF C$="," OR C$=CHR$ 34 THEN C$="."
830 IF I=1 THEN D$=C$ ELSE D$=D$+C$
840 NEXT I:B$=D$:RETURN
850 REM V = THE NUMBER IN V$, E=1 WHEN IT IS NONE
860 E=1:V=0:IF LEN V$>12 THEN RETURN
870 FOR I=1 TO LEN V$:C$=MID$(V$,I,1)
880 IF (C$<"0" OR C$>"9") AND C$<>"." AND (C$<>"-" OR I>1) THEN I=99
890 NEXT I:IF I<99 AND V$<>"-" AND V$<>"." THEN V=VAL V$:E=0
895 RETURN
900 REM --- WAIT FOR A KEY ---
910 IF INKEY$<>"" THEN 910
920 IF INKEY$="" THEN 920
930 RETURN
980 REM --- FILE ERROR ---
985 PRINT "FILE ERROR";ERN:IF ERN=75 THEN PRINT "INIT E: FIRST"
990 CLOSE:RESUME 995
995 ON ERROR GOTO 0:GOSUB 900:RETURN
`;

const basicAppTests = (name: string): string => `{
  // ${L("e500 test で動かす。サブルーチンは call に行番号を書く。", "Run with e500 test. A subroutine is called by its line.")}
  "program": "${name}.bas",
  "tests": [
    { "name": "${L("メニュー", "The menu")}", "maxCycles": 1536000, "expect": { "state": "running", "screen": ["1 ADD", "Q QUIT"] } },
    { "name": "${L("終わる", "Quits")}", "maxCycles": 1536000, "keys": ["Q"], "expect": { "state": "ended" } },
    { "name": "${L("品目が多すぎる", "Too many items")}", "basic": "CLS:M=50:N=50:GOTO 200", "maxCycles": 1536000, "expect": { "screen": "FULL" } },
    { "name": "${L("品目がない", "No items")}", "basic": "CLS:N=0:GOTO 300", "maxCycles": 1536000, "expect": { "screen": "NO ITEMS" } },
    { "name": "${L("加える", "Adds one")}", "basic": "DIM A$(50)*16,V(50)", "call": 250, "variables": { "N": 1, "B$": "PEN", "V": 120 }, "expect": { "variables": { "N": 2, "A$(2)": "PEN", "V(2)": 120 } } },
    { "name": "${L("カンマと引用符", "Commas and quotes")}", "call": 800, "variables": { "B$": "A,B\\"C" }, "expect": { "variables": { "B$": "A.B.C" } } },
    { "name": "${L("数を読む", "Reads a number")}", "call": 850, "variables": { "V$": "-12.5" }, "expect": { "variables": { "E": 0, "V": -12.5 } } },
    { "name": "${L("数でない", "No number")}", "call": 850, "variables": { "V$": "1/0" }, "expect": { "variables": { "E": 1 } } },
    { "name": "${L("空の名前で戻る", "An empty name goes back")}", "maxCycles": 1536000, "keys": ["1", "P", "ENTER", "5", "ENTER", "wait:1", "1", "ENTER", "wait:1"], "expect": { "state": "running", "variables": { "N": 1 } } },
    { "name": "${L("合計", "The total")}", "basic": "DIM V(50)\\nV(1)=100:V(2)=20.5:V(3)=-1", "call": 500, "variables": { "N": 3 }, "expect": { "variables": { "T": 119.5 } } }
  ]
}
`;

const basicGame = (name: string): string => `10 REM *** ${name.toUpperCase()}: CATCH THE STARS ***
20 CLEAR:CLS:WAIT 0:RANDOMIZE
30 RESTORE 900:READ N:DIM C$(N)*36
40 FOR I=1 TO N:READ C$(I):NEXT I
50 S=0:T=10:X=15:U=RND 30:V=0:W=0:O=X
60 GOSUB 500
100 REM --- MAIN LOOP ---
110 K$=INKEY$:IF K$="Q" THEN 160
120 GOSUB 200:GOSUB 300:GOSUB 500
130 IF T>0 THEN 110
160 LOCATE 11,1:PRINT "GAME OVER";:LOCATE 11,2:PRINT "SCORE";S;
170 BEEP 1,60,200
180 IF INKEY$<>"" THEN 180
190 IF INKEY$="" THEN 190
195 CLS:END
200 REM --- MOVE THE BASKET: X ---
210 IF K$=CHR$ 15 AND X>0 THEN X=X-1
220 IF K$=CHR$ 14 AND X<28 THEN X=X+1
230 RETURN
300 REM --- THE STAR FALLS: U,V ---
305 W=W+1:IF W<4 THEN RETURN
310 W=0:GCURSOR (U*6,V*8+7):GPRINT C$(2);:V=V+1:IF V<3 THEN RETURN
320 IF U>=X AND U<=X+2 THEN S=S+1:BEEP 1,5,60
330 T=T-1:U=RND 30:V=0:RETURN
500 REM --- DRAW ---
510 IF O<>X THEN GCURSOR (O*6,31):GPRINT C$(4);
520 GCURSOR (X*6,31):GPRINT C$(3);:O=X
530 GCURSOR (U*6,V*8+7):GPRINT C$(1);
540 LOCATE 32,0:PRINT "SCORE";:LOCATE 32,1:PRINT S;
550 LOCATE 32,2:PRINT "LEFT";:LOCATE 32,3:PRINT T;" ";
560 RETURN
900 REM --- PICTURES: STAR, ITS BLANK, BASKET, ITS BLANK ---
910 DATA 4
920 DATA "2A1C7F1C2A00","000000000000"
930 DATA "FFFFC0C0C0C0C0C0C0C0C0C0C0C0C0C0FFFF"
940 DATA "000000000000000000000000000000000000"
`;

const basicGameTests = (name: string): string => `{
  "program": "${name}.bas",
  "tests": [
    { "name": "${L("始まる", "It starts")}", "maxCycles": 2304000, "expect": { "state": "running", "screen": "SCORE", "variables": { "N": 4, "C$(1)": "2A1C7F1C2A00" } } },
    { "name": "${L("右へ動く（▶ は 0Eh）", "Moves right (the key is 0Eh)")}", "call": 200, "variables": { "X": 15, "K$": "\\u000e" }, "expect": { "variables": { "X": 16 } } },
    { "name": "${L("左端では動かない", "Stays at the left end")}", "call": 200, "variables": { "X": 0, "K$": "\\u000f" }, "expect": { "variables": { "X": 0 } } },
    { "name": "${L("受けると 1 点", "Catching one counts")}", "basic": "DIM C$(4)*36", "call": 300, "variables": { "X": 10, "U": 11, "V": 2, "W": 3, "S": 0, "T": 5 }, "expect": { "variables": { "S": 1, "T": 4, "V": 0 } } },
    { "name": "${L("右にずれると取れない", "Missed on the right")}", "basic": "DIM C$(4)*36", "call": 300, "variables": { "X": 10, "U": 13, "V": 2, "W": 3, "S": 0, "T": 5 }, "expect": { "variables": { "S": 0, "T": 4 } } },
    { "name": "${L("落ちている途中", "On its way down")}", "basic": "DIM C$(4)*36", "call": 300, "variables": { "X": 10, "U": 11, "V": 0, "W": 3, "S": 0, "T": 5 }, "expect": { "variables": { "V": 1, "T": 5 } } },
    { "name": "${L("終わると点が出る", "Shows the score at the end")}", "basic": "S=7:GOTO 160", "keys": ["SPACE"], "expect": { "state": "ended" } },
    { "name": "${L("Q でやめる", "Q quits")}", "maxCycles": 768000, "keys": ["Q", "wait:1"], "expect": { "screen": "GAME OVER" } }
  ]
}
`;

/** A frame around the screen, to see that the file is the one shown. */
function framePicture(): Uint8Array {
  const dots = new Uint8Array(WIDTH * HEIGHT);
  for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) if (x === 0 || y === 0 || x === WIDTH - 1 || y === HEIGHT - 1) dots[y * WIDTH + x] = 1;
  return encodeLcd(dots);
}

export function templates(): Template[] {
  return [
    { id: "app", icon: "window", label: L("アプリ", "Application"), detail: L("メニュー、1 行入力、計算、結果の表示。テスト付き", "A menu, a line of input, a sum and its result, with tests"), files: n => [{ name: `${n}.asm`, content: app(n) }, { name: `${n}.e500test.json`, content: appTests(n) }] },
    { id: "basicapp", icon: "list-selection", label: L("BASIC のアプリ", "Application in BASIC"), detail: L("メニュー、入力、一覧、合計、ファイルへの保存。テスト付き", "A menu, input, a list, a total, a file, with tests"), files: n => [{ name: `${n}.bas`, content: basicApp(n) }, { name: `${n}.e500test.json`, content: basicAppTests(n) }] },
    { id: "game", icon: "game", label: L("キャラクタを動かすゲーム", "Game with sprites"), detail: L("背景（.lcd）、キャラクタ（.spr）、キー、当たり判定、点数、音", "A background (.lcd), sprites (.spr), keys, collisions, a score, sound"), files: n => [{ name: `${n}.asm`, content: game(n) }, { name: `${n}.lcd`, content: fieldPicture() }, { name: `${n}p.spr`, content: FACE() }, { name: `${n}s.spr`, content: STAR() }] },
    { id: "basicgame", icon: "game", label: L("BASIC のゲーム", "Game in BASIC"), detail: L("DATA に書いたキャラクタ、キー、点数、音。テスト付き", "Characters in DATA, keys, a score, sound, with tests"), files: n => [{ name: `${n}.bas`, content: basicGame(n) }, { name: `${n}.e500test.json`, content: basicGameTests(n) }] },
    { id: "screen", icon: "device-mobile", label: L("画面を使うプログラム", "Screen"), detail: L("背景の絵（.lcd）、点の描画、キー入力", "A background picture (.lcd), drawing dots, reading keys"), files: n => [{ name: `${n}.asm`, content: screen(n) }, { name: `${n}.lcd`, content: framePicture() }] },
    { id: "text", icon: "symbol-string", label: L("文字を表示", "Text"), detail: L("IOCS で 1 行表示する", "Shows a line through IOCS"), files: n => [{ name: `${n}.asm`, content: text(n) }] },
    { id: "routine", icon: "beaker", label: L("BASIC から呼ぶルーチン", "Routine for BASIC"), detail: L("POKE / PEEK で値を受け渡す。テスト付き", "Takes values by POKE and PEEK, with tests"), files: n => [{ name: `${n}.asm`, content: routine(n) }, { name: `${n}.e500test.json`, content: routineTests(n) }] },
    { id: "minimal", icon: "file-code", label: L("最小", "Minimal"), detail: L("BASIC へ戻るだけのプログラム", "A program that only returns to BASIC"), files: n => [{ name: `${n}.asm`, content: minimal(n) }] }
  ];
}
