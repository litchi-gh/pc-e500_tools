# ゲームを作る

`e500 new game NAME` から始める（背景 `.lcd`、キャラクタ `.spr` 2 つ、当たり判定、点数、音が入っている）。完成した例は `Samples/Assembler/StarCatch`、`Meteor`、`NineBox`。**市販のゲームの名前、キャラクタ、面をまねない。**

## 流れ

```asm
start:  CALL  game_start        ; 内部 RAM の退避、割り込み停止
        …準備（screen_load、screen_keep、変数の初期値）…
loop:   CALL  pad_read
        TEST  (pad_now),PAD_BREAK
        JPNZ  quit
        …動かす、当たり判定…
        CALL  screen_restore    ; 背景に戻す
        …sprite_draw、text_draw、number_draw…
        CALL  screen_show       ; LCD へ
        MV    A,3
        CALL  game_wait         ; 約 48 ms にそろえる
        JP    loop
quit:   CALL  game_end
        RC
        RETF
        INCLUDE "game.inc"
        INCLUDE "screen.inc"
        INCLUDE "sprite.inc"
        INCLUDE "pad.inc"
        INCLUDE "text.inc"
        INCLUDE "random.inc"
```

先頭に `INCLUDE "hardware.inc"`。INCLUDE ファイルはソースの隣になくても見つかる（拡張に入っている）。`e500asm` でアセンブルするときは `-I` で `inc` を指す。

## 内部 RAM（game_start〜game_end の間）

| アドレス | 使うもの |
|---|---|
| 00h〜1Fh | **自分の変数**。`face_x EQU $00`、`(face_x)`。2 バイトの変数は続きも空ける |
| 20h〜5Fh | INCLUDE ファイルの変数 |
| 60h〜BFh | `screen.inc`、`text.inc` の作業用。変数を置かない |

始めに必ず初期値を入れる（前回の値が残る）。

## 呼ぶもの

| 名前 | 渡す | 働き |
|---|---|---|
| `game_start` / `game_end` | − | 必ず対にする。終わる道はすべて `game_end` を通す |
| `game_wait` | `A` = 回数 | `A` × 約 16 ms ごとにそろえる |
| `sound_on` / `sound_off` | `A` = `BZ_2K` / `BZ_4K` | 音。止め忘れに注意 |
| `screen_load` | `X` = `.lcd` | 絵を仮想画面へ |
| `screen_keep` / `screen_restore` | − | 背景を覚える / 戻す（5 ms） |
| `screen_clear` / `screen_show` | − | 消す / LCD へ（22 ms） |
| `sprite_draw` | `X` = `.spr`、`A` = コマ、`(sprite_x)` 2 バイト、`(sprite_y)` | 描く。A B I X Y が変わる |
| `box_hit` | `(hit_ax)` `(hit_ay)` `(hit_aw)` `(hit_ah)` と `hit_b…` | 重なれば C = 1 |
| `pad_read` | − | `(pad_now)`、`(pad_new)`（押した瞬間）。`PAD_LEFT` 01h `PAD_RIGHT` 02h `PAD_UP` 04h `PAD_DOWN` 08h `PAD_A` 10h（SPACE） `PAD_B` 20h（RETURN） `PAD_C` 40h（Z） `PAD_BREAK` 80h |
| `text_draw` | `X` = 0 で終わる文字列、`(text_x)` 1 バイト 0〜234 ドット、`(text_row)` 0〜3 | 文字 |
| `number_draw` | `I` | 右詰め 5 桁 |
| `random_below` | `IL` | `A` = 0〜IL−1。`random_seed`（外部メモリの 2 バイト、0 以外）を始めに変える |

仮想画面は `screen` から 960 バイト。x 桁、r 行（縦 8 ドット）は `screen+r*240+x`、ビット 0 が上。

## 絵のファイル

人がドットエディタで描けるので、まずテンプレートのものを使うか、次の形のファイルをスクリプトで作る。

**`.lcd`**（1024 バイト、240 × 32）

```python
def lcd(dots):                     # dots[y][x] = 0/1
    b = bytearray(1024)
    for y in range(32):
        for x in range(240):
            if dots[y][x]:
                c = 1 if x < 64 or x >= 176 else 0
                col = x if x < 64 else x - 64 if x < 120 else 175 - x if x < 176 else 239 - x
                row = y + (32 if x >= 120 else 0)
                b[c * 512 + row // 8 * 64 + col] |= 1 << (row % 8)
    return bytes(b)
```

**`.spr`**: 4 バイトのヘッダー（幅、高さ ÷ 8、コマ数、マスク 1/0）。続けてコマごと、縦 8 ドットの行ごと、左から。マスクありは 1 桁 2 バイト（マスク、絵）。点灯 = マスク 1・絵 1、背景を消す = マスク 1・絵 0、透明 = マスク 0・絵 0。

```python
def spr(w, h, frames, mask=True):  # frame[y][x]: 0 透明、1 点灯、2 消灯
    b = bytearray([w, h // 8, len(frames), int(mask)])
    for f in frames:
        for r in range(h // 8):
            for x in range(w):
                col = [f[r * 8 + k][x] for k in range(8)]
                if mask: b.append(sum((v != 0) << k for k, v in enumerate(col)))
                b.append(sum((v == 1) << k for k, v in enumerate(col)))
    return bytes(b)
```

## 確かめ方

- `e500 run game.asm --seconds 2 --keys SPACE,wait:2,RIGHT --png s.png` の PNG を見る。
- `--keys ON/BRK` で `ended` になる（BASIC に戻れる）こと。
- 変数は内部 RAM なので、テストでは `"(ball_x)": [100]` の形で入れて調べる（[testing.md](testing.md)）。1 回ぶんの動きを `RET` で終わるルーチンに分けておくと、そのまま呼べる。
- `test` に、タイトルの `picture`、`ON/BRK` で戻る、計算のルーチン（当たり判定、得点）を入れる。
- 大きさは `e500 bin` で見る。`BFBFFh` を越えたらエラーになるので `ORG` を下げる（32 KB の機種で 12 KB 程度まで）。
