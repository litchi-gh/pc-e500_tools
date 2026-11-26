# 20. 逆引きレシピ

この章は「こうしたい」から探す、ASM の短いルーチン集です。料理の本のように、必要なページだけを開いて使ってください。そのままコピーして使えます。全部が 1 つのファイル [recipes.asm](../../Samples/Assembler/Recipes/recipes.asm) に入っていて、[テスト](../../Samples/Assembler/Recipes/recipes.e500test.json) 28 件で動きを確かめてあります。

[目次へ戻る](README.md)

## 20.1 使い方

- どれも `CALL` で呼び、`RET` で戻ります。
- 内部 RAM の 20h〜2Fh を作業に使います。BASIC から呼ぶプログラムでは始めに退避します（[例題 8](03_ASSEMBLER_TUTORIAL.md#311-例題-8-内部-ram)）。`game_start` を使うプログラムでは、20h〜5Fh を INCLUDE ファイルも使うので、アドレスを自分の変数の場所（00h〜1Fh）に変えます。
- 使うレジスタは変わります。残したいものは呼ぶ前に `PUSHU` で預けます。

```asm
        MV    A,12
        MV    IL,34
        CALL  mul8              ; BA = 408
```

## 20.2 一覧

メモリ: [埋める](#mem_fill)、[コピーする](#mem_copy)、[速くコピーする](#fast_copy)、[比べる](#mem_comp)、[和を求める](#checksum)

計算: [掛け算（8 ビット）](#mul8)、[割り算（16 ビット）](#div16)、[16 ビットを比べる](#cmp16)、[絶対値](#abs8)、[符号付きで比べる](#scmp8)、[ビットを逆にする](#bit_rev)、[1 のビットを数える](#bit_count)、[並べ替える](#sort8)

文字: [数を 10 進の文字にする](#to_dec)、[数を 16 進の文字にする](#to_hex)、[10 進の文字を数にする](#to_num)、[文字列の長さ](#str_len)、[文字列を比べる](#str_comp)

流れ: [番号でジャンプ先を選ぶ](#dispatch)、[時間待ち](#wait_ms)

画面、キー、音: [文字列を表示する](#print)、[数を表示する](#print_num)、[Y か N を待つ](#yes_no)、[音を鳴らす](#beep)

## 20.3 メモリ

<a id="mem_fill"></a>

### 埋める

| 呼ぶもの | 渡すもの | 返るもの |
|---|---|---|
| `mem_fill` | `X` 先頭、`I` バイト数、`A` 値 | メモリ |

```asm
; X から I バイトを A で埋める。
mem_fill:
        MV    [X++],A
        DEC   I
        JRNZ  mem_fill
        RET
```

`DEC` は 0 になると `Z` = 1 にします。`I` に 0 を入れると 65536 回になるので、0 のことがあるなら先に調べます。画面を消す、配列を 0 にする、などに使います。

<a id="mem_copy"></a>

### コピーする

| 呼ぶもの | 渡すもの | 返るもの |
|---|---|---|
| `mem_copy` | `X` 元、`Y` 先、`I` バイト数 | メモリ |

```asm
; X から Y へ I バイトコピーする（アドレスの小さい方から）。
mem_copy:
        MV    A,[X++]
        MV    [Y++],A
        DEC   I
        JRNZ  mem_copy
        RET
```

アドレスの小さい方からコピーするので、先が元より少し後ろで重なっていると、コピーする前のデータを壊します。そのときは後ろからコピーします（`X` と `Y` を終わりの次にして `[--X]`、`[--Y]`）。

<a id="fast_copy"></a>

### 速くコピーする

| 呼ぶもの | 渡すもの | 返るもの |
|---|---|---|
| `fast_copy` | `X` 元、`Y` 先、`A` = 64 バイトの回数 | メモリ |

```asm
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
```

`MVL` は内部 RAM と外部メモリの間で一度に移せます。1 バイトずつの約 3 分の 1 の時間で済みます。内部 RAM の 60h〜9Fh を使うので、必要なら退避します。

<a id="mem_comp"></a>

### 比べる

| 呼ぶもの | 渡すもの | 返るもの |
|---|---|---|
| `mem_comp` | `X`、`Y` 先頭、`I` バイト数 | `Z` = 1 なら同じ |

```asm
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
```

違う所で止まるので、`X` は違った場所の次を指しています。

<a id="checksum"></a>

### 和を求める

| 呼ぶもの | 渡すもの | 返るもの |
|---|---|---|
| `checksum` | `X` 先頭、`I` バイト数 | `BA` 和（下位 16 ビット） |

```asm
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
```

`ADD` の桁上がりを `ADC` で上位に足します。データが壊れていないかの確認に使えます。

## 20.4 計算

<a id="mul8"></a>

### 掛け算（8 ビット）

| 呼ぶもの | 渡すもの | 返るもの |
|---|---|---|
| `mul8` | `A`、`IL` | `BA` = 積 |

```asm
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
```

かける数を 1 ビットずつ見て、1 なら足し、かけられる数を 2 倍にしていきます。筆算を 2 進でやるのと同じです。足し算を繰り返すより速く、時間がほぼ一定です。

<a id="div16"></a>

### 割り算（16 ビット）

| 呼ぶもの | 渡すもの | 返るもの |
|---|---|---|
| `div16` | `BA` 割られる数、`I` 割る数（1〜32767） | `BA` 商、`I` 余り |

```asm
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
```

`SHL` は `C` を通して 4 バイトつながるので、割られる数の上のビットが 1 つずつ余りに入ります。引けたら商のビットを 1 にします。0 で割ると商は 65535 になるので、先に調べます。

<a id="cmp16"></a>

### 16 ビットを比べる

| 呼ぶもの | 渡すもの | 返るもの |
|---|---|---|
| `cmp16` | `BA`、`I` | `C`、`Z` |

```asm
; BA と I を比べる。BA < I なら C = 1、同じなら Z = 1。
cmp16:  MV    ($20),BA
        CMPW  ($20),I
        RET
```

レジスタどうしの 16 ビットの `CMP` はないので、内部 RAM に置いて `CMPW` を使います。値は変わりません。

<a id="abs8"></a>

### 絶対値

| 呼ぶもの | 渡すもの | 返るもの |
|---|---|---|
| `abs8` | `A`（符号付き） | `A` |

```asm
; A（符号付き）の絶対値。
abs8:   TEST  A,$80
        JRZ   abs_1
        XOR   A,$FF
        INC   A
abs_1:  RET
```

負の数は全ビットを反転して 1 を足すと正になります（2 の補数）。

<a id="scmp8"></a>

### 符号付きで比べる

| 呼ぶもの | 渡すもの | 返るもの |
|---|---|---|
| `scmp8` | `A`、`IL` | `C`、`Z` |

```asm
; A と IL を符号付きで比べる。A < IL なら C = 1、同じなら Z = 1。
scmp8:  MV    ($20),IL
        XOR   ($20),$80         ; 符号を反転すると、符号なしの順になる
        XOR   A,$80
        MV    ($21),A
        CMP   ($21),($20)
        RET
```

`CMP` は符号なしで比べます。どちらも一番上のビットを反転すると、−128〜127 が 0〜255 の順に並びます。

<a id="bit_rev"></a>

### ビットを逆にする

| 呼ぶもの | 渡すもの | 返るもの |
|---|---|---|
| `bit_rev` | `A` | `A` |

```asm
; A のビットの並びを逆にする。
bit_rev:
        MV    ($20),A
        MV    IL,8
rev_1:  SHR   ($20)             ; 一番下のビットを C へ
        SHL   A                 ; C を一番下に入れる
        DEC   IL
        JRNZ  rev_1
        RET
```

右へ出したビットを左から入れ直します。絵を上下や左右に返すのに使えます。

<a id="bit_count"></a>

### 1 のビットを数える

| 呼ぶもの | 渡すもの | 返るもの |
|---|---|---|
| `bit_count` | `A` | `A` = 0〜8 |

```asm
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
```

<a id="sort8"></a>

### 並べ替える

| 呼ぶもの | 渡すもの | 返るもの |
|---|---|---|
| `sort8` | `X` 先頭、`A` 個数 | メモリ |

```asm
; X から A 個のバイトを小さい順に並べ替える。
sort8:  CMP   A,0
        JRZ   sort_4
        MV    ($20),A
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
```

隣どうしを比べて入れ替える方法（バブルソート）です。入れ替えがなくなったら終わります。

## 20.5 文字

<a id="to_dec"></a>

### 数を 10 進の文字にする

| 呼ぶもの | 渡すもの | 返るもの |
|---|---|---|
| `to_dec` | `I` 数、`X` 書く先 | `X` の先に 5 文字 |

```asm
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
```

10000、1000、100、10、1 を引けるだけ引き、引けた回数を数字にします。頭の 0 を空白にしたいときは、書いた後で先頭から `"0"` を `" "` に変えます。

<a id="to_hex"></a>

### 数を 16 進の文字にする

| 呼ぶもの | 渡すもの | 返るもの |
|---|---|---|
| `to_hex` | `A` 数、`X` 書く先 | `X` の先に 2 文字 |

```asm
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
```

`SWAP` で上の 4 ビットから順に変えます。`hex_1` は 1 桁のルーチンとしても使えます。

<a id="to_num"></a>

### 10 進の文字を数にする

| 呼ぶもの | 渡すもの | 返るもの |
|---|---|---|
| `to_num` | `X` 文字列 | `BA` 数 |

```asm
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
```

1 桁読むたびに、それまでの数を 10 倍して足します。10 倍は「2 倍 + 8 倍」です。65535 を超える数は考えていません。

<a id="str_len"></a>

### 文字列の長さ

| 呼ぶもの | 渡すもの | 返るもの |
|---|---|---|
| `str_len` | `X` 文字列（0 で終わる） | `I` |

```asm
; X の文字列（0 で終わる）の長さを I に返す。
str_len:
        MV    I,0
len_1:  MV    A,[X++]
        CMP   A,0
        JRZ   len_2
        INC   I
        JR    len_1
len_2:  RET
```

<a id="str_comp"></a>

### 文字列を比べる

| 呼ぶもの | 渡すもの | 返るもの |
|---|---|---|
| `str_comp` | `X`、`Y` 文字列 | `Z`、`C` |

```asm
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
```

文字コードの順です。片方が先に終わると、0 の方が小さくなります。

## 20.6 流れ

<a id="dispatch"></a>

### 番号でジャンプ先を選ぶ

| 呼ぶもの | 渡すもの | 返るもの |
|---|---|---|
| `dispatch` | `A` 番号 | − |

```asm
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
```

`DP` でアドレスを 3 バイトずつ並べ、番号 × 3 を足して読みます。`CMP` と `JRZ` を並べるより短く、番号が増えても速さが変わりません。番号が表の外に出ないことは、呼ぶ側で確かめます。

<a id="wait_ms"></a>

### 時間待ち

| 呼ぶもの | 渡すもの | 返るもの |
|---|---|---|
| `wait_ms` | `A` ミリ秒 | − |

```asm
; 約 A ミリ秒待つ（1〜255）。
wait_ms:
        MV    I,760             ; 1 サイクルは約 1.3 マイクロ秒
        WAIT
        DEC   A
        JRNZ  wait_ms
        RET
```

`WAIT` は `I` を 0 まで数える命令です。その間は割り込みが入らないので、1 ミリ秒ずつに分けています。

## 20.7 画面、キー、音

<a id="print"></a>

### 文字列を表示する

| 呼ぶもの | 渡すもの | 返るもの |
|---|---|---|
| `print` | `X` 文字列、`(BL)` 桁、`(BH)` 行 | − |

```asm
; X の文字列（0 で終わる）を (BL) 桁、(BH) 行に表示する。
print:  PUSHU X
        CALL  str_len
        MV    Y,I
        POPU  X
        MVW   (CX),DEV_SCRN
        MV    IL,SCRN_PUTS
        CALLF IOCS
        RET
```

IOCS の `SCRN_PUTS` は長さも要るので、先に数えます。

<a id="print_num"></a>

### 数を表示する

| 呼ぶもの | 渡すもの | 返るもの |
|---|---|---|
| `print_num` | `I` 数、`(BL)` 桁、`(BH)` 行 | − |

```asm
; I の数を (BL) 桁、(BH) 行に表示する。
print_num:
        MV    X,number
        CALL  to_dec
        MV    X,number
        JP    print
number: DB    "00000",0
```

`JP print` は「呼んで、すぐ戻る」の短い書き方です。`print` の `RET` で、`print_num` を呼んだ所へ戻ります。

<a id="yes_no"></a>

### Y か N を待つ

| 呼ぶもの | 渡すもの | 返るもの |
|---|---|---|
| `yes_no` | − | `Z` = 1 なら Y |

```asm
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
```

ほかのキーは無視して待ち続けます。

<a id="beep"></a>

### 音を鳴らす

| 呼ぶもの | 渡すもの | 返るもの |
|---|---|---|
| `beep` | `A` ミリ秒 | − |

```asm
; 4 kHz を約 A ミリ秒鳴らす。
beep:   AND   (SCR),BZ_OFF
        OR    (SCR),BZ_4K
        CALL  wait_ms
        AND   (SCR),BZ_OFF
        RET
```

`SCR` の 3 ビットでブザーを鳴らします。ほかのビットは変えません。

## 20.8 短い書き方

| やりたいこと | 書き方 | 注意 |
|---|---|---|
| `A` を 0 に | `MV A,0` | 2 バイト |
| `BA` を 0 に | `SUB BA,BA` | 2 バイト。フラグが変わる |
| `IL` を `A` へ | `MV ($20),IL` と `MV A,($20)` | 直接は移せない |
| 4 倍 | `ADD A,A` を 2 回 | |
| 8 で割る | `RC`、`SHR A` を 3 回 | 毎回 `RC` を置く |
| 8 の余り | `AND A,7` | 2 のべき乗だけ |
| `A` × 5 | `MV ($20),A`、`ADD A,A`、`ADD A,A`、`ADD A,($20)` | |
| 符号を変える | `XOR A,$FF`、`INC A` | |
| 大きい方 | `CMP` と `JRNC`、`MV` | [例題 5](03_ASSEMBLER_TUTORIAL.md#38-例題-5-比べる) |
| 0〜9 を文字に | `ADD A,'0'` | |
| 小文字を大文字に | `AND A,$DF` | 英字だけのとき |
| 偶数か | `TEST A,1` と `JRZ` | |
| 1 と 0 を交互に | `XOR A,1` | |
| 無条件に呼んで戻る | `CALL x` と `RET` の代わりに `JP x` | |
| 2 つの値を入れ替える | `EX A,B`、`EX X,Y`、`EX ($20),($21)` | |
| 外部メモリのビットを立てる | `OR [label],$80` | 絶対アドレスだけ |
| ROM バージョンを読む | `MV A,[$FFFF0]`、`MV IL,[$FFFF1]` | |

## 20.9 BASIC のレシピ

| やりたいこと | 書き方 |
|---|---|
| 押されたキーを待つ | `10 K$=INKEY$:IF K$="" THEN 10` |
| 離されるのを待つ | `10 IF INKEY$<>"" THEN 10` |
| 1〜6 の乱数 | `RND 6`（先に `RANDOMIZE`） |
| 右詰めで表示 | `PRINT RIGHT$("     "+STR$ S,6)` |
| 改行しないで表示 | 最後に `;` |
| 16 進で表示 | `PRINT HEX$ A` |
| 2 バイトを読む | `PEEK A+256*PEEK (A+1)` |
| 時間待ち | `FOR I=1 TO 500:NEXT I` |
| 四角を塗る | `LINE (X,Y)-(X+7,Y+7),BF` |
| 四角を消す | `LINE (X,Y)-(X+7,Y+7),R,BF` |
| 絵を置く | `GCURSOR (X,Y):GPRINT "…";`（`Y` は絵の下端） |

動く例は [Samples](../../Samples/README.md) にあります。
