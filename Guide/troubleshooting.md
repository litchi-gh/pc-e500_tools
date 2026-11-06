# トラブルシューティング

メッセージと症状ごとの対処です。アセンブラのメッセージは実際の出力で、行の先頭に `ファイル(行番号): error:` が付きます。

[ガイドの目次へ戻る](README.md)

## e500asm のエラー

e500asm は最初のエラーで止まり、既存の出力ファイルは更新しません。VS Code 拡張を使うと、問題をまとめて確認できます。

| メッセージ | 原因 | 対処 |
|---|---|---|
| `Unsupported instruction or operands: MV A, IL` | その組み合わせの命令がない | `MV A,IL` / `MV IL,A` は CPU にない。内部 RAM を経由する |
| `Unsupported instruction or operands: FOO A` | 命令名の誤り | [命令リファレンス](../Analysis/SC62015.md#14-命令リファレンス)で確かめる |
| `Invalid number: 0b102` | 数字が基数に合わない | `h` なしの `0b` は 2 進数。16 進数なら `0B102h` と書く |
| `Undefined symbol: BEC00h` | 英字で始まる数値をシンボルと読んだ | `$BEC00` に書き換える。`h` 形式は数字で始める |
| `Undefined symbol: nowhere` | ラベルが未定義 | 綴りを確かめる。大文字小文字は区別しない |
| `Duplicate symbol: a` | 同じ名前を 2 回定義 | ローカルラベルの機能はないので、別の名前にする |
| `Relative branch out of range: -303 (allowed -255..255)` | `JR` が届かない | `JP` / `JPF` に変える |
| `Near branch crosses a 64 KiB segment; ...` | `JP` / `CALL` の分岐先が別のセグメント | `JPF` / `CALLF` に変える |
| `Instruction crosses a 64 KiB segment boundary` | 命令のバイト列が境界をまたぐ | `ORG` を変えて配置をずらす |
| `Overlapping output at B8001h` | 同じ番地へ 2 回出力 | `ORG` と `DS` の配置を見直す |
| `Value 256 outside -128..255` | 値が幅に収まらない | 値か命令の幅を見直す |

### `--org` のエラー

| メッセージ | 原因 | 対処 |
|---|---|---|
| `Origin must be 00000h..FFFFFh` | `--org` は 16 進数で、範囲を超えた | `--org 781312` のような 10 進数は使えない。`--org BEC00` にする |
| `Invalid address: XYZ` | 16 進数として読めない | `BEC00` や `0xBEC00` の形で書く |

`--org` は e500asm と e500dasm のどちらも常に 16 進数です。[番地の書き方の比較](workflows.md#番地の書き方はツールごとに違う)も参照してください。

## e500dasm のエラー

| メッセージ | 原因 | 対処 |
|---|---|---|
| `RAW input requires a start address (--org)` | RAW には番地が必要 | `--org BEC00` を付ける |
| `CE-140F file is shorter than its 16-byte header` | ヘッダ付きではないファイル | `--format raw` にする。`ce140conv info` で種類を確かめる |

出力に `DB` が混ざるのはエラーではありません。予約命令やデータの部分を、バイトを保ったまま出力しています。

## ce140conv

| 症状・メッセージ | 原因 | 対処 |
|---|---|---|
| `warning: no --addr given, using 0.` | `bin2bas` に番地がない | `--addr` を付ける。`0` のままだと `LOAD M` で 0 番地に読み込もうとする |
| `--addr must be 00000h..FFFFFh` | `--addr` は常に 16 進数で、`781312` のような 10 進数は範囲を超える | `--addr BEC00` のように 16 進数で書く |
| `error: input is shorter than a 16-byte header` | `bas2bin` にヘッダなしのファイルを渡した | `ce140conv info` で種類を確かめる |
| `bas2text` の結果が文字化けする | `SAVE` に `,A` を付けなかった | 実機で `SAVE "X:PROG.BAS",A` をやり直す |
| カナが違う文字になる | 文字コード表の配列が実機と違う | `charset_e500.tab` を修正する。再コンパイルは不要 |
| 日本語のソースが化ける | 文字コードの指定違い | Shift-JIS なら `--sjis` を付ける |

## 実機での症状

| 症状 | 原因 | 対処 |
|---|---|---|
| `LOAD` の最後で I/O エラー | ファイルの末尾に `1Ah` がある | `ce140conv info` の `eof marker` を確かめ、`text2bas` で作り直す |
| `LOAD` でエラー | 行番号で始まらない行、または 256 バイトを超える行がある | ソースを直す。VS Code 拡張でも確かめられる |
| `CALL` のあとメインメニューへ落ちる | `RET` で戻った | `RETF` に変える |
| `CALL` のあと BASIC のエラーが出る | `C=1` のまま戻った | 戻る直前に `RC` を置く |
| `CALL` で暴走する | `ORG` と `--addr` が違う、または読み込み先が違う | `ce140conv info` の `address` とソースの `ORG` を比べる |
| BASIC のプログラムが壊れる | 機械語エリアを確保していない、内部 RAM や `BP` を戻していない | [機械語エリアの確保](machine-language-primer.md#機械語エリアを確保する)と[内部 RAM](machine-language-primer.md#内部-ram) を確かめる |
| キーが効かない、時計が止まる | `IMR` を戻していない、または長い `MVL` / `WAIT` | `PUSHU IMR` と `POPU IMR` を対にする |
| 確保した機械語エリアが消えた | オールリセットした | もう一度確保する |
| `SHR` で上位に 1 が入る | `C` が回り込む 9 ビット回転 | 先に `RC` を置く |
| `ADCL` と `DADL` で結果が逆になる | 進む方向が違う（2 進は上へ、10 進は下へ） | [SC62015.md §14.2](../Analysis/SC62015.md#142-算術) を確かめる |

## Linux / macOS

| 症状・メッセージ | 原因 | 対処 |
|---|---|---|
| `build.sh` が `Permission denied` になる | ZIP で取得するなどして実行権限が消えた | `sh build.sh` で実行するか、`chmod +x build.sh` を実行する |
| `INCLUDE` や `INCBIN` で `File not found` | Linux はファイル名の大文字小文字を区別する | ソースの綴りを実際のファイル名に合わせる |
| `note: no charset_e500.tab found` | `ce140conv` と同じ場所にも、カレントにも表がない | `charset_e500.tab` を実行ファイルと同じ場所に置く |
| `this system's iconv cannot convert` | その環境の iconv に CP932 がない | `--sjis` を使わず、テキストを UTF-8 に変換してから渡す |
| `.lst`、`.sym`、`.hex`、逆アセンブル結果の改行が Windows と違う | 改行はその環境の形式で出力する | 内容は同じ。バイナリの出力は環境によらず同じ |

## VS Code 拡張

| 症状 | 原因 | 対処 |
|---|---|---|
| 診断が出ない | 拡張子が対象外 | 右クリックの「Pocket BASIC として開く」「PC-E500 アセンブリとして開く」を使う |
| 「e500asm でアセンブル」が動かない | 実行ファイルの場所が未設定 | `pocketAsm.assemblerPath` を設定する |
| `INCLUDE` で `ASM060` の警告が出る | 未保存のファイルでは解決しない | ファイルを保存する |
| e500asm の結果とアドレスが違う | 拡張は `--org` と `--fill` を使わない | ソースに `ORG` を書く |
