# PC-E500シリーズ用逆アセンブラ

SC62015（ESR-L）の機械語を、同じプロジェクトの `Assembler` で再アセンブル可能なソースへ変換します。
Windows x64用GUIとCLI（`app/E500Disassembler.exe`、`app/e500dasm.exe`）は、自己完結型で1ファイル70〜120 MBあるためリポジトリには含めていません。[GitHub Releases](https://github.com/litchi-gh/pc-e500_tools/releases) からダウンロードして `app/` に置くか、`.uild.cmd`（.NET 10 SDKが必要）でビルドすると `app/` に生成されます。配布済みEXEの実行に.NETやPythonは不要です。

## どちらを使うか

- 画面でファイルを選んで実行する場合：`E500Disassembler.cmd`（GUI）
- PowerShellやバッチ処理から実行する場合：`e500dasm.cmd`（CLI）

## GUI

PowerShellで `DisAssembler` フォルダへ移動し、`E500Disassembler.cmd` または `app\E500Disassembler.exe` を起動します。GUIにはコマンドライン引数はありません。

```powershell
cd DisAssembler
.\E500Disassembler.cmd
```

1. 入力ファイルを選ぶか、ウィンドウへドロップします。
2. `RAWデータ` または `CE-140F SAVE M（16バイトヘッダ付き）` を選びます。
3. RAWの場合だけ、開始アドレスを16進数で指定します。
4. 出力先を選び、`逆アセンブル` を押します。

入力先頭がSAVE Mのシグネチャなら、ファイル選択時にCE-140F形式へ自動で切り替えます。最終的な形式はドロップダウンで選択できます。
結果はASMファイルへ保存し、画面下部にもプレビューします。

## CLIの最短手順

入力形式によって必要な引数が異なります。

- ヘッダなしの生バイナリ（RAW）：`--format raw` と、ロードされる開始アドレス `--org` が必要
- CE-140FのLOAD M用ファイル：`--format ce140f` が必要。開始アドレスは16バイトヘッダから読み取るため `--org` は指定しない

```powershell
cd DisAssembler

# RAW。開始アドレスは必須
.\e500dasm.cmd program.bin --format raw --org B8000 -o program.asm

# CE-140FからSAVE Mした16バイトヘッダ付きファイル
.\e500dasm.cmd program.bas --format ce140f -o program.asm

# 往復確認
..\Assembler\e500asm.cmd program.asm -o rebuilt.bin
```

リポジトリ直下から実行する場合は次のように指定します。

```powershell
.\DisAssembler\e500dasm.cmd program.bin --format raw --org B8000 -o program.asm
```

配布済みの `app\e500dasm.exe` を直接実行しても同じです。

## コマンドライン書式と引数

```text
e500dasm 入力ファイル --format raw|ce140f [オプション]
```

入力ファイルはオプション名を付けない**位置引数**で、指定できるのは1つです。オプションは入力ファイルの前後どちらにも指定できます。
パスに空白がある場合は二重引用符で囲みます。

| 引数・オプション | 必須 | 内容 |
|---|---:|---|
| `入力ファイル` | はい | 逆アセンブルするRAWまたはCE-140Fファイル。オプション名を付けずに1つ指定 |
| `-f raw\|ce140f`, `--format raw\|ce140f` | はい | 入力形式。`raw` はヘッダなし生バイナリ、`ce140f` は16バイトヘッダ付きLOAD M用ファイル。`save-m` も `ce140f` の別名として使用可能 |
| `--org ADDRESS` | RAWのみ必須 | RAWデータの先頭バイトを配置するアドレス。CE-140Fでは指定不可 |
| `-o PATH`, `--output PATH` | いいえ | 出力ASM。省略時は入力と同じ場所・名前で拡張子を `.asm` に変更 |
| `--no-labels` | いいえ | 分岐先ラベルを生成せず、アドレスを数値のまま出力 |
| `--no-addresses` | いいえ | 各行のコメントにアドレスを出力しない |
| `--no-bytes` | いいえ | 各行のコメントに機械語バイト列を出力しない |
| `-h`, `--help` | いいえ | ヘルプを表示して終了 |
| `--version` | いいえ | バージョンを表示して終了 |

`ADDRESS` は常に16進数です。`B8000`、`$B8000`、`&B8000`、`0xB8000`、`0B8000h` の形式を使えます。
PowerShellでは `$` が変数記号、`&` が演算子なので、`--org B8000` または `--org 0xB8000` が簡単です。

### 出力を読みやすく／簡潔にする例

```powershell
# ラベルは生成するが、行末のアドレスと機械語コメントを省略
.\e500dasm.cmd program.bin -f raw --org 0xB8000 --no-addresses --no-bytes

# 分岐先も含め、数値アドレスのまま出力
.\e500dasm.cmd program.bin -f raw --org 0xB8000 --no-labels

# 全オプションを確認
.\e500dasm.cmd --help
```

正常終了は0、エラーは1です。エラー時は既存出力を更新しません。

## CE-140F SAVE M形式

`FileConverter`で実機PC-E650のSAVE Mデータから確認された形式を使用します。

| オフセット | 内容 |
|---|---|
| 0～4 | `FF 00 06 01 10` |
| 5～7 | 本体長、24ビット・リトルエンディアン |
| 8～10 | 開始アドレス、24ビット・リトルエンディアン |
| 11～15 | `FF FF FF 00 0F` |

シグネチャ、固定末尾、宣言長と実ファイル長、SC62015の20ビット空間への収まりを検証します。不一致は警告で続行せずエラーにするため、誤った位置から解析しません。
出力ASMにはヘッダをコメントとして残します。Assemblerが生成するのはヘッダを除いたRAW本体です。SAVE M形式へ戻す場合は、`FileConverter\ce140conv.exe bin2bas --addr ...` を使用してください。

## 出力方針

- ファイル先頭から末尾まで線形に解析します。コードとデータを自動判別する再帰解析ではありません。
- JP/JPF/CALL/CALLF/JR系の分岐先が命令行の先頭なら `Lxxxxx` ラベルを生成します。
- PREバイトは後続命令とまとめ、内部RAMの絶対/BP/PX/PY指定として出力します。
- 予約命令、不正なレジスタ組合せ、末尾で途切れた命令、Assemblerが同じバイト列を生成できない表現は `DB` にします。
- 各命令をAssemblerの命令エンコーダへ戻して一致を確認してから、命令として出力します。このため、出力全体は元のRAW本体へバイト完全一致で戻せます。

`DB`へのフォールバックは、データ損失を防ぐための正常な動作です。コードとデータの境界が分かる場合は、生成後にラベルやDB領域を手で整えると読みやすくなります。

## ビルドとテスト

.NET 10 SDKを使います。

```powershell
.\build.cmd
.\build.cmd -TestOnly
```

テストでは全256オペコード、決定的な32KiBの任意バイト列、途中で切れた命令、全PRE形式、RAW、CE-140Fヘッダ、ラベル生成を確認します。逆アセンブル出力をAssemblerのCore APIで再アセンブルし、開始アドレスと全バイトの一致を検証します。既存Assemblerのテストも同時に実行します。

実機での実行動作は今回未検証です。命令の意味と符号化はSHARP ESR-L Instruction Manual、およびプロジェクト内の既存SC62015エミュレータと照合しています。
