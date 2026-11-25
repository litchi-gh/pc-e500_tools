// What "new program" starts from. The sources are tried in the emulator by the tests.
import { L } from "../l10n";
import { encodeLcd, HEIGHT, WIDTH } from "../lcd/lcdFile";
import { encodeSpr } from "../lcd/sprFile";

export type TemplateId = "minimal" | "text" | "screen" | "game" | "routine";
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
        MV    (KOH),0
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
        MV    (KOH),$08         ; ${L("KO11: ON/BRK は KI1", "KO11: ON/BRK is KI1")}
        NOP
        TEST  (KI),$02
        JRZ   k_6
        OR    (found),BREAK
k_6:    MV    (KOH),0
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
        MV    A,3               ; ${L("約 48 ミリ秒ごと", "About every 48 ms")}
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

/** A frame around the screen, to see that the file is the one shown. */
function framePicture(): Uint8Array {
  const dots = new Uint8Array(WIDTH * HEIGHT);
  for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) if (x === 0 || y === 0 || x === WIDTH - 1 || y === HEIGHT - 1) dots[y * WIDTH + x] = 1;
  return encodeLcd(dots);
}

export function templates(): Template[] {
  return [
    { id: "minimal", icon: "file-code", label: L("最小", "Minimal"), detail: L("BASIC へ戻るだけのプログラム", "A program that only returns to BASIC"), files: n => [{ name: `${n}.asm`, content: minimal(n) }] },
    { id: "text", icon: "symbol-string", label: L("文字を表示", "Text"), detail: L("IOCS で 1 行表示する", "Shows a line through IOCS"), files: n => [{ name: `${n}.asm`, content: text(n) }] },
    { id: "screen", icon: "device-mobile", label: L("画面を使うプログラム", "Screen"), detail: L("背景の絵（.lcd）、点の描画、キー入力", "A background picture (.lcd), drawing dots, reading keys"), files: n => [{ name: `${n}.asm`, content: screen(n) }, { name: `${n}.lcd`, content: framePicture() }] },
    { id: "game", icon: "game", label: L("キャラクタを動かすゲーム", "Game with sprites"), detail: L("背景（.lcd）、キャラクタ（.spr）、キー、当たり判定、点数、音", "A background (.lcd), sprites (.spr), keys, collisions, a score, sound"), files: n => [{ name: `${n}.asm`, content: game(n) }, { name: `${n}.lcd`, content: fieldPicture() }, { name: `${n}p.spr`, content: FACE() }, { name: `${n}s.spr`, content: STAR() }] },
    { id: "routine", icon: "beaker", label: L("BASIC から呼ぶルーチン", "Routine for BASIC"), detail: L("POKE / PEEK で値を受け渡す。テスト付き", "Takes values by POKE and PEEK, with tests"), files: n => [{ name: `${n}.asm`, content: routine(n) }, { name: `${n}.e500test.json`, content: routineTests(n) }] }
  ];
}
