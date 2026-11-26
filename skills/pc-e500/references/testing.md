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
| `program` | `.asm` か `.bas`（このファイルからの相対パス） |
| `name` | 必須、重ならない名前 |
| `call` | 呼ぶルーチン（ラベル、アドレス、式）。省くと START → MAIN → 先頭 |
| `return` | `far`（`RETF`、既定）か `near`（`RET`） |
| `registers`、`memory` | 呼ぶ前に入れる値。`memory` のキーはラベルか式、値は `[1,2]` か `"ABC"`。**`"(score)": [1,0]` のように括弧を付けると内部 RAM**（00h〜EEh） |
| `basic` | `call` の代わりに、プロンプトで打つ行（`\n` で複数行） |
| `keys` | `basic` の後に 1 つずつ押すキー（0.2 秒押して 1 秒待つ） |
| `maxCycles` | 使ってよいサイクル（768000 = 1 秒。既定 5 秒。行を打つ時間は含まない）。終わらないゲームでは短くする |
| `expect` | `registers`（`A` `IL` `BA` `I` `X` `Y` `U` `S` `P` `F` `C` `Z`）、`memory`、`screen`（文字列か配列）、`picture`（`.lcd` / `.pixels`） |

## BASIC のテスト

```jsonc
{
  "program": "star.bas",
  "tests": [
    { "name": "入力", "type": "12\n18\n", "expect": { "state": "ended", "screen": "GCD= 6", "variables": { "G": 6 } } },
    { "name": "当たり判定", "call": 300, "variables": { "X": 10, "U": 11, "V": 2 }, "expect": { "variables": { "S": 1 } } },
    { "name": "右へ動く", "call": 200, "variables": { "X": 15, "K$": "\u000e" }, "expect": { "variables": { "X": 16 } } },
    { "name": "始まる", "maxCycles": 2304000, "expect": { "state": "running", "screen": "SCORE" } },
    { "name": "やめる", "maxCycles": 768000, "keys": ["Q", "wait:1"], "expect": { "screen": "GAME OVER" } },
    { "name": "エラー", "basic": "GOTO 9999", "expect": { "error": "Undefined line" } }
  ]
}
```

| 項目 | 内容 |
|---|---|
| （省く） | `RUN` する |
| `call` | サブルーチンの行番号か `"*ラベル"`。`GOSUB` して終わる（テストのときだけ、最後に行を足して呼ぶ） |
| `basic` | 打つ行を変える（`"S=7:GOTO 160"` など。プロンプトから `GOSUB` はできない）。`call` と一緒に書くと、呼ぶ前の準備（`"DIM A$(50)*16"` など） |
| `variables` | 始める前に入れる変数。`"A": 5`、`"B$": "HI"`。矢印キーの文字は `"\u000e"`（右）、`"\u000f"`（左）、`"\u0004"`（上）、`"\u0005"`（下） |
| `type` | `INPUT` などに打つ文字。`\n` は RETURN |
| `keys` | 押すキー。`"wait:1"` は 1 秒待つ |
| `expect` | `variables`、`screen`、`picture`、`memory`、`state`（`ended` `running` `error`）、`error`（エラーの文の一部） |

- `state` を書かなければ、**BASIC のエラーで止まると失敗**になる。動き続けているのは失敗にしない（`call` は戻らないと失敗）。暴走はいつも失敗。
- `RUN` は `A`〜`Z` の外の変数を消すので、`variables` は `call` か `GOTO` のテストで使う。
- `RND` を使うものは、変数を入れて `call` で確かめる。
- `lint` のエラーがあると、テストは始まらない。

## 気を付けること

- テストは 1 件ずつ、書き込んだ直後の状態から始まる。
- ゲームの変数（内部 RAM）は `"memory": { "(ball_x)": [100] }` で入れて、`expect` の `memory` で調べる。`game_start` を通さずにルーチンだけを呼べる。
- `screen` は、画面のどこかにあればよい（部分一致）。**打った行の文字にも一致する**ので、`CLS:…:PRINT "N=";PEEK …` のように目印を付けて、`"N= 7"` を期待する。
- BASIC の 1 行は、数が多いと `Line buffer overflow` になる。長いものは `\n` で分ける。
- 端の値を入れる: 0、255、桁上がり、空の文字列、画面の端。
- 失敗すると、期待した値と実際の値、戻らないときは止まっているアドレスとラベルが出る。
