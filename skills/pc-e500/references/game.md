# ゲームを作る

`e500 new 名前 --kind game` から始める（背景 `.lcd`、キャラクタ `.spr` 2 つ、当たり判定、点数、音が入っている）。**市販のゲームの名前、キャラクタ、面をまねない。**

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
        CALL  game_wait         ; 16 ms の 3 回分
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
| `game_wait` | `A` = 回数 | `A` × 約 16 ms 待つ（前に呼んでからの時間は 16 ms まで数える） |
| `sound_on` / `sound_off` | `A` = `BZ_2K` / `BZ_4K` | 音。止め忘れに注意 |
| `screen_load` | `X` = `.lcd` | 絵を仮想画面へ |
| `screen_keep` / `screen_restore` | − | 背景を覚える / 戻す（5 ms） |
| `screen_clear` / `screen_show` | − | 消す / LCD へ（22 ms） |
| `screen_part` | `(screen_part_x)` 左端 0〜239、`(screen_part_w)` 幅（x + 幅 ≦ 240）、`A` = 行のビット（ビット 0〜3） | 仮想画面の四角い一部だけを LCD へ（1 バイト 14〜15 サイクル）。`screen.inc` に入っている。仮想画面を自分で持つなら `screen` を 960 バイト取って `screen_part.inc` だけを INCLUDE |
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

## 速くする（1 秒に 10 コマを超えるとき）

上の流れ（`screen_show` 22 ms、`game_wait`）で足りないときだけ使う。詳しい説明と測った値は `docs/analysis/30_SPEED.md`。

- **予算**: 1 秒 768000 サイクル、16 ms = 12288。1 秒 20 コマなら 1 コマ 36864 サイクルに、読む、動かす、描く、送るを全部入れる。
- **測る**: `e500` はサイクル数を出さない。重いルーチンを `"call"` のテストにし、`"maxCycles"` を予算にする（超えると `… サイクル以内に戻りませんでした（PC=…）` で失敗し、止まった所も分かる）。上限を下げていけば、かかるサイクルも絞り込める。
- **LCD に直接書く**: IOCS は遅い（1 画面 `SCRN_ROW_WRITE` 4 行で 24057 サイクル、`SCRN_DOTS_WRITE` 960 回で約 1060000）。アドレスは `0A000h` 台（`0A008h` 中央の命令、`0A009h` 状態、`0A00Ah` データ、`0A004h`〜`0A006h` 両端）でも `2000h` 台でもよい。`2000h`〜`3FFFh` は CPU が 1 回 7 ステートに遅くする範囲で、`0A000h` 台は ROM の表示の処理が使うアドレス。
- **書く間隔は 1 バイト 14 サイクル以上**: LCD は 1 バイト受け取ると BUSY になり、その間のデータを捨てる。実機（PC-E650）で 6〜10 サイクルおきは取りこぼし、14 で取りこぼさなかった。エミュレータは BUSY を真似しないので、エミュレータでは崩れない。展開して詰めて書かない。`screen_show`（15 サイクル）と `screen_part`（14〜15）はそのままで安全。
- **送るループ**: 自分で書くなら、データのアドレスを Y に入れて `MV A,[X++]`、`MV [Y],A`、`DEC IL`、`JRNZ` で 14 サイクル。右半分（x = 120〜239）は桁が逆向きなので `MV A,[--X]` で 15。1 画面 15995 サイクルで、`screen_show`（16442）とほぼ同じ。転送そのものはこれ以上速くならないので、送る量を減らす。ページと桁を決めた後は BUSY を待つ。ふつうは `screen_part` を使えばよい。
- **変わった所だけ送る**: `screen_part` で、毎コマ変わる所（例: 道）だけを毎回送り、計器などは描いた行のビットを立てて、その行だけ送る（ビットの変数をそのまま `A` に渡せる）。`screen_part` は汎用のぶん、専用に書いた送り方より転送が 2 割ほど遅い（例のゲームで 1 コマ 9202 → 11296 サイクル）。値が前と同じなら描かない。描き直しは 1 コマに 1 か所ずつ回す。道と左右の計器の画面で、1 画面 17640 → 8445 サイクルになった。
- **BP = 0**: 内部 RAM は `(BP+n)` の形が 1 バイト短く 1 サイクル速い。始めに `($EC)` を外部メモリに預けて 0 にし（`game_start` の退避は 00h〜BFh だけ）、BASIC に戻る前に必ず戻す。テストでは `"memory": { "($EC)": [0] }` を入れる。
- **コマの時間**: `game_wait` の代わりに、ISR の MTI（16 ms ごと）を自分で数える。印は 1 回分しか残らないので、16 ms より短い間隔で見る（描く 1 ライン、物 1 つ、送る 1 行ごとに呼ぶ）。コマの終わりで 2 回以上たつまで待ち、たった回数を次のコマの進む量と残り時間に掛ける。重いコマがあってもゲームの速さが変わらない。
- **描く**: 縦 8 ドットのバイト単位で OR する、ラインごとの値は表を引くか足し算で進める（掛け算を避ける）、汎用の `sprite_draw` が重ければその大きさ専用の描き方にする（車 1 台 2287 → 778 サイクル）。
- **止めずに鳴らす**: `BZ_2K` / `BZ_4K` は CPU が何もしなくても鳴る（効果音は「種類、コマ数」の列を 1 コマに 1 つ進める）。ほかの高さは、MTI を見るルーチンの中で `(acc) += (step)` があふれたら `XOR (SCR),$10`（step が大きいほど高い）。`WAIT` で半周期を待つ鳴らし方は、その間ゲームが止まる。
- **`MV BA,…` の後の `MV A,…`**: A は BA の下位バイトなので値が壊れる。

## 確かめ方

- `e500 run game.asm --seconds 2 --keys SPACE,wait:2,RIGHT --png s.png` の PNG を見る。見せたい画面（タイトル、プレイ中、終わり）は `screens/` に残す。
- `--keys ON/BRK` で `ended` になる（BASIC に戻れる）こと。
- 変数は内部 RAM なので、テストでは `"(ball_x)": [100]` の形で入れて調べる（[testing.md](testing.md)）。1 回ぶんの動きを `RET` で終わるルーチンに分けておくと、そのまま呼べる。
- `test` に、タイトルの `picture`、`ON/BRK` で戻る、計算のルーチン（当たり判定、得点）を入れる。
- 大きさは `e500 bin` で見る。`BFBFFh` を越えたらエラーになるので `ORG` を下げる（32 KB の機種で 12 KB 程度まで）。
