# SC62015 アセンブリの要点

## 形

```asm
        ORG   $BEC00            ; 機械語エリア。BFBFFh まで
        INCLUDE "iocs.inc"      ; IOCS、SCRN_PUTS、(BL) などの名前
start:  PUSHU IMR               ; 割り込みを止める
        MV    (CL),DEV_SCRN     ; デバイス
        MV    (CH),0
        MV    (BL),0            ; x（桁）
        MV    (BH),3            ; y（行）
        MV    IL,SCRN_PUTS      ; コマンド
        MV    X,msg
        MV    Y,msg_end-msg
        CALLF IOCS              ; C=1 なら A = エラー番号
        POPU  IMR
        RC                      ; エラーなし
        RETF                    ; BASIC へ
msg:    DB    "HELLO!"
msg_end:
        END
```

ラベルは行頭に `:` を付ける。命令、レジスタ、名前の大文字と小文字は区別しない。開始は `START`、`MAIN`、先頭の順。

## レジスタ

| 名前 | 幅 | 使い方 |
|---|---|---|
| `A` | 8 | 計算の中心。`B` は `MV A,B`、`MV B,A`、`EX A,B` だけ |
| `BA`、`I` | 16 | `IL` は `I` の下位 |
| `X`、`Y` | 20 | アドレス |
| `U`、`S` | 20 | スタック。`PUSHU`/`POPU`、`PUSHS F`。`CALL` は S を使う |
| `F` | 8 | ビット 0 = C、ビット 1 = Z |

`ADD`、`SUB` は左の幅が右の幅以上。16 ビットの数を 8 ビットから作るときは `MV I,0` / `MV BA,0` してから足す。

## オペランド

| 書き方 | 意味 |
|---|---|
| `5`、`$20`、`label` | 即値 |
| `(n)`、`(PX+n)`、`(PY+n)`、`(BP+n)` | 内部 RAM |
| `[label]`、`[X]`、`[X+n]`、`[X++]`、`[--X]` | 外部メモリ（X Y U S） |
| `[($30)]` | 内部 RAM 30h〜32h にあるアドレス |

- `[X++]` は移したバイト数だけ進む（`A` 1、`BA` 2、`X` 3、`MVL` は `I`）。
- `(n)` を 2 つ書く命令の配列の添字は、1 つ目が `PX`、2 つ目が `PY`。`PX` は `MV ($ED),値` で入れる。
- 2 バイトと 3 バイトの内部 RAM: `MVW (n),値`、`MVP (n),値`、`CMPW`、`CMPP`。
- `JR` は前後 255 バイト、`JP`/`CALL` は同じ 64 KB の中、`JPF`/`CALLF` はどこでも。

どの組み合わせがあるかは `e500 help 命令` で確かめる。

## よく使う形

```asm
; n 回くり返す（n は 1〜255。0 だと 256 回）
        MV    IL,n
loop:   …
        DEC   IL                ; C は変わらない
        JRNZ  loop

; 比べる（A と n）。C=1: A < n、Z=1: 等しい
        CMP   A,n
        JRC   less

; メモリをコピー（内部 RAM を通す）
        MV    I,64
        MVL   ($60),[X++]
        MV    I,64
        MVL   [Y++],($60)

; 内部 RAM を退避して使い、戻す
        MV    I,32
        MVL   [saved],($00)
        …
        MV    I,32
        MVL   ($00),[saved]
```

```asm
; BASIC から値を受け取り、返す: POKE &HBEC00,3,4:CALL &HBEC03:PRINT PEEK &HBEC02
        ORG   $BEC00
work:   DB    0,0,0
start:  MV    A,[work]
        MV    IL,[work+1]
        ADD   A,IL
        MV    [work+2],A
        RC
        RETF
        END
```

`CALL` に引数はない。値は決めたアドレスに置く。わざと BASIC のエラーにするなら、`MV A,番号`、`SC`、`RETF`（番号は `ERN` の値。21 = Division by Zero）。

## IOCS

`(CL)` = デバイス、`(CH)` = ドライブ、`IL` = コマンド、ほかの引数はコマンドごと。`CALLF IOCS`。名前は `iocs.inc`、引数は `e500 help SCRN_PUTS` などで見る。`e500 help DEV_SCRN` でデバイスのコマンド一覧。IOCS は A、BA、I、X、Y と内部 RAM D4h〜を変える。

## ハードウェア

`hardware.inc` に名前がある。LCD は 240 × 32 ドット、2 個のコントローラ（左右で向きが違う）。直接書くなら `screen.inc` を使う。キーは割り込み中の ROM に任せる（IOCS）か、割り込みを止めて `pad.inc` で直接読む。ブザーは `SCR`（FDh）のビット 6〜4。CPU は 768,000 サイクル/秒（1 サイクル 1.3 µs）。
