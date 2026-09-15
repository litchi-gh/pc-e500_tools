# Gドライブ（ROM内蔵エンジニアソフト）

## 配置と形式

G:は本体ROM内の `RAMFILE` メモリブロックで、ブロック先頭は `C0018h`、終端は `DFFFFh`（128 KiB）。ROMコード `E4BE8h` がG:選択時に `Y=C0018h` とする。ファイルシステムは64-byte sector、1 sector/cluster、12-bit FATである。

| 項目 | アドレス/値 |
|---|---|
| メモリブロック先頭 | C0018h |
| media parameter block | C0042h |
| sector size | 64 bytes |
| FAT | C0058h |
| root directory | C0BD8h（70 entries x 32 bytes） |
| data area | C1498h |
| 最終領域 | DFFFFh |
| 有効ファイル | 60 |
| 削除entry | 1 |
| 未使用entry | 9 |
| 有効データ合計 | 120,903 bytes |


## 検証

ROMのFATとクラスタ鎖から全60ファイルを抽出した。さらにROM上で `COPY "G:COMN.00$" TO "X:GDTEST.BIN"` を実行し、抽出物と全1,243バイトおよびSHA-256が一致した。検証値は `5f24ec704b69535f79897a31df6248f5a67b032ecf6563729190f9ab6eefa343`。

## 全ファイル

| name | ext | 形式 | size | directory | 先頭data | ROM割当範囲 | 抽出ファイル |
|---|---|---|---|---|---|---|---|
| ｽｳｶﾞｸ | 1## | MF/text | 25 | `C0BD8h` | `C1498h` | C1498h-C14D7h | 000_ｽｳｶﾞｸ.1## |
| ｾｲｽｳ | 11# | MF/text | 25 | `C0BF8h` | `C14D8h` | C14D8h-C1517h | 001_ｾｲｽｳ.11# |
| ﾎｳﾃｲｼｷ | 12# | MF/text | 26 | `C0C18h` | `C1518h` | C1518h-C1557h | 002_ﾎｳﾃｲｼｷ.12# |
| ﾋﾞｾｷ | 13# | MF/text | 28 | `C0C38h` | `C1558h` | C1558h-C1597h | 003_ﾋﾞｾｷ.13# |
| ｺｳｼｷ | 14# | MF/text | 28 | `C0C58h` | `C1598h` | C1598h-C15D7h | 004_ｺｳｼｷ.14# |
| ｸﾞﾗﾌ | 15# | MF/text | 28 | `C0C78h` | `C15D8h` | C15D8h-C1617h | 005_ｸﾞﾗﾌ.15# |
| ﾄｸｼｭ | 16# | MF/text | 27 | `C0C98h` | `C1618h` | C1618h-C1657h | 006_ﾄｸｼｭ.16# |
| ｶｶﾞｸ | 2## | MF/text | 32 | `C0CB8h` | `C1658h` | C1658h-C1697h | 007_ｶｶﾞｸ.2## |
| ﾌﾞﾂﾘ | 21# | MF/text | 25 | `C0CD8h` | `C1698h` | C1698h-C16D7h | 008_ﾌﾞﾂﾘ.21# |
| ｶｶﾞｸ | 22# | MF/text | 25 | `C0CF8h` | `C16D8h` | C16D8h-C1717h | 009_ｶｶﾞｸ.22# |
| ﾁｶﾞｸ | 23# | MF/text | 30 | `C0D18h` | `C1718h` | C1718h-C1757h | 010_ﾁｶﾞｸ.23# |
| ｾｲﾌﾞﾂ | 24# | MF/text | 27 | `C0D38h` | `C1758h` | C1758h-C1797h | 011_ｾｲﾌﾞﾂ.24# |
| ｺｳｶﾞｸ | 3## | MF/text | 25 | `C0D58h` | `C1798h` | C1798h-C17D7h | 012_ｺｳｶﾞｸ.3## |
| ﾃﾞﾝｷ | 31# | MF/text | 31 | `C0D78h` | `C17D8h` | C17D8h-C1817h | 013_ﾃﾞﾝｷ.31# |
| ｷｶｲ | 32# | MF/text | 27 | `C0D98h` | `C1818h` | C1818h-C1857h | 014_ｷｶｲ.32# |
| ﾄｳｹｲ | 4## | MF/text | 27 | `C0DB8h` | `C1858h` | C1858h-C1897h | 015_ﾄｳｹｲ.4## |
| ﾌﾞﾝﾌﾟ | 41# | MF/text | 31 | `C0DD8h` | `C1898h` | C1898h-C18D7h | 016_ﾌﾞﾝﾌﾟ.41# |
| ﾍﾝｼｭｳ | 5## | MF/text | 25 | `C0DF8h` | `C18D8h` | C18D8h-C1917h | 017_ﾍﾝｼｭｳ.5## |
| COMN | 00$ | BASIC | 1243 | `C0E18h` | `C1918h` | C1918h-C1D97h<br>DE798h-DE817h | 018_COMN.00$ |
| DISP500 | 00$ | BASIC | 1014 | `C0E38h` | `C1D98h` | C1D98h-C2197h | 019_DISP500.00$ |
| DISP501 | 00$ | BASIC | 1585 | `C0E58h` | `C2198h` | C2198h-C2797h<br>DEC98h-DECD7h | 020_DISP501.00$ |
| DISP502 | 00$ | BASIC | 1046 | `C0E78h` | `C2798h` | C2798h-C2BD7h | 021_DISP502.00$ |
| SCUBIC | 12$ | BASIC | 1313 | `C0E98h` | `C2BD8h` | C2BD8h-C3117h | 022_SCUBIC.12$ |
| SBDF | 42$ | BASIC | 4054 | `C0EB8h` | `C3118h` | C3118h-C3217h<br>C32D8h-C40D7h<br>DCE98h-DCF57h<br>DF518h-DF557h | 023_SBDF.42$ |
| ｿｲﾝｽｳ | 111 | BASIC | 990 | `C0ED8h` | `C4958h` | C4958h-C4D17h<br>DE858h-DE897h | 024_ｿｲﾝｽｳ.111 |
| GCMLCM | 112 | BASIC | 778 | `C0EF8h` | `C3218h` | C3218h-C32D7h<br>C4D58h-C4F57h<br>DE1D8h-DE217h<br>DE898h-DE8D7h | 025_GCMLCM.112 |
| 3ｼﾞ | 121 | BASIC | 1251 | `C0F18h` | `C4D18h` | C4D18h-C4D57h<br>C5058h-C5497h<br>DE8D8h-DE957h | 026_3ｼﾞ.121 |
| ｽｳﾁｶｲ1 | 122 | BASIC | 1138 | `C0F38h` | `C5558h` | C5558h-C5997h<br>DE958h-DE997h | 027_ｽｳﾁｶｲ1.122 |
| ｽｳﾁｶｲ2 | 123 | BASIC | 1274 | `C0F58h` | `C5998h` | C5998h-C5E57h<br>DE198h-DE1D7h | 028_ｽｳﾁｶｲ2.123 |
| ｾｷﾌﾞﾝ | 131 | BASIC | 1500 | `C0F78h` | `C5498h` | C5498h-C5557h<br>C5ED8h-C63D7h<br>DE998h-DE9D7h | 029_ｾｷﾌﾞﾝ.131 |
| ﾋﾞﾌﾞﾝ | 132 | BASIC | 1346 | `C0F98h` | `C63D8h` | C63D8h-C6917h<br>DE9D8h-DEA17h | 030_ﾋﾞﾌﾞﾝ.132 |
| ﾎｶﾝ | 133 | BASIC | 946 | `C0FB8h` | `C6A58h` | C6A58h-C6DD7h<br>DE218h-DE257h | 031_ﾎｶﾝ.133 |
| ｲﾝｽｳF | 141 | BASIC | 1967 | `C0FD8h` | `C5E58h` | C5E58h-C5ED7h<br>C6DD8h-C7517h | 032_ｲﾝｽｳF.141 |
| ｻﾝｶｸF | 142 | BASIC | 3106 | `C0FF8h` | `C7518h` | C7518h-C7557h<br>C7618h-C81D7h<br>C9258h-C9297h | 033_ｻﾝｶｸF.142 |
| ｾｷﾌﾞﾝF | 143 | BASIC | 2597 | `C1018h` | `C8218h` | C8218h-C8C57h | 034_ｾｷﾌﾞﾝF.143 |
| ｷﾞﾘｼｬ | 144 | BASIC | 1435 | `C1038h` | `C81D8h` | C81D8h-C8217h<br>C8C98h-C9217h | 035_ｷﾞﾘｼｬ.144 |
| ｸﾞﾗﾌF | 151 | BASIC | 2129 | `C1058h` | `C9218h` | C9218h-C9257h<br>C9298h-C9A97h<br>DEA18h-DEA57h | 036_ｸﾞﾗﾌF.151 |
| ｸﾞﾗﾌD | 152 | BASIC | 2933 | `C1078h` | `C7558h` | C7558h-C7617h<br>C9A98h-C9AD7h<br>C9B58h-CA557h<br>DEA58h-DEAD7h | 037_ｸﾞﾗﾌD.152 |
| ﾒﾝｾｷ | 153 | BASIC | 8652 | `C1098h` | `C4758h` | C4758h-C4817h<br>CA6D8h-CC797h<br>CD6D8h-CD717h<br>DE818h-DE857h | 038_ﾒﾝｾｷ.153 |
| ｶﾞﾝﾏ | 161 | BASIC | 986 | `C10B8h` | `C9AD8h` | C9AD8h-C9B57h<br>CC918h-CCC97h | 039_ｶﾞﾝﾏ.161 |
| ｼﾞｮｳｽｳ | 211 | BASIC | 2326 | `C10D8h` | `CCC98h` | CCC98h-CCD17h<br>CCD98h-CD657h | 040_ｼﾞｮｳｽｳ.211 |
| ﾀﾝｲ | 212 | BASIC | 10128 | `C10F8h` | `C6918h` | C6918h-C6A57h<br>CA658h-CA6D7h<br>CD658h-CD6D7h<br>CD7D8h-CFD17h<br>DEAD8h-DEB17h | 041_ﾀﾝｲ.212 |
| ｳﾝﾄﾞｳF | 213 | BASIC | 941 | `C1118h` | `C4818h` | C4818h-C4957h<br>CFD18h-CFDD7h<br>D0058h-D0217h | 042_ｳﾝﾄﾞｳF.213 |
| ｼｭｳｷ | 221 | BASIC | 8130 | `C1138h` | `D0218h` | D0218h-D21D7h<br>DF598h-DF5D7h | 043_ｼｭｳｷ.221 |
| ﾃﾞﾝｼ | 222 | BASIC | 8483 | `C1158h` | `D21D8h` | D21D8h-D2417h<br>D2458h-D4317h<br>DEB18h-DEB57h | 044_ﾃﾞﾝｼ.222 |
| ﾄﾞｳｲﾀｲ | 223 | BASIC | 15405 | `C1178h` | `C4F58h` | C4F58h-C5057h<br>CA558h-CA657h<br>CFDD8h-D0057h<br>D4558h-D47D7h<br>D4818h-D7D57h | 045_ﾄﾞｳｲﾀｲ.223 |
| ｷｼｮｳ | 231 | BASIC | 3809 | `C1198h` | `CCD18h` | CCD18h-CCD97h<br>D47D8h-D4817h<br>D7D58h-D8817h<br>D8858h-D8BD7h | 046_ｷｼｮｳ.231 |
| ﾜｸｾｲ | 232 | BASIC | 2726 | `C11B8h` | `D2418h` | D2418h-D2457h<br>D8818h-D8857h<br>D8BD8h-D91D7h<br>D9818h-D9C57h | 047_ﾜｸｾｲ.232 |
| ｱﾐﾉｻﾝ | 241 | BASIC | 5395 | `C11D8h` | `D9C58h` | D9C58h-DA257h<br>DA318h-DB197h<br>DEB58h-DEC17h | 048_ｱﾐﾉｻﾝ.241 |
| ﾌｸｿｽｳ | 311 | BASIC | 2435 | `C11F8h` | `D91D8h` | D91D8h-D9717h<br>DA258h-DA317h<br>DB198h-DB497h<br>DEC18h-DEC97h<br>DED18h-DED57h | 049_ﾌｸｿｽｳ.311 |
| ﾃﾞﾝｷF | 312 | BASIC | 938 | `C1218h` | `CC798h` | CC798h-CC917h<br>D4318h-D4557h | 050_ﾃﾞﾝｷF.312 |
| ﾃﾞﾝｼﾞF | 313 | BASIC | 951 | `C1238h` | `DB498h` | DB498h-DB797h<br>DB858h-DB8D7h<br>DBA58h-DBA97h | 051_ﾃﾞﾝｼﾞF.313 |
| ﾗﾌﾟﾗｽ | 314 | BASIC | 2739 | `C1258h` | `C8C58h` | C8C58h-C8C97h<br>DB7D8h-DB857h<br>DB8D8h-DBA57h<br>DBA98h-DBB57h<br>DC1D8h-DC357h<br>DC3D8h-DC517h<br>DC558h-DCA57h | 052_ﾗﾌﾟﾗｽ.314 |
| ｷｶｲF | 321 | BASIC | 4614 | `C1278h` | `D9718h` | D9718h-D9817h<br>DCA58h-DCE17h<br>DD058h-DDD97h<br>DED58h-DED97h | 053_ｷｶｲF.321 |
| ｾｲｷﾌﾞ | 411 | BASIC | 732 | `C1298h` | `C40D8h` | C40D8h-C43D7h | 054_ｾｲｷﾌﾞ.411 |
| Tﾌﾞ | 412 | BASIC | 928 | `C12B8h` | `C43D8h` | C43D8h-C4757h<br>CD718h-CD757h | 055_Tﾌﾞ.412 |
| ｶｲﾌﾞ | 413 | BASIC | 972 | `C12D8h` | `CD758h` | CD758h-CD7D7h<br>DB798h-DB7D7h<br>DBB58h-DBE97h | 056_ｶｲﾌﾞ.413 |
| Fﾌﾞ | 414 | BASIC | 1193 | `C12F8h` | `DBE98h` | DBE98h-DC1D7h<br>DC358h-DC3D7h<br>DC518h-DC557h<br>DCE18h-DCE97h<br>DF558h-DF597h | 057_Fﾌﾞ.414 |
| ｴﾃﾞｨﾀ | 51# | BASIC | 2163 | `C1318h` | `DE318h` | DE318h-DE797h<br>DED98h-DF197h | 058_ｴﾃﾞｨﾀ.51# |
| ﾃﾞﾓ | 50# | BASIC | 2120 | `C1338h` | `DCF58h` | DCF58h-DD057h<br>DDD98h-DE197h<br>DE258h-DE317h<br>DECD8h-DED17h<br>DF198h-DF417h | 059_ﾃﾞﾓ.50# |


`MF`で始まる18個の短い項目はメニュー用の文字列データ。`FF 00 00 00 34`で始まる42個はトークン化BASICプログラム。
