# メテオ

飛んでくる隕石を撃ちます。3 回当たると終わりです。作り方の説明は[ゲームを作る](../../../docs/manual/07_GAME.md#710-もう-1-本-メテオ)にあります。

![タイトル](../../../docs/images/samples/meteor-title.png)

![プレイ中](../../../docs/images/samples/meteor.png)

| キー | 働き |
|---|---|
| ▲ ▼ | 動く |
| SPACE | 始める、撃つ（1 発ずつ） |
| ON/BRK | BASIC に戻る |

16 点ごとに速くなります。当たった直後はしばらく点滅し、その間は当たりません。

| ファイル | 内容 |
|---|---|
| [meteor.asm](meteor.asm) | プログラム（`BD800h` から） |
| `meteor.lcd` | 背景 |
| `ship.spr`、`rock.spr`、`shot.spr` | 自機（2 コマ）、隕石（4 コマ）、弾 |
| [meteor.e500test.json](meteor.e500test.json) | テスト |

実機では、機械語エリアを 2400h バイト確保します（「BIN を作成」の出力に行が出ます）。

```basic
POKE &HBFE03,&H1A,&HFD,&H0B,&H00,&H24,&H00:CALL &HFFFD8
LOAD M "X:METEOR.BIN"
CALL &HBD800
```

## 変えてみる

| 変えること | 場所 |
|---|---|
| 隕石の数 | `ROCKS EQU 4`（8 まで。`init` の `SUB (temp),30` も合わせる） |
| 弾の速さ | `fire_1` の `8` |
| 残りの数 | `init` の `MV (lives),3`（`ships` の文字数も合わせる） |
| 無敵の長さ | `MV (flash),30` |
