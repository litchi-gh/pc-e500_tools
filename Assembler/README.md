# PC-E500シリーズ用クロスアセンブラ e500asm

SC62015（ESR-L）用のコマンドライン・クロスアセンブラです。
Windows x64用の実行ファイル `app/e500asm.exe` は、自己完結型で約70 MBあるためリポジトリには含めていません。
[GitHub Releases](https://github.com/litchi-gh/pc-e500_tools/releases) からダウンロードして `app/` に置くか、`.uild.cmd`（.NET 10 SDKが必要）でビルドすると `app/` に生成されます。
配布済みEXEの実行時の.NET・Pythonインストールは不要です。

## 最短の使い方

PowerShellでリポジトリの `Assembler` フォルダへ移動し、`e500asm.cmd` にASMファイルを渡します。
入力ファイルはオプション名を付けない**位置引数**です。

```powershell
cd Assembler

# examples\sum.asm をアセンブルし、既定名の examples\sum.bin を作る
.\e500asm.cmd examples\sum.asm

# 出力先を指定する
.\e500asm.cmd examples\sum.asm -o examples\sum.bin

# バイナリに加えてリストとシンボル表も作る
.\e500asm.cmd examples\sum.asm -o examples\sum.bin -l examples\sum.lst -s examples\sum.sym
```

リポジトリ直下から実行する場合は、コマンド名にも `Assembler\` を付けます。

```powershell
.\Assembler\e500asm.cmd .\Assembler\examples\sum.asm -o .\Assembler\examples\sum.bin
```

配布済みの `app\e500asm.exe` を直接実行しても同じです。配布済みEXEの実行に.NETやPythonは不要です。

## コマンドライン書式と引数

```text
e500asm 入力.asm [オプション]
```

指定できる入力ASMファイルは1つです。オプションは入力ファイルの前後どちらにも指定できます。
パスに空白がある場合は `"C:\My Programs\sample.asm"` のように二重引用符で囲みます。

| 引数・オプション | 必須 | 内容 |
|---|---:|---|
| `入力.asm` | はい | アセンブルするソースファイル。オプション名を付けずに1つ指定 |
| `-o PATH`, `--output PATH` | いいえ | 出力ファイル。省略時は入力と同じ場所・名前で、bin形式なら `.bin`、hex形式なら `.hex` |
| `-f bin\|hex`, `--format bin\|hex` | いいえ | 出力形式。`bin` はヘッダなし生バイナリ、`hex` はIntel HEX。既定は `bin` |
| `-l PATH`, `--listing PATH` | いいえ | アドレス、生成バイト、元ソースを記載したリストを別ファイルへ出力 |
| `-s PATH`, `--symbols PATH` | いいえ | シンボル表を別ファイルへ出力 |
| `--org VALUE` | いいえ | ソースに `ORG` がない場合の初期配置アドレス。既定は0。ソース内の `ORG` が優先 |
| `--fill VALUE` | いいえ | `DS`、`ALIGN`、複数の `ORG` 間の空きを埋める1バイト値。既定は0、範囲は0～255 |
| `--encoding NAME` | いいえ | ソース文字コード。既定は `utf-8`。Shift-JISは `shift_jis` |
| `-I DIRECTORY` | いいえ | `INCLUDE` / `INCBIN` の検索先を追加。複数回指定可能 |
| `-D NAME=VALUE` | いいえ | ソース外から定数を定義。複数回指定可能。`=VALUE` を省略すると値は1 |
| `-h`, `--help` | いいえ | ヘルプを表示して終了 |
| `--version` | いいえ | バージョンを表示して終了 |

`VALUE` には10進数のほか、`$B8000`、`&B8000`、`0xB8000`、`0B8000h` の16進数、`0b1010` の2進数を指定できます。
PowerShellでは `$` が変数記号、`&` が演算子なので、コマンドライン上では `--org B8000` または `--org 0xB8000` が簡単です。

### 指定例

```powershell
# Intel HEXを出力
.\e500asm.cmd examples\sum.asm --format hex --output examples\sum.hex

# ASMにORGがない場合の開始アドレスと、空き領域の埋め値を指定
.\e500asm.cmd source.asm --org 0xB8000 --fill 0xFF -o program.bin

# インクルード検索先、外部定数、Shift-JIS入力を指定
.\e500asm.cmd source.asm -I include -I common -D MODEL=500 -D DEBUG --encoding shift_jis

# 全オプションを確認
.\e500asm.cmd --help
```

`sum.asm` は10から1までの和を計算し、Aに55を残してRETする例です。
生成される11バイトは `08 00 09 0A 46 01 7C 01 1B 06 06`、配置アドレスは `B8000h` です。
このORGは例なので、実際にロードするときは確保済みの機械語領域に合わせて変更してください。

出力はヘッダなしの生バイナリ、または20ビットアドレスに対応したIntel HEXです。
生バイナリ自体にはロードアドレスが含まれません。表示されるoriginとリストを参照してください。
PC-E500のLOAD M用ファイルヘッダ、転送・実行機能、GUIは今回の本体には含めていません。
LOAD M用ファイルへ変換する場合は、アセンブル後に `..\FileConverter\ce140conv.exe bin2bas --addr 0xB8000 入力.bin 出力.bas` を使用します。

## 主な機能

- SC62015の転送、交換、算術、論理、シフト、分岐、スタック、CPU制御命令。
- 内部RAMの絶対／BP／PX・PY／BP+PX・PY指定とPREバイトの自動生成。
- 外部メモリの20ビット絶対、X/Y/U/S間接、変位、後置加算／前置減算、内部RAM間接。
- 前方参照ラベル、EQU定数、整数式、文字定数、INCLUDE、INCBIN。
- ORG、DB、DW、DP、DS、ALIGN、ASSERT、END。
- バイナリ、Intel HEX、アセンブルリスト、シンボル表。
- 行番号付きエラー、値の範囲、重複ラベル、循環定義、領域重複の検出。

## ソース記法

```asm
        ORG &B8000
COUNT   EQU 10
start:  MV A,0
        MV IL,COUNT
loop:   ADD A,IL
        DEC IL
        JRNZ loop
        RET
```

命令・レジスタ・シンボルは大文字小文字を区別しません。コメントは `;` から行末まで。
通常のラベルはコロン必須です。定数は `name EQU 式`、`name: EQU 式`、`name = 式` で定義します。
シンボル名は英字・数字・`_`・`.` を使用でき、先頭に数字は使えません。
`.` は普通の名前文字で、ローカルラベルのスコープ機能はありません。
レジスタ名やBP/PX/PYと同じ名前のシンボルは、オペランドで特別扱いされるため避けてください。

| 記法 | 意味 |
|---|---|
| `123` | 10進数 |
| `&B8000`, `$B8000`, `0xB8000`, `0B8000h` | 16進数（h形式は数字から開始） |
| `0b101010` | 2進数 |
| `'A'` | 1バイト文字定数 |
| `$`, `*` | 現在の行の配置アドレス |
| `LOW(式)`, `HIGH(式)`, `BANK(式)` | 下位8ビット、次の8ビット、上位4ビット |

式では括弧、単項 `+ - ~`、二項 `* / % + - << >> & ^ |` を使用できます。
乗除算、加減算、シフト、AND、XOR、ORの順に優先します。除算は整数除算です。
即値先頭の `#` は省略可能です。文字列中の `\n \r \t \0 \\ \" \' \xNN` に対応します。
比較演算子、マクロ、条件付きアセンブル、リンカ／再配置オブジェクトは未対応です。

### 内部RAMとPRE

| ソース | 意味 | 生成例 |
|---|---|---|
| `MV A,(&20)` | 内部RAM絶対20h | `30 80 20` |
| `MV A,(BP+&20)` | BPからの相対20h | `80 20` |
| `MV A,(PX+2)` | PXからの相対2 | `34 80 02` |
| `MV (PX+2),(PY+3)` | PX側にPY側から転送 | `37 C8 02 03` |
| `MV (BP+PX),(BP+PY)` | BPと各ポインタの和 | `25 C8 00 00` |

命令内の内部RAMオペランドは出現順に1番目がPX、2番目がPYを使用します。
内部RAMを1か所しか参照しない場合、ソース側でもPXです。
BP/PX/PYの変位は `-128..255` を許容し、下位8ビットで符号化します。
`(BP)` はBP相対オフセット0です。BPレジスタ自身への書き込みは `MV (&EC),値` と書きます。

`PRE &32` のような手動出力も可能です。ただし、その後の命令も通常どおり自動PREを生成します。
手動PREと併用する場合は、後続の内部オペランドを `(BP+変位)` と記述するなど、生成リストを確認してください。
予約コード20hはPREとして受け付けません。

### 外部メモリ

`[&B8000]`、`[X]`、`[X+5]`、`[Y-3]`、`[X++]`、`[--S]`、`[(&30)]`、`[(&30)+2]` に対応します。
添字レジスタにはX/Y/U/Sを使用します。変位の大きさは0..255です。
`MVL (内部RAM),[X]` と逆方向の形式は、CPU仕様に合わせ `[X+0]` に展開します。
Sレジスタと外部メモリのMVは絶対アドレス形式のみです。

`MV A,IL` / `MV IL,A` はCPU資料で禁止されているためエラーです。
汎用のレジスタ間MV/EXはBA/I/X/Y/U/S間に対応します。ADD/SUBは転送先が転送元以上の幅である必要があります。
PUSHU/POPUはA/IL/BA/I/X/Y/F/IMR、PUSHS/POPSはFのみ対応します。

### 分岐

- `JR label`：ラベルから変位を計算。基準はJRの先頭+2。変位は-255..255。
- `JR +10` / `JR -10`：基準からの変位を直接指定（先頭の符号で判定）。
- `JP label` / `CALL label`：同一64KiBセグメント内。16ビット値はそのセグメント内のオフセット扱いです。
- `JPF label` / `CALLF label`：20ビットの遠距離分岐。
- 条件分岐はJPZ/JPNZ/JPC/JPNC、JRZ/JRNZ/JRC/JRNC。

近距離命令がセグメントをまたぐとエラーです。JRの変位計算は同一セグメント内の16ビット折返しに対応します。
命令のバイト列そのものが64KiB境界をまたぐ配置はエラーにします。

## 疑似命令

| 命令 | 動作 |
|---|---|
| `ORG 式` | 配置アドレスを設定（0..FFFFFh） |
| `name EQU 式` | 定数定義。前方参照可、循環はエラー |
| `DB 式,"文字列",...` | 1バイトデータ。別名DEFB/BYTE |
| `DW 式,...` | 16ビット、リトルエンディアン。別名DEFW/WORD |
| `DP 式,...` | 24ビット、リトルエンディアン。20ビットアドレス格納にも使用 |
| `DS 長さ[,埋め値]` | 領域確保し埋める。別名DEFS/SPACE |
| `ALIGN 境界[,埋め値]` | アドレスを指定の倍数まで埋める |
| `INCLUDE "ファイル"` | ソースを挿入。相対パスは記述元ファイル基準 |
| `INCBIN "ファイル"[,オフセット[,長さ]]` | バイナリを挿入 |
| `ASSERT 式` | 式が0ならエラー |
| `END` | 入力終了。INCLUDE内で指定しても全体が終了 |

疑似命令は `.ORG` など先頭に `.` を付けても同じです。
DB/DW/DPおよび即値は、それぞれの幅の符号付き負数も許容します。
DWに20ビットラベルを格納するときは `DW label & $FFFF` と明示してください。
DBの文字列は0..255の文字値を直接出力し、PC-E500独自文字コードへの変換は行いません。
日本語ソースのコメントは使用できます。ソースの標準文字コードはUTF-8で、Shift-JISの場合は `--encoding shift_jis` を指定します。
INCLUDE/INCBINの引用符内のパスには `/` を使うと簡単です。Windowsの `\` を使う場合は、文字列エスケープとして `\\` と記述します。

複数ORGの間の空きも含め、最小出力アドレスから最大出力アドレスまでを一つのイメージとして出力します。
空きは `--fill`（標準0）で埋め、Intel HEXにも含めます。重複領域は値が同一でもエラーです。
アセンブル失敗時は既存の出力ファイルを更新しません。正常終了コード0、エラー1です。

## 構成・ビルド・テスト

- `src/E500Assembler.Core/`：アセンブラ本体。GUI等から再利用可能なC#ライブラリ。
- `src/E500Assembler.Cli/`：CLI、出力保存。
- `tests/E500Assembler.Tests/`：外部テストパッケージ不要の自動テスト。
- `tests/cli_smoke.py`：EXEの統合テストと、既存エミュレータDLLがあればCPU実行テスト。
- `examples/`：サンプルとsumの生成結果。
- `docs/SOURCES.md`：仕様の参照元と判断。

ビルドには.NET 10 SDKを使用します。

```powershell
.\build.cmd
# テストのみ
.\build.cmd -TestOnly
# EXE生成後の統合確認（Python 3が必要）
python tests\cli_smoke.py
```

Core APIの基本形は `new Assembler().AssembleFile(path)` または `AssembleText(text)` です。
結果の `Binary` / `Origin` / `Symbols` / `Listing` を取得できます。`AssemblerOptions` で初期ORG、埋め値、ソース文字コード、検索パス、外部定数を指定します。
逆アセンブラ等から1命令だけ照合する用途には `Assembler.EncodeInstruction(mnemonic, operands, address)` を使用できます。

実機での動作検証は未実施です。CPU命令表の期待バイト列テストと、既存SC62015エミュレータ上での計算・メモリアクセス実行を検証対象にしています。
