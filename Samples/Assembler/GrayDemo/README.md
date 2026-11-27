# GrayDemo

INCLUDE ファイル [`gray.inc`](../../../docs/manual/06_INCLUDE_FILES.md#grayinc) の使い方です。4 階調（白、薄い灰色、濃い灰色、黒）の絵、キャラクタ 2 つ、点を描き、`gray_show` で 1 枚ずつ送り続けます。ON/BRK で BASIC に戻ります。

![狙う見え方](screens/aim.png)

上の画像は、3 枚の画面を平均した、目で見たときに狙う見え方です。エミュレータの画面には、そのとき送った 1 枚だけが出ます。

| ファイル | 内容 |
|---|---|
| [graydemo.asm](graydemo.asm) | 本体 |
| [make_data.py](make_data.py) | 絵とキャラクタ、テストで比べる画面を作る（`python make_data.py`） |
| pic_hi.lcd、pic_lo.lcd | 絵。濃さのビット 1 の面と、ビット 0 の面（ドットエディタで開ける） |
| ball.gsp | キャラクタ（16 × 16 ドット、2 コマ） |
| [graydemo_test.asm](graydemo_test.asm) | テストだけで呼ぶ入口（本体を INCLUDE する） |
| [graydemo.e500test.json](graydemo.e500test.json) | テスト 10 件 |

テストは、`gray_show` で送った 1 枚ずつの画面が `make_data.py` の作る画面と全ドット同じになること（3 枚と、4 回目に 1 枚目へ戻ること）、`gray_show_rows` が選んだ行だけを送ること、画面からはみ出すキャラクタ、`gray_pset` の位相、`gray_show` の速さ、ON/BRK で戻ることを確かめます。

`CALL &HBE000` で動きます。6,543 バイト（`BE000h`〜`BF98Eh`）です。
