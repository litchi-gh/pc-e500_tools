# Pocket BASIC / ASM Linter

SHARP PC-E500 シリーズの BASIC ソースと、SC62015 用クロスアセンブラ `e500asm` の ASM ソースを編集しながら、文法上の問題を VS Code の「問題」パネルとエディタ上に表示する拡張機能です。

- **Pocket BASIC** (`.bas` / `.basic` / `.e500`): キーワードセットと構文は `Analysis/BASIC_REFERENCE.md`（PC-E500 ROM 8.5 の解析結果）に基づきます。
- **PC-E500 Assembly** (`.asm` / `.inc` / `.e500asm`): `Assembler/src/E500Assembler.Core`（`e500asm` 本体）を TypeScript に移植したものを診断エンジンにしています。エディタに出る診断は `e500asm` が拒否するものと対応し、生成バイト列は `e500asm.exe` とバイト単位で一致します（相違点は「e500asm との違い」を参照）。

## BASIC のチェック項目

- 行番号の有無、範囲、重複、並び順
- PC-E500 ROM に存在しない命令、および関数を文として使った箇所
- 文字列の閉じ忘れと丸括弧の対応
- `FOR/NEXT`、`WHILE/WEND`、`REPEAT/UNTIL`、`SWITCH/ENDSWITCH` の対応
- `FOR ... TO` と `ON ... GOTO/GOSUB/ERROR` の必須語
- `GOTO`、`GOSUB`、`RESTORE`、`RESUME`、`RUN`、`ARUN`、`AUTOGOTO` の行番号・ラベル参照
- `:` 区切りの複文、`REM` と `'` コメント、`*LABEL` ラベル

PC-E500 には `IF ... THEN` だけでなく、解析済み内蔵プログラムにある `IF 条件 文` 形式もあるため、`THEN` は必須としていません。

## ASM のチェック項目

`Assembler/README.md` と `Analysis/PC-E650_ASSEMBLER_MANUAL.md` の記法をそのまま受け付けます。

| コード | 内容 |
|---|---|
| `ASM010` | 字句: 閉じていない文字列・括弧、空のオペランド、解釈できない数値（`0BEC00h` 形式には `$BEC00` への書換えを案内） |
| `ASM020` | SC62015 にないニーモニック／疑似命令、命令とオペランドの組合せ（`MV A,IL`、`PUSHU U`、`[BA]` など）、PX/PY の順序 |
| `ASM021` | オペランド個数（`NOP 1`、`DB` の空データなど） |
| `ASM030` / `ASM031` / `ASM032` | シンボルの重複、未定義、`EQU` の循環・ラベルなし |
| `ASM040` | 値の範囲（即値のビット幅、`DB 256`、`PRE 20h`、0 除算） |
| `ASM041` | `JR` の変位範囲、64 KiB セグメントをまたぐ近距離分岐・命令 |
| `ASM050` | 出力の重複、20 ビットアドレス空間の超過 |
| `ASM060` | `INCLUDE` / `INCBIN` のファイル未検出・再帰（未保存ファイルでは警告） |
| `ASM070` | `ASSERT` 不成立 |
| `ASM001` | アドレス配置が収束しない |

ラベル・`EQU` の前方参照、式（`+ - * / % & | ^ << >>`、`LOW/HIGH/BANK`、`$`）、`INCLUDE` / `INCBIN`（保存済みファイルのみ、`pocketAsm.includeDirectories` を検索）に対応しています。

`e500asm` との違い:

- コマンドラインオプション `--org` / `--fill` / `--encoding` に相当する設定はありません。`ORG` のないソースは 0 番地から配置し、`DS` / `ALIGN` の埋め値は 0、文字コードは VS Code が開いた文書のものになります。
- `e500asm` は最初のエラーで停止しますが、本拡張は各行を独立して検査し、問題をまとめて報告します。エラーのある行のサイズは直前の収束したパスの値を使うため、後続行のアドレスは変わりません。
- `INCLUDE` / `INCBIN` は保存済みのファイル（`file:` スキーム）でのみ解決します。未保存の文書では警告 `ASM060` を出して読み飛ばします。
- 生成されるバイト列は診断のためだけに計算し、ファイルには書き出しません。`.bin` を作るには「e500asm でアセンブル」コマンドか `e500asm` を直接使います。

シンタックスハイライトは、ラベル定義、`EQU` 定数名、疑似命令、分岐命令、その他のニーモニック、レジスタ（`A B BA I IL X Y U S F IMR BP PX PY`）、数値（`$` `&` `0x` `0b` `h` 形式）、文字列、`;` コメントを区別します。

## コマンド

- **Pocket BASIC: Pocket BASIC として開く** — 任意のファイルを BASIC として開く（エクスプローラー／エディタタブの右クリックにもあります）
- **Pocket ASM: PC-E500 アセンブリとして開く** — 任意のファイルを ASM として開く
- **Pocket ASM: e500asm でアセンブル** — 設定 `pocketAsm.assemblerPath` の `e500asm.exe` を現在のファイルで実行し、結果を出力パネル「Pocket ASM」に表示（ASM エディタの右クリックにもあります）

## 設定

| 設定 | 既定 | 内容 |
|---|---|---|
| `pocketBasic.dialect` | `pc-e500` | BASIC 方言 |
| `pocketBasic.requireLineNumbers` | `true` | 行番号を必須にする |
| `pocketBasic.checkMissingTargets` | `true` | 静的な分岐先を確認する |
| `pocketAsm.includeDirectories` | `[]` | `INCLUDE` / `INCBIN` の追加検索先（`e500asm -I` 相当。相対パスはワークスペース基準） |
| `pocketAsm.defines` | `{}` | 事前定義シンボル（`e500asm -D NAME=VALUE` 相当。例: `{"MODEL": 500}`） |
| `pocketAsm.assemblerPath` | `""` | `e500asm.exe` または `e500asm.cmd` のパス（例: `Assembler/app/e500asm.exe`） |

## 開発と実行

```powershell
npm install
npm test
code .
```

VS Code で `F5` を押すと、Extension Development Host が起動して `examples/sample.e500` と `examples/sample.asm` を開きます。

`npm test` は BASIC のテストに加え、`Assembler/tests/E500Assembler.Tests` と同じ golden vector（全レジスタ・全 PRE 組合せ・拒否ケース）を TypeScript 版に対して実行します。

## 構成

```text
src/
  core.ts              診断の共通型
  extension.ts         VS Code との接続（両言語）
  dialects/            BASIC の方言定義（予約語・構造ペア）
  linter/              BASIC の診断エンジン
  asm/expression.ts    式評価・字句（Expression.cs の移植）
  asm/encoder.ts       SC62015 命令エンコーダ（InstructionEncoder.cs の移植）
  asm/assembler.ts     複数パスのアセンブル・診断収集（Assembler.cs の移植）
syntaxes/              TextMate 文法（pocket-basic / pocket-asm）
```

`e500asm` 本体の命令表を変更した場合は `src/asm/encoder.ts` にも同じ変更を反映してください。方言を追加する場合は `src/dialects` に `Dialect` 実装を追加し、`src/dialects/index.ts` のレジストリと `package.json` の `pocketBasic.dialect` 列挙値へ登録します。

本チェッカーは静的検査です。BASIC は全命令の引数型・個数・実行時の値域までは検査しません。ASM はアセンブルが通るかどうかを検査し、実機での動作（RAM の確保、内部 RAM の退避、`RETF` の使用など）は検査しません。
