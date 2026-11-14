using E500Assembler;

namespace E500Disassembler;

public sealed record DecodedLine(int Address, byte[] Bytes, string Mnemonic, string[] Operands, string Note = "", int? BranchTarget = null)
{
    public bool IsData => Mnemonic == "DB";
}

internal sealed class Decoder(byte[] data, int origin)
{
    private static readonly string[] Registers = ["A", "IL", "BA", "I", "X", "Y", "U", "S"];
    private static readonly string[] MoveNames = ["MV", "MVW", "MVP", "MVL"];
    private sealed class EndOfInput : Exception;
    private sealed class InvalidEncoding(string message) : Exception(message);
    private int cursor, start, memoryIndex;
    private int firstMode = 1, secondMode = 1;
    private static string Hex(int n, int width = 2) => "$" + n.ToString("X" + width);
    internal static bool IsPrefix(int op) => op is >= 0x21 and <= 0x27 or >= 0x30 and <= 0x37;
    private static (int, int) Modes(int op) => op switch
    {
        0x21 => (1,3), 0x22 => (1,0), 0x23 => (1,2), 0x24 => (3,1), 0x25 => (3,3), 0x26 => (3,0), 0x27 => (3,2),
        0x30 => (0,1), 0x31 => (0,3), 0x32 => (0,0), 0x33 => (0,2), 0x34 => (2,1), 0x35 => (2,3), 0x36 => (2,0), 0x37 => (2,2), _ => (1,1)
    };
    private int Byte() => cursor < data.Length ? data[cursor++] : throw new EndOfInput();
    private int Value(int size)
    {
        int v = 0; for (int i = 0; i < size; i++) v |= Byte() << (i * 8); return v;
    }
    private string Immediate(int size) => Hex(Value(size), size * 2);
    private string Address20() => Hex(Value(3) & 0xfffff, 5);
    private string Memory()
    {
        int index = memoryIndex++, mode = index == 0 ? firstMode : secondMode, n = Byte();
        string pointer = index == 0 ? "PX" : "PY";
        return mode switch { 0 => $"({Hex(n)})", 1 => $"(BP+{Hex(n)})", 2 => $"({pointer}+{Hex(n)})", _ => $"(BP+{pointer})" };
    }
    private static string Reg(int code) => Registers[code & 7];
    private static string Index(int mode)
    {
        string r = Reg(mode);
        return (mode & 0xf0) switch { 0 => r, 0x20 => r + "++", 0x30 => "--" + r, 0x80 or 0xc0 => r, _ => throw new InvalidEncoding("invalid index mode") };
    }
    private static string Sign(int mode) => (mode & 0x40) == 0 ? "+" : "-";
    private string Displacement(int mode) => (mode & 0x80) == 0 ? "" : Sign(mode) + Immediate(1);
    private (string External, string? Internal) Indexed(bool indirect, bool hasMemory, bool store)
    {
        int mode = Byte(); string? external = null, memory = null;
        if (indirect && store) external = Memory();
        if (hasMemory) memory = Memory();
        if (indirect && !store) external = Memory();
        external ??= Index(mode);
        string displacement = Displacement(mode);
        return ($"[{external}{displacement}]", memory);
    }
    private DecodedLine Line(string m, params string[] args) => new(origin + start, data[start..cursor], m, args);
    private DecodedLine Branch(string m, int value, int width, int target) => Line(m, Hex(value, width)) with { BranchTarget = target };
    private DecodedLine PairRegisters(string m, bool wide = false)
    {
        // ED/FD use the wide register selector: 0/2=BA, 1/3=I.
        // ROM 8.5 uses FD 01, FD 10 and FD 05, among other aliases.
        // Keep noncanonical encodings as DB via Matches(), but describe their
        // actual operands rather than incorrectly naming A/IL.
        string Register(int code) => wide && (code & 7) < 2 ? Reg((code & 7) + 2) : Reg(code);
        int mode = Byte(); return Line(m, Register(mode >> 4), Register(mode));
    }
    private DecodedLine PairMemory(string m) => Line(m, Memory(), Memory());
    private DecodedLine DecodeAt(int offset, int? prefix)
    {
        start = offset; cursor = offset; memoryIndex = 0;
        (firstMode, secondMode) = prefix.HasValue ? Modes(prefix.Value) : (1, 1);
        if (prefix.HasValue) Byte();
        int instructionAddress = origin + cursor;
        int op = Byte();
        switch (op)
        {
            case 0x00: return Line("NOP"); case 0x01: return Line("RETI");
            case 0x02: case 0x04: case 0x14: case 0x15: case 0x16: case 0x17:
            {
                int v = Value(2); string m = op switch { 2 => "JP", 4 => "CALL", 0x14 => "JPZ", 0x15 => "JPNZ", 0x16 => "JPC", _ => "JPNC" };
                return Branch(m, v, 4, (instructionAddress & 0xf0000) | v);
            }
            case 0x03: case 0x05:
            {
                int v = Value(3) & 0xfffff; return Branch(op == 3 ? "JPF" : "CALLF", v, 5, v);
            }
            case 0x06: return Line("RET"); case 0x07: return Line("RETF");
            case >= 0x08 and <= 0x0f: return Line("MV", Reg(op), op < 0x0a ? Immediate(1) : op < 0x0c ? Immediate(2) : Address20());
            case 0x10: return Line("JP", Memory());
            case 0x11: return Line("JP", Reg(Byte()));
            case 0x12: case 0x13: case >= 0x18 and <= 0x1f:
            {
                int delta = Byte(); bool negative = (op & 1) != 0;
                string m = op < 0x18 ? "JR" : new[] { "JRZ", "JRNZ", "JRC", "JRNC" }[(op - 0x18) / 2];
                int target = (instructionAddress & 0xf0000) | ((instructionAddress + 2 + (negative ? -delta : delta)) & 0xffff);
                return Line(m, (negative ? "-" : "+") + Hex(delta)) with { BranchTarget = target };
            }
            case 0x20: case 0xbf: throw new InvalidEncoding("reserved opcode");
            case >= 0x28 and <= 0x2f: case >= 0x38 and <= 0x3f:
                return Line(op < 0x30 ? "PUSHU" : "POPU", (op & 7) == 6 ? "F" : (op & 7) == 7 ? "IMR" : Reg(op));
            case >= 0x40 and <= 0x43: case >= 0x48 and <= 0x4b: case >= 0x50 and <= 0x53: case >= 0x58 and <= 0x5b:
            {
                string m = new[] { "ADD", "SUB", "ADC", "SBC" }[(op - 0x40) / 8];
                return (op & 3) switch { 0 => Line(m, "A", Immediate(1)), 1 => Line(m, Memory(), Immediate(1)), 2 => Line(m, "A", Memory()), _ => Line(m, Memory(), "A") };
            }
            case >= 0x44 and <= 0x46: return PairRegisters("ADD");
            case >= 0x4c and <= 0x4e: return PairRegisters("SUB");
            case 0x47: return Line("PMDF", Memory(), Immediate(1));
            case 0x57: return Line("PMDF", Memory(), "A");
            case 0x4f: return Line("PUSHS", "F"); case 0x5f: return Line("POPS", "F");
            case 0x54: return PairMemory("ADCL"); case 0x5c: return PairMemory("SBCL");
            case 0x55: return Line("ADCL", Memory(), "A"); case 0x5d: return Line("SBCL", Memory(), "A");
            case 0x56: case 0x5e:
            {
                var x = Indexed(false, true, op == 0x5e);
                return op == 0x56 ? Line("MVL", x.Internal!, x.External) : Line("MVL", x.External, x.Internal!);
            }
            case >= 0x60 and <= 0x6b: case >= 0x70 and <= 0x73: case >= 0x78 and <= 0x7b:
            {
                string m = op < 0x64 ? "CMP" : op < 0x68 ? "TEST" : op < 0x70 ? "XOR" : op < 0x78 ? "AND" : "OR";
                return (op & 3) switch { 0 => Line(m, "A", Immediate(1)), 1 => Line(m, Memory(), Immediate(1)), 2 => Line(m, "[" + Address20() + "]", Immediate(1)), _ => Line(m, Memory(), "A") };
            }
            case 0x6c: case 0x7c: return Line(op == 0x6c ? "INC" : "DEC", Reg(Byte()));
            case 0x6d: case 0x7d: return Line(op == 0x6d ? "INC" : "DEC", Memory());
            case 0x6e: case 0x76: case 0x7e: return PairMemory(op == 0x6e ? "XOR" : op == 0x76 ? "AND" : "OR");
            case 0x6f: case 0x77: case 0x7f: return Line(op == 0x6f ? "XOR" : op == 0x77 ? "AND" : "OR", "A", Memory());
            case 0x74: return Line("MV", "A", "B"); case 0x75: return Line("MV", "B", "A");
            case >= 0x80 and <= 0x87: return Line("MV", Reg(op), Memory());
            case >= 0x88 and <= 0x8f: return Line("MV", Reg(op), "[" + Address20() + "]");
            case >= 0x90 and <= 0x96: case >= 0x98 and <= 0x9e:
                return Line("MV", Reg(op), Indexed(op >= 0x98, false, false).External);
            case 0x97: return Line("SC"); case 0x9f: return Line("RC");
            case >= 0xa0 and <= 0xa7: return Line("MV", Memory(), Reg(op));
            case >= 0xa8 and <= 0xaf: return Line("MV", "[" + Address20() + "]", Reg(op));
            case >= 0xb0 and <= 0xb6: case >= 0xb8 and <= 0xbe:
                return Line("MV", Indexed(op >= 0xb8, false, true).External, Reg(op));
            case 0xb7: return PairMemory("CMP");
            case >= 0xc0 and <= 0xc3: return PairMemory(new[] { "EX", "EXW", "EXP", "EXL" }[op - 0xc0]);
            case 0xc4: return PairMemory("DADL"); case 0xc5: return Line("DADL", Memory(), "A");
            case 0xc6: case 0xc7: return PairMemory(op == 0xc6 ? "CMPW" : "CMPP");
            case >= 0xc8 and <= 0xcb: return PairMemory(MoveNames[op - 0xc8]);
            case 0xcc: case 0xcd: case 0xdc: return Line(op == 0xcc ? "MV" : op == 0xcd ? "MVW" : "MVP", Memory(), Immediate(op == 0xcc ? 1 : op == 0xcd ? 2 : 3));
            case 0xce: return Line("TCL"); case 0xcf: return PairMemory("MVLD");
            case >= 0xd0 and <= 0xd3: return Line(MoveNames[op - 0xd0], Memory(), "[" + Address20() + "]");
            case 0xd4: return PairMemory("DSBL"); case 0xd5: return Line("DSBL", Memory(), "A");
            case 0xd6: case 0xd7:
            {
                string r = Reg(Byte()); return Line(op == 0xd6 ? "CMPW" : "CMPP", Memory(), r);
            }
            case >= 0xd8 and <= 0xdb: return Line(MoveNames[op - 0xd8], "[" + Address20() + "]", Memory());
            case 0xdd: return Line("EX", "A", "B"); case 0xde: return Line("HALT"); case 0xdf: return Line("OFF");
            case >= 0xe0 and <= 0xe3: case >= 0xe8 and <= 0xeb: case >= 0xf0 and <= 0xf3: case >= 0xf8 and <= 0xfb:
            {
                bool store = (op & 8) != 0; var x = Indexed(op >= 0xf0, true, store); string m = MoveNames[op & 3];
                return store ? Line(m, x.External, x.Internal!) : Line(m, x.Internal!, x.External);
            }
            case 0xe4: case 0xe6: case 0xf4: case 0xf6: return Line(op == 0xe4 ? "ROR" : op == 0xe6 ? "ROL" : op == 0xf4 ? "SHR" : "SHL", "A");
            case 0xe5: case 0xe7: case 0xf5: case 0xf7: return Line(op == 0xe5 ? "ROR" : op == 0xe7 ? "ROL" : op == 0xf5 ? "SHR" : "SHL", Memory());
            case 0xec: case 0xfc: return Line(op == 0xec ? "DSLL" : "DSRL", Memory());
            case 0xed: return PairRegisters("EX", true); case 0xfd: return PairRegisters("MV", true);
            case 0xee: return Line("SWAP", "A"); case 0xef: return Line("WAIT");
            case 0xfe: return Line("IR"); case 0xff: return Line("RESET");
            default: throw new InvalidEncoding("standalone PRE");
        }
    }
    private static bool Matches(DecodedLine line)
    {
        try { return Assembler.EncodeInstruction(line.Mnemonic, line.Operands, line.Address).AsSpan().SequenceEqual(line.Bytes); }
        catch (AssemblyException) { return false; }
    }
    private DecodedLine Raw(int offset, int count, string note) => new(origin + offset, data[offset..(offset + count)], "DB", data[offset..(offset + count)].Select(b => Hex(b)).ToArray(), note);
    public List<DecodedLine> Decode(CancellationToken token)
    {
        var result = new List<DecodedLine>();
        for (int offset = 0; offset < data.Length;)
        {
            token.ThrowIfCancellationRequested();
            int op = data[offset];
            if (IsPrefix(op))
            {
                // Fold only when the assembler chooses exactly this PRE and keeps every operand byte.
                if (offset + 1 < data.Length && !IsPrefix(data[offset + 1]))
                    try
                    {
                        var combined = DecodeAt(offset, op);
                        if (Matches(combined)) { result.Add(combined); offset += combined.Bytes.Length; continue; }
                    }
                    catch (Exception e) when (e is EndOfInput or InvalidEncoding) { }
                var (first, second) = Modes(op);
                string[] names = ["absolute", "BP+offset", "PX/PY+offset", "BP+PX/PY"];
                result.Add(new(origin + offset, [(byte)op], "PRE", [Hex(op)], $"explicit PRE: internal operand 1={names[first]}, 2={names[second]}")); offset++; continue;
            }
            DecodedLine line;
            try
            {
                line = DecodeAt(offset, null);
                if (!Matches(line)) line = Raw(offset, line.Bytes.Length, "byte-preserving fallback; decoded: " + line.Mnemonic + " " + string.Join(", ", line.Operands));
            }
            catch (EndOfInput) { line = Raw(offset, data.Length - offset, "truncated instruction at end of input"); }
            catch (InvalidEncoding e) { line = Raw(offset, Math.Max(1, cursor - offset), e.Message); }
            result.Add(line); offset += line.Bytes.Length;
        }
        return result;
    }
}
