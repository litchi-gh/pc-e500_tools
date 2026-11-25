# pc-e500_tools

SHARP PC-E500 シリーズ（CPU は SC62015）のプログラムを PC で作るツールと文書です。AI アシスタント（Claude Code、Codex など）向けの案内です。

## プログラムを書くとき

スキル [VSCodeExtensions/pc-e500-devtools/skills/pc-e500/SKILL.md](VSCodeExtensions/pc-e500-devtools/skills/pc-e500/SKILL.md) を先に読んでください。`.asm`、`.bas`、`*.e500test.json`、`.lcd`、`.spr` を扱う作業はすべて対象です。書いたものは、必ず `e500 lint`、`e500 run`、`e500 test` で確かめます。

```text
VSCodeExtensions/pc-e500-devtools/bin/e500 check
VSCodeExtensions/pc-e500-devtools/bin/e500 test Samples
```

`e500` は Node.js で動きます。`run` と `test` は Windows、Linux、macOS で動き、Linux と macOS ではその OS 用のエミュレータと .NET 10 ランタイムが要ります。Node.js がないときは、`Assembler/build.sh` と `DisAssembler/build.sh` で作る `e500asm`、`e500dasm` でアセンブルと逆アセンブルができます。

## ツール自体を直すとき

| 場所 | 内容 | 確かめ方 |
|---|---|---|
| `VSCodeExtensions/pc-e500-devtools` | VS Code 拡張、コマンド `e500`（TypeScript）、`server/`（C#） | `npx tsc -p ./`、`npm run build:server`、`node --test out/test/*.test.js` |
| `Assembler` | `e500asm`（C#） | `Assembler/tests` |
| `DisAssembler` | `e500dasm`、`E500Disassembler`（C#） | `DisAssembler/tests` |
| `Samples` | サンプル（アセンブラのものはテスト付き。`Basics` を除く） | `e500 test Samples` |
| `docs` | `handbook`（本体）、`manual`（ツール）、`analysis`（解析）、`design`（設計） | リンク、Mermaid |

設計と、どこを直せばよいかは [docs/design](docs/design/README.md)、ビルドと配布は [docs/design/09_BUILD_TEST_RELEASE.md](docs/design/09_BUILD_TEST_RELEASE.md) にあります。

## 決まり

- ROM、操作説明書、サービスマニュアルの中身（画像、逆アセンブル結果、本文の写し）を入れない。
- 個人の名前や PC のパスを書かない。
- 文書は日本語（です・ます体）。技術用語は普通のカタカナ語（アドレス、エントリ、バージョン）。画面は日本語の PC-E500（ROM 7.2）のもの。
- 機種や ROM で違うことは、動かすか ROM を読んで確かめてから書く。根拠（公式、ROM、実験）を示す。
- 市販のゲームの名前、キャラクタ、面を使わない。
- UTF-8、改行は元のファイルに合わせる（多くは LF、一部 CRLF）。Windows PowerShell 5.1 の `Get-Content` / `Set-Content` で書き換えない（文字が壊れる）。
- `VSCodeExtensions/pc-e500-devtools/inc/iocs.inc`、マニュアル 6 章と解析 11 章の IOCS の表は、`src/asm/iocs.ts` に合わせる。
