using E500Assembler;
using E500Disassembler;

int checks = 0;
void Check(bool condition, string message) { if (!condition) throw new Exception(message); checks++; }
void Reject(Action action, string expected)
{
    try { action(); } catch (DisassemblyException e) { Check(e.Message.Contains(expected, StringComparison.OrdinalIgnoreCase), "wrong error: " + e.Message); return; }
    throw new Exception("expected rejection: " + expected);
}
byte[] Header(int origin, byte[] payload)
{
    byte[] h = [0xff,0,6,1,0x10,0,0,0,0,0,0,0xff,0xff,0xff,0,0x0f];
    for (int i=0;i<3;i++) { h[5+i]=(byte)(payload.Length>>(8*i)); h[8+i]=(byte)(origin>>(8*i)); }
    return [..h,..payload];
}
void RoundTrip(byte[] bytes, int origin, InputFormat format = InputFormat.Raw)
{
    byte[] file = format == InputFormat.Raw ? bytes : Header(origin, bytes);
    InputImage image = InputImage.Read(file, format, format == InputFormat.Raw ? origin : null);
    DisassemblyResult disassembled = new Disassembler().Disassemble(image);
    AssemblyResult assembled = new Assembler().AssembleText(disassembled.Source);
    Check(assembled.Origin == origin, $"origin mismatch: {assembled.Origin:X5} vs {origin:X5}");
    Check(assembled.Binary.AsSpan().SequenceEqual(bytes), $"round trip mismatch at {origin:X5}\n{disassembled.Source}");
}

byte[] known = new Assembler().AssembleText("""
ORG $B8000
MV S,$BFFF0
CALL sub
MV A,($20)
MV A,(BP+$20)
MV (PX+2),(PY+3)
MV (BP+PX),(BP+PY)
MV X,$B8100
MV A,[X++]
MV [--Y],BA
MVW ($20),[X+5]
MVP [($40)+2],($30)
MVL ($20),[X]
JRNZ again
again: JPF sub
sub: RET
""").Binary;
RoundTrip(known, 0xB8000);
RoundTrip(known, 0xB8000, InputFormat.Ce140f);

// Every opcode appears as a potential instruction start with ample operand bytes.
var allOpcodes = new List<byte>();
for (int op=0;op<256;op++) { allOpcodes.Add((byte)op); allOpcodes.AddRange([0x44,0x23,0x56,0x78,0x9a,0xbc]); }
RoundTrip(allOpcodes.ToArray(), 0x80000);

// Deterministic arbitrary data exercises misaligned instructions, prefixes and truncation.
var random = new Random(62015); byte[] arbitrary = new byte[32768]; random.NextBytes(arbitrary);
RoundTrip(arbitrary, 0x40000);
RoundTrip([0x03, 0x12], 0xB0000); // truncated far jump
RoundTrip([0x20, 0xbf, 0x21, 0xbf, 0x37], 0xB0000); // reserved and standalone PRE
RoundTrip([], 0xB0000);

byte[] payload = [0,1,2,3]; var ce = InputImage.Read(Header(0xB8000,payload), InputFormat.Ce140f);
Check(ce.Origin == 0xB8000 && ce.Payload.SequenceEqual(payload) && ce.Header.Length == 16, "CE header parse");
Check(ce.Rewrap(payload).SequenceEqual(Header(0xB8000,payload)), "CE rewrap");
Reject(() => InputImage.Read([1,2,3], InputFormat.Ce140f), "shorter");
var badSignature = Header(0xB8000,payload); badSignature[1]=1;
Reject(() => InputImage.Read(badSignature, InputFormat.Ce140f), "header");
var badTail = Header(0xB8000,payload); badTail[15]=1;
Reject(() => InputImage.Read(badTail, InputFormat.Ce140f), "tail");
var badLength = Header(0xB8000,payload); badLength[5]=3;
Reject(() => InputImage.Read(badLength, InputFormat.Ce140f), "length");
Reject(() => InputImage.Read(payload, InputFormat.Raw), "start address");
Reject(() => InputImage.Read(payload, InputFormat.Raw, 0xffffe), "fit");
Reject(() => InputImage.Read(Header(0xffffe,payload), InputFormat.Ce140f), "fit");
Reject(() => ce.Rewrap([1]), "size");

var branching = new Disassembler().Disassemble(InputImage.Read([0x12,0,0x06],InputFormat.Raw,0xB0000));
Check(branching.Source.Contains("LB0002:") && branching.Source.Contains("JR     LB0002"), "branch labels");
var plain = new Disassembler().Disassemble(InputImage.Read([0x12,0],InputFormat.Raw,0xB0000), new() { GenerateLabels=false, ShowAddresses=false, ShowBytes=false });
Check(!plain.Source.Contains("LB") && !plain.Source.Contains("B0000 |") && plain.Source.Contains("JR     +$00"), "display options");
Check(new Disassembler().Disassemble(ce).Source.Contains("CE-140F header:"), "header comment");

// ED/FD use wide-register aliases, unlike ordinary register operands.
foreach (var (raw, meaning) in new (byte[], string)[] {
    ([0xfd,0x01], "MV BA, I"), ([0xfd,0x10], "MV I, BA"),
    ([0xfd,0x05], "MV BA, Y"), ([0xed,0x01], "EX BA, I") })
{
    var decoded = new Disassembler().Disassemble(InputImage.Read(raw,InputFormat.Raw,0xe96bf));
    Check(decoded.Lines.Single().Note.Contains("decoded: " + meaning), "wide register alias meaning");
    RoundTrip(raw,0xe96bf);
}

// SC62015 address registers and far/external addresses ignore bits 20..23.
foreach (var (raw, meaning) in new (byte[], string)[] {
    ([0x0d,0xff,0xff,0xff], "MV Y, $FFFFF"),
    ([0x03,0xff,0xff,0xff], "JPF $FFFFF"),
    ([0x8c,0xff,0xff,0xff], "MV X, [$FFFFF]") })
{
    var decoded = new Disassembler().Disassemble(InputImage.Read(raw,InputFormat.Raw,0xfa649));
    Check(decoded.Lines.Single().Note.Contains("decoded: " + meaning), "20-bit address mask meaning");
    RoundTrip(raw,0xfa649);
}

Console.WriteLine($"PASS: {checks} checks");
