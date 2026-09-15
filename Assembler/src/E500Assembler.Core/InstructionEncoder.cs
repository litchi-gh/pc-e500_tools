using System.Text.RegularExpressions;

namespace E500Assembler;

internal sealed class InstructionEncoder(Func<string, long> evaluate, int pc, bool strict)
{
    private static readonly string[] Registers = ["A", "IL", "BA", "I", "X", "Y", "U", "S"];
    private static readonly Dictionary<string, int> Fixed = new()
    {
        ["NOP"]=0x00, ["RETI"]=0x01, ["RET"]=0x06, ["RETF"]=0x07,
        ["SC"]=0x97, ["RC"]=0x9f, ["TCL"]=0xce, ["HALT"]=0xde, ["OFF"]=0xdf,
        ["WAIT"]=0xef, ["IR"]=0xfe, ["INT"]=0xfe, ["RESET"]=0xff
    };
    private sealed record Operand(string Kind, string Text, int Reg = -1, int Mode = 1, int Index = 0, string? Offset = null, Operand? Inner = null);
    private readonly List<Operand> internalOperands = [];
    private readonly List<byte> bytes = [];
    private void Emit(params int[] values) { foreach (int v in values) bytes.Add((byte)v); }
    private long Value(string s, int bits, bool signed = false)
    {
        long v = evaluate(s);
        if (strict && (v < (signed ? -(1L << (bits - 1)) : 0) || v >= (1L << bits))) throw new AssemblyException($"Value {v} does not fit in {bits} bits");
        return v;
    }
    private void Immediate(string s, int bits, bool signed = false)
    {
        long v = Value(s, bits, signed);
        v &= (1L << bits) - 1;
        for (int i = 0; i < (bits + 7) / 8; i++) Emit((int)(v >> (8 * i)));
    }
    private Operand Parse(string text)
    {
        string s = Regex.Replace(text.ToUpperInvariant(), @"\s+", "");
        int r = Array.IndexOf(Registers, s);
        if (r >= 0) return new("R", text, r);
        if (s is "B" or "F" or "IMR") return new(s, text);
        if (s.StartsWith('(') && s.EndsWith(')')) return Internal(text.Trim()[1..^1]);
        if (s.StartsWith('[') && s.EndsWith(']'))
        {
            string inside = text.Trim()[1..^1].Trim();
            var m = Regex.Match(inside, @"^(--)?([XYUS])(\+\+)?(?:\s*([+-])\s*(.+))?$", RegexOptions.IgnoreCase);
            if (m.Success)
            {
                if ((m.Groups[1].Success ? 1 : 0) + (m.Groups[3].Success ? 1 : 0) + (m.Groups[4].Success ? 1 : 0) > 1) throw new AssemblyException("Cannot combine auto update and displacement");
                r = Array.IndexOf(Registers, m.Groups[2].Value.ToUpperInvariant());
                int index = m.Groups[1].Success ? 0x30 : m.Groups[3].Success ? 0x20 : m.Groups[4].Success ? (m.Groups[4].Value == "+" ? 0x80 : 0xc0) : 0;
                return new("ER", inside, r, Index: index, Offset: m.Groups[5].Success ? m.Groups[5].Value : null);
            }
            if (inside.StartsWith('('))
            {
                int depth = 0, end = -1;
                for (int i = 0; i < inside.Length; i++) { if (inside[i] == '(') depth++; if (inside[i] == ')' && --depth == 0) { end = i; break; } }
                if (end < 0) throw new AssemblyException("Missing ')' in indirect address");
                var inner = Internal(inside[1..end]); string tail = inside[(end + 1)..].Trim();
                if (tail.Length > 0 && tail[0] is not ('+' or '-')) throw new AssemblyException("Invalid indirect displacement");
                return new("EI", inside, Index: tail.Length == 0 ? 0 : tail[0] == '+' ? 0x80 : 0xc0, Offset: tail.Length == 0 ? null : tail[1..], Inner: inner);
            }
            if (Regex.IsMatch(s, @"^\[(?:A|IL|BA|I|B)(?:\]|[+-])")) throw new AssemblyException("External memory index must be X, Y, U or S");
            return new("EA", inside);
        }
        return new("V", text.StartsWith('#') ? text[1..] : text);
    }
    private static Operand Internal(string text)
    {
        string s = Regex.Replace(text.ToUpperInvariant(), @"\s+", "");
        if (s is "BP+PX" or "PX+BP") return new("M", "0", Mode: 3, Index: 1);
        if (s is "BP+PY" or "PY+BP") return new("M", "0", Mode: 3, Index: 2);
        var m = Regex.Match(text, @"^\s*(BP|PX|PY)\s*(?:([+-])\s*(.+))?$", RegexOptions.IgnoreCase);
        if (m.Success)
        {
            string name = m.Groups[1].Value.ToUpperInvariant();
            return new("M", m.Groups[3].Success ? m.Groups[2].Value + "(" + m.Groups[3].Value + ")" : "0", Mode: name == "BP" ? 1 : 2, Index: name == "PX" ? 1 : name == "PY" ? 2 : 0);
        }
        return new("M", text, Mode: 0);
    }
    private void Mem(Operand o) { internalOperands.Add(o); Immediate(o.Text, 8, o.Mode is 1 or 2); }
    private static int Width(int r) => r < 2 ? 8 : r < 4 ? 16 : 20;
    private void External(int opcode, Operand ext, Operand? memory = null, bool store = false)
    {
        Emit(opcode);
        if (ext.Kind == "EA")
        {
            if (memory != null && !store) Mem(memory);
            Immediate(ext.Text, 20);
            if (memory != null && store) Mem(memory);
            return;
        }
        Emit(ext.Index | (ext.Kind == "ER" ? ext.Reg : 0));
        if (ext.Kind == "EI" && store) Mem(ext.Inner!);
        if (memory != null) Mem(memory);
        if (ext.Kind == "EI" && !store) Mem(ext.Inner!);
        if (ext.Offset != null) Immediate(ext.Offset, 8);
    }
    public byte[] Encode(string mnemonic, string[] arguments)
    {
        string m = mnemonic.ToUpperInvariant();
        if (Fixed.TryGetValue(m, out int fixedCode))
        {
            if (arguments.Length != 0) throw new AssemblyException($"{m} takes no operands");
            return [(byte)fixedCode];
        }
        var a = arguments.Select(Parse).ToArray();
        if (m == "PRE")
        {
            if (a.Length != 1 || a[0].Kind != "V") throw new AssemblyException("PRE requires a byte value");
            int v = (int)Value(a[0].Text, 8);
            if (strict && !(v is >= 0x21 and <= 0x27 or >= 0x30 and <= 0x37)) throw new AssemblyException("PRE must be 21h..27h or 30h..37h (20h is reserved)");
            return [(byte)v];
        }
        bool ok = a.Length == 1 ? Unary(m, a[0]) : a.Length == 2 && Binary(m, a[0], a[1]);
        if (!ok) throw new AssemblyException($"Unsupported instruction or operands: {m} {string.Join(", ", arguments)}");
        if (internalOperands.Count > 0)
        {
            for (int i = 0; i < internalOperands.Count; i++)
                if (internalOperands[i].Index != 0 && internalOperands[i].Index != i + 1) throw new AssemblyException($"Internal operand {i + 1} must use {(i == 0 ? "PX" : "PY")}");
            int first = internalOperands[0].Mode, second = internalOperands.Count > 1 ? internalOperands[1].Mode : 1;
            int[,] pre = { { 0x32, 0x30, 0x33, 0x31 }, { 0x22, 0, 0x23, 0x21 }, { 0x36, 0x34, 0x37, 0x35 }, { 0x26, 0x24, 0x27, 0x25 } };
            if (pre[first, second] != 0) bytes.Insert(0, (byte)pre[first, second]);
        }
        return bytes.ToArray();
    }
    private bool Unary(string m, Operand x)
    {
        if (m is "JP" or "JPZ" or "JPNZ" or "JPC" or "JPNC" or "CALL" or "JPF" or "CALLF")
        {
            if (m == "JP" && x.Kind == "M") { Emit(0x10); Mem(x); return true; }
            if (m == "JP" && x.Kind == "R" && x.Reg >= 4) { Emit(0x11, x.Reg); return true; }
            if (x.Kind != "V") return false;
            int op = m switch { "JP" => 2, "JPF" => 3, "CALL" => 4, "CALLF" => 5, "JPZ" => 0x14, "JPNZ" => 0x15, "JPC" => 0x16, _ => 0x17 };
            Emit(op);
            if (m.EndsWith('F')) Immediate(x.Text, 20);
            else
            {
                long target = Value(x.Text, 20);
                if (strict && target > 0xffff && (target >> 16) != (pc >> 16)) throw new AssemblyException("Near branch crosses a 64 KiB segment; use JPF/CALLF or an explicit far-branch sequence");
                Emit((int)target, (int)(target >> 8));
            }
            return true;
        }
        if (m is "JR" or "JRZ" or "JRNZ" or "JRC" or "JRNC")
        {
            if (x.Kind != "V") return false;
            long delta;
            string expression = x.Text.Trim();
            if (expression.StartsWith('+') || expression.StartsWith('-')) delta = evaluate(expression);
            else
            {
                long target = Value(expression, 20);
                if (target <= 0xffff) target += pc & 0xf0000;
                if (strict && (target >> 16) != (pc >> 16)) throw new AssemblyException("Relative branch crosses a 64 KiB segment");
                delta = (target - ((pc + 2) & 0xffff | (pc & 0xf0000))) & 0xffff;
                if (delta > 32767) delta -= 65536;
            }
            if (strict && Math.Abs(delta) > 255) throw new AssemblyException($"Relative branch out of range: {delta} (allowed -255..255)");
            int op = m switch { "JR" => 0x12, "JRZ" => 0x18, "JRNZ" => 0x1a, "JRC" => 0x1c, _ => 0x1e };
            Emit(op + (delta < 0 ? 1 : 0), (int)Math.Abs(delta)); return true;
        }
        if (m is "PUSHU" or "POPU")
        {
            int r = x.Kind == "F" ? 6 : x.Kind == "IMR" ? 7 : x.Kind == "R" && x.Reg < 6 ? x.Reg : -1;
            if (r < 0) return false;
            Emit((m == "PUSHU" ? 0x28 : 0x38) + r); return true;
        }
        if (m is "PUSHS" or "POPS") { if (x.Kind != "F") return false; Emit(m == "PUSHS" ? 0x4f : 0x5f); return true; }
        if (m is "INC" or "DEC")
        {
            int op = m == "INC" ? 0x6c : 0x7c;
            if (x.Kind == "R") Emit(op, x.Reg); else if (x.Kind == "M") { Emit(op + 1); Mem(x); } else return false;
            return true;
        }
        if (m is "ROR" or "ROL" or "SHR" or "SHL")
        {
            int op = m switch { "ROR" => 0xe4, "ROL" => 0xe6, "SHR" => 0xf4, _ => 0xf6 };
            if (x.Kind == "R" && x.Reg == 0) Emit(op); else if (x.Kind == "M") { Emit(op + 1); Mem(x); } else return false;
            return true;
        }
        if (m is "DSLL" or "DSRL" && x.Kind == "M") { Emit(m == "DSLL" ? 0xec : 0xfc); Mem(x); return true; }
        if (m == "SWAP" && x.Kind == "R" && x.Reg == 0) { Emit(0xee); return true; }
        return false;
    }
    private bool Binary(string m, Operand d, Operand s)
    {
        bool dm = d.Kind == "M", sm = s.Kind == "M", dr = d.Kind == "R", sr = s.Kind == "R", imm = s.Kind == "V";
        bool da = dr && d.Reg == 0, sa = sr && s.Reg == 0;
        if (m is "MV" or "MVW" or "MVP" or "MVL")
        {
            int width = m switch { "MV" => 0, "MVW" => 1, "MVP" => 2, _ => 3 };
            if (m == "MV")
            {
                if (da && s.Kind == "B") { Emit(0x74); return true; }
                if (d.Kind == "B" && sa) { Emit(0x75); return true; }
                if (dr && sr && d.Reg >= 2 && s.Reg >= 2) { Emit(0xfd, (d.Reg << 4) | s.Reg); return true; }
                if (dr && imm) { Emit(8 + d.Reg); Immediate(s.Text, Width(d.Reg), true); return true; }
                if (dr && sm) { Emit(0x80 + d.Reg); Mem(s); return true; }
                if (dm && sr) { Emit(0xa0 + s.Reg); Mem(d); return true; }
                if (dr && s.Kind.StartsWith('E'))
                {
                    if (d.Reg == 7 && s.Kind != "EA") return false;
                    External((s.Kind == "EA" ? 0x88 : s.Kind == "ER" ? 0x90 : 0x98) + d.Reg, s); return true;
                }
                if (sr && d.Kind.StartsWith('E'))
                {
                    if (s.Reg == 7 && d.Kind != "EA") return false;
                    External((d.Kind == "EA" ? 0xa8 : d.Kind == "ER" ? 0xb0 : 0xb8) + s.Reg, d, store: true); return true;
                }
            }
            if (dm && sm) { Emit(0xc8 + width); Mem(d); Mem(s); return true; }
            if (dm && imm && width < 3) { Emit(width == 2 ? 0xdc : 0xcc + width); Mem(d); Immediate(s.Text, (width + 1) * 8, true); return true; }
            if (dm && s.Kind.StartsWith('E'))
            {
                if (width == 3 && s.Kind == "ER" && s.Index == 0) s = s with { Index = 0x80, Offset = "0" };
                int op = s.Kind == "EA" ? 0xd0 + width : s.Kind == "ER" ? 0xe0 + width : 0xf0 + width;
                if (width == 3 && s.Kind == "ER" && s.Offset != null) op = 0x56;
                External(op, s, d); return true;
            }
            if (sm && d.Kind.StartsWith('E'))
            {
                if (width == 3 && d.Kind == "ER" && d.Index == 0) d = d with { Index = 0x80, Offset = "0" };
                int op = d.Kind == "EA" ? 0xd8 + width : d.Kind == "ER" ? 0xe8 + width : 0xf8 + width;
                if (width == 3 && d.Kind == "ER" && d.Offset != null) op = 0x5e;
                External(op, d, s, true); return true;
            }
            return false;
        }
        if (m is "ADD" or "SUB" or "ADC" or "SBC")
        {
            int op = m switch { "ADD" => 0x40, "SUB" => 0x48, "ADC" => 0x50, _ => 0x58 };
            if (da && imm) { Emit(op); Immediate(s.Text, 8, true); return true; }
            if (dm && imm) { Emit(op + 1); Mem(d); Immediate(s.Text, 8, true); return true; }
            if (da && sm) { Emit(op + 2); Mem(s); return true; }
            if (dm && sa) { Emit(op + 3); Mem(d); return true; }
            if (m is "ADD" or "SUB" && dr && sr && Width(d.Reg) >= Width(s.Reg)) { Emit(op + (d.Reg < 2 ? 6 : d.Reg < 4 ? 4 : 5), (d.Reg << 4) | s.Reg); return true; }
            return false;
        }
        if (m is "CMP" or "TEST" or "XOR" or "AND" or "OR")
        {
            int op = m switch { "CMP" => 0x60, "TEST" => 0x64, "XOR" => 0x68, "AND" => 0x70, _ => 0x78 };
            if (da && imm) { Emit(op); Immediate(s.Text, 8, true); return true; }
            if (dm && imm) { Emit(op + 1); Mem(d); Immediate(s.Text, 8, true); return true; }
            if (d.Kind == "EA" && imm) { Emit(op + 2); Immediate(d.Text, 20); Immediate(s.Text, 8, true); return true; }
            if (dm && sa) { Emit(op + 3); Mem(d); return true; }
            if (dm && sm && m != "TEST") { Emit(m == "CMP" ? 0xb7 : op + 6); Mem(d); Mem(s); return true; }
            if (da && sm && m is "XOR" or "AND" or "OR") { Emit(op + 7); Mem(s); return true; }
            return false;
        }
        if (m is "EX" or "EXW" or "EXP" or "EXL" or "ADCL" or "SBCL" or "DADL" or "DSBL" or "CMPW" or "CMPP" or "MVLD")
        {
            int op = m switch { "EX" => 0xc0, "EXW" => 0xc1, "EXP" => 0xc2, "EXL" => 0xc3, "ADCL" => 0x54, "SBCL" => 0x5c, "DADL" => 0xc4, "DSBL" => 0xd4, "CMPW" => 0xc6, "CMPP" => 0xc7, _ => 0xcf };
            if (dm && sm) { Emit(op); Mem(d); Mem(s); return true; }
            if (m == "EX" && (da && s.Kind == "B" || d.Kind == "B" && sa)) { Emit(0xdd); return true; }
            if (m == "EX" && dr && sr && d.Reg >= 2 && s.Reg >= 2) { Emit(0xed, (d.Reg << 4) | s.Reg); return true; }
            if (m is "ADCL" or "SBCL" or "DADL" or "DSBL" && dm && sa) { Emit(op + 1); Mem(d); return true; }
            if (m is "CMPW" or "CMPP" && dm && sr && (m == "CMPW" ? s.Reg is 2 or 3 : s.Reg >= 4)) { Emit(op + 0x10, s.Reg); Mem(d); return true; }
            return false;
        }
        if (m == "PMDF" && dm)
        {
            if (imm) { Emit(0x47); Mem(d); Immediate(s.Text, 8, true); return true; }
            if (sa) { Emit(0x57); Mem(d); return true; }
        }
        return false;
    }
}
