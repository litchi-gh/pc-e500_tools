using E500Assembler;
using System.Text;

var assembler = new Assembler(); int passed = 0;
void Check(bool condition, string message) { if (!condition) throw new Exception(message); passed++; }
void Golden(string source, string hex)
{
    byte[] actual = assembler.AssembleText(source).Binary;
    Check(Convert.ToHexString(actual) == hex.Replace(" ", "").ToUpperInvariant(), $"{source}: expected {hex}, got {Convert.ToHexString(actual)}");
}
void Reject(string source, string message)
{
    try { assembler.AssembleText(source); } catch (AssemblyException e) { Check(e.Message.Contains(message, StringComparison.OrdinalIgnoreCase), $"Wrong diagnostic for {source}: {e.Message}"); return; }
    throw new Exception($"Expected rejection: {source}");
}

// Independent golden vectors: Sharp ESR-L Instruction Manual pp. 74-88.
foreach (var (mnemonic, code) in new (string, string)[] { ("NOP","00"),("RETI","01"),("RET","06"),("RETF","07"),("SC","97"),("RC","9F"),("TCL","CE"),("HALT","DE"),("OFF","DF"),("WAIT","EF"),("INT","FE"),("IR","FE"),("RESET","FF"),("SWAP A","EE"),("PUSHS F","4F"),("POPS F","5F") }) Golden(mnemonic,code);
string[] regs = ["A","IL","BA","I","X","Y","U","S"];
for (int r = 0; r < 8; r++)
{
    string value = r < 2 ? "$12" : r < 4 ? "$1234" : "$ABCDE";
    string immediate = r < 2 ? "12" : r < 4 ? "3412" : "DEBC0A";
    Golden($"MV {regs[r]},{value}", $"{8+r:X2}{immediate}");
    Golden($"MV {regs[r]},($23)", $"30{0x80+r:X2}23");
    Golden($"MV ($23),{regs[r]}", $"30{0xa0+r:X2}23");
    Golden($"MV {regs[r]},[$ABCDE]", $"{0x88+r:X2}DEBC0A");
    Golden($"MV [$ABCDE],{regs[r]}", $"{0xa8+r:X2}DEBC0A");
    Golden($"INC {regs[r]}", $"6C{r:X2}"); Golden($"DEC {regs[r]}", $"7C{r:X2}");
    if (r < 7)
    {
        Golden($"MV {regs[r]},[X]", $"{0x90+r:X2}04");
        Golden($"MV [Y++],{regs[r]}", $"{0xb0+r:X2}25");
        Golden($"MV {regs[r]},[--U]", $"{0x90+r:X2}36");
        Golden($"MV {regs[r]},[S+$42]", $"{0x90+r:X2}8742");
        Golden($"MV [X-$42],{regs[r]}", $"{0xb0+r:X2}C442");
        Golden($"MV {regs[r]},[($23)]", $"30{0x98+r:X2}0023");
        Golden($"MV [($23)-5],{regs[r]}", $"30{0xb8+r:X2}C02305");
    }
    string stackReg = r < 6 ? regs[r] : r == 6 ? "F" : "IMR";
    Golden($"PUSHU {stackReg}", $"{0x28+r:X2}"); Golden($"POPU {stackReg}", $"{0x38+r:X2}");
}
foreach (var (src, hex) in new (string, string)[]
{
    ("MV A,B","74"),("MV B,A","75"),("MV X,Y","FD45"),("MV BA,X","FD24"),
    ("JP $1234","023412"),("JPF $ABCDE","03DEBC0A"),("CALL $1234","043412"),("CALLF $ABCDE","05DEBC0A"),
    ("JP ($20)","301020"),("JP U","1106"),("JPZ $1234","143412"),("JPNZ $1234","153412"),("JPC $1234","163412"),("JPNC $1234","173412"),
    ("JR +255","12FF"),("JR -255","13FF"),("JRZ +3","1803"),("JRZ -3","1903"),("JRNZ +3","1A03"),("JRNZ -3","1B03"),("JRC +3","1C03"),("JRC -3","1D03"),("JRNC +3","1E03"),("JRNC -3","1F03"),
    ("ADD BA,A","4420"),("ADD X,I","4543"),("ADD A,IL","4601"),("SUB I,BA","4C32"),("SUB S,X","4D74"),("SUB IL,A","4E10"),
    ("PMDF ($23),$45","30472345"),("PMDF ($23),A","305723"),
    ("INC ($23)","306D23"),("DEC ($23)","307D23"),
    ("MV ($23),$45","30CC2345"),("MVW ($23),$1234","30CD233412"),("MVP ($23),$ABCDEF","30DC23EFCDAB"),
    ("EX A,B","DD"),("EX BA,I","ED23"),("EX X,S","ED47"),
    ("CMPW ($23),BA","30D60223"),("CMPP ($23),X","30D70423"),
    ("ROR A","E4"),("ROR ($23)","30E523"),("ROL A","E6"),("ROL ($23)","30E723"),
    ("SHR A","F4"),("SHR ($23)","30F523"),("SHL A","F6"),("SHL ($23)","30F723"),("DSLL ($23)","30EC23"),("DSRL ($23)","30FC23"),
    ("MVL ($23),[X+5]","3056842305"),("MVL [Y-5],($23)","305EC52305"),
    ("MVL ($23),[X]","3056842300"),("MVL [Y],($23)","305E852300")
}) Golden(src,hex);
foreach (var (m, op) in new (string,int)[] { ("ADD",0x40),("SUB",0x48),("ADC",0x50),("SBC",0x58) })
{
    Golden($"{m} A,$45",$"{op:X2}45"); Golden($"{m} ($23),$45",$"30{op+1:X2}2345");
    Golden($"{m} A,($23)",$"30{op+2:X2}23"); Golden($"{m} ($23),A",$"30{op+3:X2}23");
}
foreach (var (m, op) in new (string,int)[] { ("CMP",0x60),("TEST",0x64),("XOR",0x68),("AND",0x70),("OR",0x78) })
{
    Golden($"{m} A,$45",$"{op:X2}45"); Golden($"{m} ($23),$45",$"30{op+1:X2}2345");
    Golden($"{m} [$ABCDE],$45",$"{op+2:X2}DEBC0A45"); Golden($"{m} ($23),A",$"30{op+3:X2}23");
    if (m != "TEST") Golden($"{m} ($23),($45)",$"32{(m=="CMP"?0xb7:op+6):X2}2345");
    if (m is "XOR" or "AND" or "OR") Golden($"{m} A,($23)",$"30{op+7:X2}23");
}
foreach (var (m, op) in new (string,int)[] { ("EX",0xc0),("EXW",0xc1),("EXP",0xc2),("EXL",0xc3),("ADCL",0x54),("SBCL",0x5c),("DADL",0xc4),("DSBL",0xd4),("CMPW",0xc6),("CMPP",0xc7),("MVLD",0xcf) })
{
    Golden($"{m} ($23),($45)",$"32{op:X2}2345");
    if (m is "ADCL" or "SBCL" or "DADL" or "DSBL") Golden($"{m} ($23),A",$"30{op+1:X2}23");
}
for (int w = 0; w < 4; w++)
{
    string m = new[] {"MV","MVW","MVP","MVL"}[w];
    Golden($"{m} ($23),($45)",$"32{0xc8+w:X2}2345");
    Golden($"{m} ($23),[$ABCDE]",$"30{0xd0+w:X2}23DEBC0A");
    Golden($"{m} [$ABCDE],($23)",$"30{0xd8+w:X2}DEBC0A23");
    Golden($"{m} ($23),[X++]",$"30{0xe0+w:X2}2423");
    Golden($"{m} [--Y],($23)",$"30{0xe8+w:X2}3523");
    Golden($"{m} ($23),[($45)+6]",$"32{0xf0+w:X2}80234506");
    Golden($"{m} [($23)-6],($45)",$"32{0xf8+w:X2}C0234506");
}
// All 16 pairs of internal addressing modes, including the implicit BP/BP mode.
string[] dest = ["($12)","(BP+$12)","(PX+$12)","(BP+PX)"];
string[] sourceModes = ["($34)","(BP+$34)","(PY+$34)","(BP+PY)"];
string[,] prefixes = {{"32","30","33","31"},{"22","","23","21"},{"36","34","37","35"},{"26","24","27","25"}};
for(int d=0; d<4; d++) for(int s=0; s<4; s++) Golden($"MV {dest[d]},{sourceModes[s]}", $"{prefixes[d,s]}C8{(d==3?"00":"12")}{(s==3?"00":"34")}");
Golden("MV A,(BP-1)","80FF"); Golden("MV A,(PX+2)","348002");
Golden("ORG $B8000\nstart: MV A,0\nMV IL,10\nloop: ADD A,IL\nDEC IL\nJRNZ loop\nRET", "0800090A46017C011B0606");
Golden("ORG $B8000\nJR next\nDB 1,2\nnext: CALL done\nRET\ndone: RET", "120201020408800606");
Golden("ORG $BFFFC\nJR $B0001", "1203");
Golden("ORG $B0000\nJR $BFFFD", "1305");
Golden("size EQU finish-start\nORG $B8000\nstart: DB size\nDW finish & $FFFF\nfinish:","030380");
Golden("a1 EQU a2+1\na2 EQU a3+1\na3 EQU 1\nDB a1", "03");
Golden("DB 1+2*3,(1+2)*3, 0b1010, 0FFh, &12, $34, 0x56, LOW($1234), HIGH($1234), BANK($ABCDE), 'A'", "07090AFF12345634120A41");
Golden("DB \"a;b,c\\n\\x41\",0 ; comment", "613B622C630A4100");
Golden("DW -1,$1234\nDP $123456\nMV X,-1", "FFFF34125634120CFFFF0F");
Golden("ORG 3\nDB 1\nALIGN 8,$EE\nDS 2,$AA\nORG 12\nDB 2", "01EEEEEEEEAAAA000002");
Golden(".org 4\n.DB LOW($), HIGH($)\nend\nunsupported", "0400");
Golden("PRE $32\nMV (BP+1),(BP+2)", "32C80102");

foreach (var (src, message) in new (string,string)[]
{
    ("MV A,256","8 bits"),("MV BA,65536","16 bits"),("MV X,$100000","20 bits"),
    ("MV A,missing","Undefined"),("bad: NOP\nbad: RET","Duplicate"),("DB (1+2","bracket"),
    ("JR +256","out of range"),("JR -256","out of range"),("ORG $B0000\nJP $C0000","segment"),("ORG $B0000\nJR $C0000","segment"),
    ("MV A,[BA]","index"),("JP A","Unsupported"),("MV S,[X]","Unsupported"),("MV [X],S","Unsupported"),("PUSHU U","Unsupported"),
    ("PUSHS A","Unsupported"),("ADD A,X","Unsupported"),("ADC A,IL","Unsupported"),("CMP A,($20)","Unsupported"),
    ("MV A,IL","Unsupported"),("MV IL,A","Unsupported"),("MV X,A","Unsupported"),("EX A,IL","Unsupported"),
    ("MV A,(PY+1)","PX"),("MV ($20),(PX+1)","PY"),("MV A,[X++ +2]","combine"),
    ("ORG $BFFFF\nMV A,1","boundary"),("ORG $FFFFF\nDW 1","20-bit"),
    ("ORG 10\nDB 1\nORG 10\nDB 2","Overlapping"),("DB 256","outside"),("ALIGN 0","outside"),
    ("DS -1","outside"),("DB 1/0","zero"),("DB \"あ\"","single-byte"),("NOP 1","no operands"),
    ("PRE $20","reserved"),("DB 1,","Empty"),("ASSERT 0","ASSERT"),("a1 EQU a1\nDB a1","Cyclic"),
    ("a1 EQU a2\na2 EQU a1\nDB a1","Cyclic"),("a1 EQU a1+1","converge"),("a1 EQU missing\nDB a1","Undefined"),
    ("DB \"bad","Unterminated"),("DB '\\q'","escape"),("MV A,,1","Empty"),("MV A,()","Expression"),
    ("EQU 2","label"),("DB 1 << 64","Shift"),("DB 999999999999999999999999","Invalid number")
}) Reject(src,message);

// Intel HEX reconstructs the full 20-bit image and has correct checksums, including bank transitions.
var result = assembler.AssembleText("ORG $BFFF8\nDS 32,$A5");
int upper = 0; var recovered = new SortedDictionary<int,byte>(); bool eof = false;
foreach(string line in result.IntelHex().Split('\n',StringSplitOptions.RemoveEmptyEntries))
{
    byte[] b = Convert.FromHexString(line.Trim()[1..]); Check((b.Sum(x=>(int)x)&255)==0,"HEX checksum");
    if(b[3]==4) upper=(b[4]<<24)|(b[5]<<16);
    if(b[3]==0) for(int i=0;i<b[0];i++) recovered[upper+(b[1]<<8)+b[2]+i]=b[4+i];
    if(b[3]==1) eof=true;
}
Check(eof && recovered.Count==32 && recovered.First().Key==0xBFFF8 && recovered.Last().Key==0xC0017 && recovered.Values.All(x=>x==0xa5),"HEX reconstruction");
Check(result.ListingText().Contains("BFFF8") && result.Origin==0xBFFF8,"listing/origin");
Check(Convert.ToHexString(Assembler.EncodeInstruction("MV", ["A", "$42"], 0xB8000)) == "0842", "single instruction API");
try { Assembler.EncodeInstruction("JR", ["missing"], 0xB8000); throw new Exception("single instruction undefined symbol accepted"); }
catch (AssemblyException) { passed++; }
var options = new AssemblerOptions { Origin=0xB8000, Fill=0xff, Defines=new Dictionary<string,long>{{"VALUE",42}} };
Check(Convert.ToHexString(assembler.AssembleText("DB VALUE\nORG $B8003\nDB 1",options).Binary)=="2AFFFF01","options");

// INCLUDE, INCBIN, Japanese paths and source locations.
string temp = Path.Combine(Path.GetTempPath(), "e500asm-test-"+Guid.NewGuid().ToString("N")); Directory.CreateDirectory(temp);
try
{
    string include = Path.Combine(temp,"定数.inc"), input = Path.Combine(temp,"日本語.asm");
    File.WriteAllText(include,"VALUE EQU 42\n"); File.WriteAllBytes(Path.Combine(temp,"data.bin"),[1,2,3,4]);
    File.WriteAllText(input,"INCLUDE \"定数.inc\"\nDB VALUE\nINCBIN \"data.bin\",1,2");
    Check(Convert.ToHexString(assembler.AssembleFile(input).Binary)=="2A0203","includes and binary slices");
    File.WriteAllText(include,"INCLUDE \"日本語.asm\"");
    try { assembler.AssembleFile(input); throw new Exception("recursive include accepted"); } catch(AssemblyException e) { Check(e.Message.Contains("Recursive INCLUDE") && e.Message.Contains("(1)"),"include diagnostic"); }
}
finally { Directory.Delete(temp,true); }
Console.WriteLine($"PASS: {passed} checks");
