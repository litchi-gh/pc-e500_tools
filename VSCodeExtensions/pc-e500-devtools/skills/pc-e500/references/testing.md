# *.e500test.json

プログラムの隣に `名前.e500test.json` を置き、`e500 test .` で実行する。`//` の注釈を書ける。

```jsonc
{
  "program": "add.asm",
  "tests": [
    { "name": "3 + 4", "call": "add2", "return": "near",
      "registers": { "A": 3, "IL": 4 },
      "expect": { "registers": { "A": 7, "C": 0 } } },
    { "name": "BASIC から", "basic": "CLS:POKE &HBEC00,30,12:CALL &HBEC03:PRINT PEEK &HBEC02",
      "expect": { "screen": "42" } },
    { "name": "タイトル", "basic": "CALL &HBE000", "maxCycles": 2304000,
      "expect": { "picture": "title.lcd" } },
    { "name": "終わる", "basic": "CALL &HBE000", "maxCycles": 2304000, "keys": ["SPACE", "ON/BRK"],
      "expect": { "screen": ">" } }
  ]
}
```

| 項目 | 内容 |
|---|---|
| `name` | 必須、重ならない名前 |
| `call` | 呼ぶルーチン（ラベル、アドレス、式）。省くと START → MAIN → 先頭 |
| `return` | `far`（`RETF`、既定）か `near`（`RET`） |
| `registers`、`memory` | 呼ぶ前に入れる値。`memory` のキーはラベルか式、値は `[1,2]` か `"ABC"`。**`"(score)": [1,0]` のように括弧を付けると内部 RAM**（00h〜EEh） |
| `basic` | `call` の代わりに、プロンプトで打つ行（`\n` で複数行） |
| `keys` | `basic` の後に 1 つずつ押すキー（0.2 秒押して 1 秒待つ） |
| `maxCycles` | 使ってよいサイクル（768000 = 1 秒。既定 5 秒。行を打つ時間は含まない）。終わらないゲームでは短くする |
| `expect` | `registers`（`A` `IL` `BA` `I` `X` `Y` `U` `S` `P` `F` `C` `Z`）、`memory`、`screen`（文字列か配列）、`picture`（`.lcd` / `.pixels`） |

- テストは 1 件ずつ、書き込んだ直後の状態から始まる。
- ゲームの変数（内部 RAM）は `"memory": { "(ball_x)": [100] }` で入れて、`expect` の `memory` で調べる。`game_start` を通さずにルーチンだけを呼べる。
- `screen` は、画面のどこかにあればよい（部分一致）。**打った行の文字にも一致する**ので、`CLS:…:PRINT "N=";PEEK …` のように目印を付けて、`"N= 7"` を期待する。
- BASIC の 1 行は、数が多いと `Line buffer overflow` になる。長いものは `\n` で分ける。
- 端の値を入れる: 0、255、桁上がり、空の文字列、画面の端。
- 失敗すると、期待した値と実際の値、戻らないときは止まっているアドレスとラベルが出る。
