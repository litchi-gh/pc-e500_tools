# 外部の解析資料とツール

PC-E500 シリーズについて、ネットで公開されている解析資料とツールの一覧です。2026-11-06 に確認しました。周辺機器の出典は [PERIPHERALS.md](PERIPHERALS.md) §10 にあります。

書かれている内容は、それぞれのページの記述です。特に断らなければ、本リポジトリで確かめたものではありません。「アーカイブ」と書いたページは、元のサイトが読めず、ウェブアーカイブの写しで読みました。

## CPU と命令

| 資料 | 内容 |
|---|---|
| [gikonekos/sc62015-opcode-reference](https://github.com/gikonekos/sc62015-opcode-reference) | SC62015 の命令表を印刷物から再構成したもの。実機での確認は途中。ライセンスは CC BY-SA 4.0 |
| [Hackaday の紹介記事](https://hackaday.com/2026/03/26/reconstructed-sc62015-opcode-reference-for-sharp-pocket-computers/) | 上の資料の紹介 |
| [Ben Ryves の journal](https://benryves.com/journal/3763200) | ESR-L の Ghidra モジュール。シャープの IQ-7000 系の解析で、IOCS（`FFFE8h`）の呼び方は PC-E500 と同じとある |
| [sarnau/SharpIQDocuments](https://github.com/sarnau/SharpIQDocuments) | ESR-L Instruction Manual のスキャンなど（上の journal で紹介。未確認） |
| [Andrew Woods の命令表](http://www.andrewwoods3d.com/pce500/insttabl.html) | ESR-L の命令表（アーカイブ）。OZ-7000、IQ-7000 にも同じ CPU が使われているとある。下に比較の結果 |
| [tmizuno 氏のライブラリ](http://www.kt.rim.or.jp/~tmizuno/pocket/library/sharp01.html) | ESR-L の逆アセンブラ DISASM12.LZH、SC62015 のクロスアセンブラ XASM など、Lisp インタプリタ（アーカイブ）。DB-Z、PV-F1、ZAURUS の ESR-P は ESR-L の拡張とある |

Andrew Woods の表の 256 命令を [SC62015.md](SC62015.md) §15 の表と比べると、254 個のニーモニックが同じで、違いは次の 2 つでした。

| 命令 | Andrew Woods | 本リポジトリ | 判断 |
|---|---|---|---|
| `B7h` | `MV (m),(n)` | `CMP (m),(n)` | Systemhandbuch の命令表（p.93）も `CMP`。エミュレータの実装も引き算してフラグだけ変えます。`C8h` が `MV (m),(n)` なので、Andrew Woods の表の誤記と見られます |
| `BCh` | `MVP ((n)),X` | `MV [(n)],X` | どちらも 3 バイトの転送。書き方の違い |

sc62015-opcode-reference の実装メモには次の記述があります。

| 項目 | 記述 |
|---|---|
| `IL` への書込み | `IH` も 0 になる |
| ループ命令で `I` が 0 | 10000h 回として扱う |
| プレバイト | 20h〜27h、30h〜37h |
| `CEh` | 未確定 |
| `DEh` | `HALT` |

## 開発環境と言語

| 資料 | 内容 |
|---|---|
| [Robert-van-Engelen/Forth500](https://github.com/Robert-van-Engelen/Forth500) | PC-E500(S) 用の Forth 2012。ソースに詳しい注釈がある。SC62015 のアセンブラ XASM を同梱 |
| [Forth500 の resources](https://github.com/Robert-van-Engelen/Forth500/tree/main/resources) | ESR-L CPU technical manual、PC-E500 manual、Systemhandbuch、technical manual の PDF |
| Systemhandbuch（上の resources） | ドイツ語の解析書（Fischel GmbH）。シャープの資料ではない。周辺機器、メモリ、変数、中間コード、RAM ディスク、FUNCKEY、AER、ENG、システム番地、文字セット、CPU の命令表。内容は [MEMORY_AND_FILES.md](MEMORY_AND_FILES.md)、[BASIC_INTERNALS.md](BASIC_INTERNALS.md) に取り込み、実験で確かめた項目はその旨を書きました。読んでいないページは下の「読めなかった資料」にあります |

Forth500 のソースから分かることです。

| 項目 | 内容 |
|---|---|
| 機械語エリアの確保 | `POKE &BFE03,&1A,&FD,&0B,0,&FC-&xx,0: CALL &FFFD8` で `&Bxx00`〜`&BFC00` を確保。確認は `HEX PEEK &BFD1B` |
| 入口 | `fcs` は `FFFE4h`、`iocs` は `FFFE8h` |
| BREAK | `test ($ff),$08` |
| 割込みの禁止 | `and ($fb),$7f` |
| 配置 | 32 KB の機種は `&B9000`、拡張機は `&B0000` |
| 速度 | n-queens が 3.47 秒 |

## 転送とテープ

| 資料 | 内容 |
|---|---|
| [PocketTools](https://www.peil-partner.de/ifhe.de/sharp/) | シャープのポケコンのテープ用ツール（アーカイブ。v2.1.1、2022 年）。Wav2bin、Bin2wav、Bas2img。`CSAVE`、ASCII、`OPEN CAS`、`CSAVE M` を読む。`TstE5Inv` は PC-E500 で `-dINV` が必要かを調べるプログラム。Forth500 の説明に `bin2wav --pc=E500 --type=bin` の例がある |

テープの形式は [TAPE_FORMAT.md](TAPE_FORMAT.md) にあります。

## 音

| 資料 | 内容 |
|---|---|
| [gikonekos/PLAY3-Archive](https://github.com/gikonekos/PLAY3-Archive) | 1 ビットのブザーで 3 音を鳴らす PLAY3 の解析。原作は Ryu（Tatsuya Kobayashi）氏、1993 年 11 月のポケットコンピュータジャーナル |
| [Hackaday のタグページ](https://hackaday.com/tag/sharp-pc-e500) | PLAY3 の紹介記事 |

## ハードウェアと改造

| 資料 | 内容 |
|---|---|
| [cazacov/PocketComputers](https://github.com/cazacov/PocketComputers/tree/main/sharp-e500) | 内蔵 RAM の 128 KB 化と 256 KB RAM カードの自作。回路図と KiCad のデータ |
| [内蔵 RAM の増設（OIT）](https://www.oit.ac.jp/rd/labs/kobayashi-lab/~yagshi/old_web/misc/pocketcom/memup/index.html) | 62256 を 628128 に交換。PC-U6000 での作業 |
| [PC-E500 のメモリが 1 MB に迫る勢い](https://g-shoes.net/blog/index.php/view/229) | 空き番地に SRAM を追加して 704 KB にした記録と、CE0〜CE7 の番地 |
| [Arno Welzel 氏の PC-E500S](https://arnowelzel.de/en/projects/technology-museum/pocket-computers/sharp-pc-e500s) | PC-E500S の紹介と 256 KB 化 |
| [Thimet 氏の PC-E500](https://www.thimet.de/CalcCollection/Calculators/Sharp-PC-E500/Contents.htm) | PC-E500 と PC-E500S の増設の例 |
| [HP Museum の Turbo mode の話題](https://www.hpmuseum.org/forum/post-174973.html) | クロック改造（4.8 MHz セラロック、68 kΩ）。検索結果の抜粋のみ確認し、本文は取得できなかった |

## 機種の情報

| 資料 | 内容 |
|---|---|
| [ht-deko の PC-E500 の使い方](https://ht-deko.com/pce500/) | ピン配置、シリアル転送、19200 bps の設定など |
| [sharppocketcomputers.com](https://sharppocketcomputers.com/) | 機種の一覧。15 ピンの表、技術資料の一覧 |
| [Wikipedia: Sharp PC-E500S](https://en.wikipedia.org/wiki/Sharp_PC-E500S) | 機種の違いと周辺機器 |
| pocket.free.fr の PC-E500 | 機種の紹介（アーカイブ）。RAM は 32〜544 KB、カードは 2〜512 KB とある |

## エミュレータ

| 資料 | 内容 |
|---|---|
| [MAME](https://github.com/mamedev/mame) | SC61860 はあるが、`src/devices/cpu/sc61860` に SC62015 のファイルはなかった。ほかの場所は確かめていない |
| [matsumo/PockEmul](https://github.com/matsumo/PockEmul) | PC-E500 に対応するエミュレータのソース。`src/cpu/sc62015.cpp`、`src/machine/ce515p.cpp`、`src/machine/sharp/Ce126.cpp`、`ce140f.cpp` など。CE-515P の部分は [CE-515P_PLOTTER.md](CE-515P_PLOTTER.md) §10.1 で比べた。ほかの部分は読んでいない。リポジトリには ROM のファイルも含まれているようなので、取り扱いには注意してください |

## 読めなかった資料

| 資料 | 理由 |
|---|---|
| HP Museum のフォーラム | 取得を拒否された。ウェブアーカイブでも読めなかった |
| Systemhandbuch の一部 | スキャンは読めるが未読のページ。p.68〜69（文字の表）、p.76〜91 と p.94 以降（命令表とその前後）。命令表は p.92〜93 だけ読み、`B7h` の行を確かめました |
| kyoro205 の計算機データベース | 404 |
| シャープの 1987 年カタログ（sharp-pc-1600.de） | 大きすぎて取得できなかった |
