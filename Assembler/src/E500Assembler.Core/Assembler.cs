using System.Text;
using System.Text.RegularExpressions;

namespace E500Assembler;

public sealed record SourceLine(string File, int Number, string Text);
public sealed record ListingLine(SourceLine Source, int Address, byte[] Bytes);
public sealed record AssemblyResult(int Origin, byte[] Binary, IReadOnlyDictionary<string, long> Symbols, IReadOnlyList<ListingLine> Listing)
{
    public IReadOnlyList<string> InputFiles { get; init; } = [];
    public string IntelHex()
    {
        var output = new StringBuilder(); int bank = -1;
        static string Record(int address, int type, byte[] data)
        {
            byte[] record = [(byte)data.Length, (byte)(address >> 8), (byte)address, (byte)type, .. data];
            return ":" + Convert.ToHexString(record) + ((byte)-record.Sum(x => x)).ToString("X2");
        }
        for (int offset = 0; offset < Binary.Length;)
        {
            int address = Origin + offset;
            if ((address >> 16) != bank) { bank = address >> 16; output.AppendLine(Record(0, 4, [(byte)(bank >> 8), (byte)bank])); }
            int size = Math.Min(16, Math.Min(Binary.Length - offset, 0x10000 - (address & 0xffff)));
            output.AppendLine(Record(address & 0xffff, 0, Binary[offset..(offset + size)])); offset += size;
        }
        output.AppendLine(Record(0, 1, [])); return output.ToString();
    }
    public string ListingText()
    {
        var output = new StringBuilder("Address  Machine code              Source\n");
        foreach (var line in Listing)
        {
            if (line.Bytes.Length == 0) output.AppendLine($"{line.Address:X5}                            {line.Source.File}({line.Source.Number}): {line.Source.Text}");
            for (int i = 0; i < line.Bytes.Length; i += 8)
            {
                string data = string.Join(" ", line.Bytes.Skip(i).Take(8).Select(x => x.ToString("X2")));
                output.AppendLine($"{line.Address + i:X5}    {data,-23}   {(i == 0 ? $"{line.Source.File}({line.Source.Number}): {line.Source.Text}" : "")}");
            }
        }
        return output.ToString();
    }
    public string SymbolText() => string.Join(Environment.NewLine, Symbols.OrderBy(x => x.Key, StringComparer.OrdinalIgnoreCase).Select(x => $"{x.Key} EQU ${x.Value:X}")) + Environment.NewLine;
}

public sealed class AssemblerOptions
{
    public int Origin { get; init; }
    public byte Fill { get; init; }
    public Encoding SourceEncoding { get; init; } = new UTF8Encoding(false, true);
    public IReadOnlyList<string> IncludeDirectories { get; init; } = [];
    public IReadOnlyDictionary<string, long> Defines { get; init; } = new Dictionary<string, long>();
}

public sealed class Assembler
{
    private sealed record Statement(SourceLine Source, string? Label, string Op, string[] Args);
    private static readonly HashSet<string> Directives = new(StringComparer.OrdinalIgnoreCase) { "ORG", "EQU", "DB", "DEFB", "BYTE", "DW", "DEFW", "WORD", "DP", "DS", "DEFS", "SPACE", "ALIGN", "INCLUDE", "INCBIN", "END", "ASSERT" };
    public static long EvaluateExpression(string text) => new Expression(text, s => throw new AssemblyException($"Unknown symbol: {s}"), 0).Evaluate();
    /// <summary>Encode a single instruction with numeric operands, without assembly passes.</summary>
    public static byte[] EncodeInstruction(string mnemonic, string[] operands, int address = 0)
    {
        if (address is < 0 or > 0xfffff) throw new AssemblyException("Address must be 00000h..FFFFFh");
        long Eval(string text) => new Expression(text, s => throw new AssemblyException($"Unknown symbol: {s}"), address).Evaluate();
        byte[] bytes = new InstructionEncoder(Eval, address, true).Encode(mnemonic, operands);
        if ((address & 0xffff) + bytes.Length > 0x10000) throw new AssemblyException("Instruction crosses a 64 KiB segment boundary");
        return bytes;
    }
    private static bool Name(string s) => Regex.IsMatch(s, @"^[A-Za-z_\.][A-Za-z_0-9\.]*$");
    private static Statement Parse(SourceLine line)
    {
        string s = Syntax.StripComment(line.Text).Trim(); string? label = null;
        var match = Regex.Match(s, @"^([A-Za-z_\.][A-Za-z_0-9\.]*)\s*:");
        if (match.Success) { label = match.Groups[1].Value; s = s[match.Length..].Trim(); }
        else
        {
            match = Regex.Match(s, @"^([A-Za-z_\.][A-Za-z_0-9\.]*)\s+(?:\.?EQU\b|=)\s*(.*)$", RegexOptions.IgnoreCase);
            if (match.Success) return new(line, match.Groups[1].Value, "EQU", [match.Groups[2].Value]);
        }
        if (s.Length == 0) return new(line, label, "", []);
        int end = 0; while (end < s.Length && !char.IsWhiteSpace(s[end])) end++;
        string op = s[..end].ToUpperInvariant();
        if (op.StartsWith('.') && Directives.Contains(op[1..])) op = op[1..];
        return new(line, label, op, Syntax.Split(s[end..]));
    }
    public AssemblyResult AssembleFile(string path, AssemblerOptions? options = null)
    {
        options ??= new(); var statements = new List<Statement>(); var active = new HashSet<string>(StringComparer.OrdinalIgnoreCase); var inputFiles = new HashSet<string>(StringComparer.OrdinalIgnoreCase); bool ended = false;
        void Read(string file)
        {
            file = Path.GetFullPath(file);
            inputFiles.Add(file);
            if (active.Count >= 64 || !active.Add(file)) throw new AssemblyException($"Recursive INCLUDE: {file}");
            try
            {
                int number = 0;
                foreach (string text in File.ReadLines(file, options.SourceEncoding))
                {
                    if (ended) break;
                    var source = new SourceLine(file, ++number, text);
                    try
                    {
                        var statement = Parse(source);
                        if (statement.Op == "INCLUDE")
                        {
                            RequireCount(statement, 1);
                            if (statement.Label != null) throw new AssemblyException("INCLUDE cannot have a label");
                            Read(FindFile(Syntax.String(statement.Args[0]), file, options));
                        }
                        else { statements.Add(statement); if (statement.Op == "END") ended = true; }
                    }
                    catch (Exception e) when (e is AssemblyException or IOException or DecoderFallbackException) { throw At(source, e.Message); }
                }
            }
            finally { active.Remove(file); }
        }
        Read(path); var result = Assemble(statements, options); return result with { InputFiles = result.InputFiles.Concat(inputFiles).Distinct(StringComparer.OrdinalIgnoreCase).ToArray() };
    }
    public AssemblyResult AssembleText(string text, AssemblerOptions? options = null, string fileName = "<input>")
    {
        var statements = new List<Statement>(); int n = 0;
        foreach (string line in text.Replace("\r\n", "\n").Replace('\r', '\n').Split('\n'))
        {
            var source = new SourceLine(fileName, ++n, line);
            try { var statement = Parse(source); statements.Add(statement); if (statement.Op == "END") break; }
            catch (AssemblyException e) { throw At(source, e.Message); }
        }
        return Assemble(statements, options ?? new());
    }
    private static AssemblyException At(SourceLine line, string message) => new($"{line.File}({line.Number}): error: {message}");
    private static void RequireCount(Statement s, int min, int? max = null)
    {
        if (s.Args.Length < min || s.Args.Length > (max ?? min)) throw new AssemblyException($"{s.Op} requires {(max == null ? min.ToString() : $"{min}..{max}")} operand(s)");
    }
    private static string FindFile(string path, string source, AssemblerOptions options)
    {
        var candidates = new[] { Path.Combine(Path.GetDirectoryName(source) ?? ".", path) }.Concat(options.IncludeDirectories.Select(d => Path.Combine(d, path)));
        return candidates.FirstOrDefault(File.Exists) is string result ? Path.GetFullPath(result) : throw new AssemblyException($"File not found: {path}");
    }
    private static AssemblyResult Assemble(List<Statement> statements, AssemblerOptions options)
    {
        if (options.Origin is < 0 or > 0xfffff) throw new AssemblyException("Origin must be 00000h..FFFFFh");
        var knownNames = new HashSet<string>(options.Defines.Keys, StringComparer.OrdinalIgnoreCase);
        foreach (string name in knownNames) if (!Name(name)) throw new AssemblyException($"Invalid symbol: {name}");
        foreach (var s in statements)
        {
            if (s.Label != null && !knownNames.Add(s.Label)) throw At(s.Source, $"Duplicate symbol: {s.Label}");
            if (s.Op == "EQU" && s.Label == null) throw At(s.Source, "EQU requires a label");
        }
        var previous = new Dictionary<string, long>(options.Defines, StringComparer.OrdinalIgnoreCase);
        var binaryFiles = new Dictionary<Statement, byte[]>();
        var binaryPaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var previousLayout = Array.Empty<(int, int)>();
        List<ListingLine> listing = []; Dictionary<string, long> symbols = []; int finalPc = options.Origin; bool converged = false;
        for (int pass = 0; pass < 65; pass++)
        {
            bool strict = converged; bool unresolved = false;
            symbols = new(options.Defines, StringComparer.OrdinalIgnoreCase); listing = []; var layout = new List<(int, int)>();
            int pc = options.Origin;
            var equs = statements.Select((s, i) => (s, i)).Where(x => x.s.Op == "EQU" && x.s.Label != null).ToDictionary(x => x.s.Label!, StringComparer.OrdinalIgnoreCase);
            var resolving = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var equValues = new Dictionary<string, long>(StringComparer.OrdinalIgnoreCase);
            long ResolveFinal(string name)
            {
                if (equValues.TryGetValue(name, out long cached)) return cached;
                if (equs.TryGetValue(name, out var equ))
                {
                    if (!resolving.Add(name)) throw new AssemblyException($"Cyclic EQU definition: {name}");
                    RequireCount(equ.s, 1);
                    long v = new Expression(equ.s.Args[0], ResolveFinal, previousLayout[equ.i].Item1).Evaluate();
                    resolving.Remove(name); equValues[name] = v; return v;
                }
                return previous.TryGetValue(name, out long value) ? value : throw new AssemblyException($"Undefined symbol: {name}");
            }
            foreach (var s in statements)
            {
                try
                {
                    long Eval(string expression)
                    {
                        bool missing = false;
                        long Symbol(string name)
                        {
                            if (strict) return ResolveFinal(name);
                            if (symbols.TryGetValue(name, out long v) || previous.TryGetValue(name, out v)) return v;
                            if (strict) throw new AssemblyException($"Undefined symbol: {name}");
                            missing = unresolved = true; return 0;
                        }
                        try { return new Expression(expression, Symbol, pc).Evaluate(); }
                        catch (DivideByZeroException) when (!strict && missing) { return 0; }
                    }
                    int Range(string expression, int min, int max)
                    {
                        long v = Eval(expression);
                        if (v < min || v > max) { if (strict) throw new AssemblyException($"Value {v} outside {min}..{max}"); return min; }
                        return (int)v;
                    }
                    if (s.Label != null && s.Op != "EQU") symbols[s.Label] = pc;
                    int address = pc; byte[] data = [];
                    switch (s.Op)
                    {
                        case "": break;
                        case "EQU": RequireCount(s, 1); symbols[s.Label!] = Eval(s.Args[0]); break;
                        case "ORG": RequireCount(s, 1); pc = Range(s.Args[0], 0, 0xfffff); address = pc; break;
                        case "DB": case "DEFB": case "BYTE": case "DW": case "DEFW": case "WORD": case "DP":
                        {
                            if (s.Args.Length == 0) throw new AssemblyException($"{s.Op} requires data");
                            int width = s.Op is "DW" or "DEFW" or "WORD" ? 2 : s.Op == "DP" ? 3 : 1;
                            var values = new List<byte>();
                            foreach (string arg in s.Args)
                            {
                                if (arg.StartsWith('"'))
                                {
                                    if (width != 1) throw new AssemblyException("Strings are only valid in DB");
                                    foreach (char c in Syntax.String(arg)) { if (c > 255) throw new AssemblyException("DB strings must be single-byte characters; use numeric bytes for PC-E500 characters"); values.Add((byte)c); }
                                }
                                else
                                {
                                    int v = Range(arg, -(1 << (width * 8 - 1)), (1 << (width * 8)) - 1);
                                    for (int i = 0; i < width; i++) values.Add((byte)(v >> (8 * i)));
                                }
                            }
                            data = values.ToArray(); break;
                        }
                        case "DS": case "DEFS": case "SPACE": case "ALIGN":
                        {
                            RequireCount(s, 1, 2); int count = Range(s.Args[0], s.Op == "ALIGN" ? 1 : 0, 0x100000);
                            if (s.Op == "ALIGN") count = (count - pc % count) % count;
                            byte fill = s.Args.Length == 2 ? (byte)Range(s.Args[1], 0, 255) : options.Fill;
                            data = new byte[count]; if (fill != 0) Array.Fill(data, fill); break;
                        }
                        case "INCBIN":
                        {
                            RequireCount(s, 1, 3);
                            if (!binaryFiles.TryGetValue(s, out byte[]? raw))
                            {
                                string path = FindFile(Syntax.String(s.Args[0]), s.Source.File, options); binaryPaths.Add(path);
                                binaryFiles[s] = raw = File.ReadAllBytes(path);
                            }
                            int offset = s.Args.Length >= 2 ? Range(s.Args[1], 0, raw.Length) : 0;
                            int length = s.Args.Length >= 3 ? Range(s.Args[2], 0, raw.Length - offset) : raw.Length - offset;
                            data = raw[offset..(offset + length)]; break;
                        }
                        case "ASSERT": RequireCount(s, 1); if (Eval(s.Args[0]) == 0 && strict) throw new AssemblyException("ASSERT failed"); break;
                        case "END": RequireCount(s, 0); break;
                        case "INCLUDE": throw new AssemblyException("INCLUDE requires AssembleFile");
                        default:
                            data = new InstructionEncoder(Eval, pc, strict).Encode(s.Op, s.Args);
                            if (strict && (pc & 0xffff) + data.Length > 0x10000) throw new AssemblyException("Instruction crosses a 64 KiB segment boundary");
                            break;
                    }
                    if ((long)pc + data.Length > 0x100000) throw new AssemblyException("Output exceeds 20-bit address space");
                    listing.Add(new(s.Source, address, data)); layout.Add((address, data.Length)); pc += data.Length;
                }
                catch (Exception e) when (e is AssemblyException or OverflowException or DivideByZeroException or IOException or UnauthorizedAccessException) { throw At(s.Source, e.Message); }
            }
            finalPc = pc;
            bool same = previousLayout.SequenceEqual(layout) && previous.Count == symbols.Count && previous.All(x => symbols.TryGetValue(x.Key, out long v) && v == x.Value);
            if (strict)
            {
                if (!same) throw new AssemblyException("Assembly layout changed during final pass");
                break;
            }
            // A stable pass with missing names must still run strictly to diagnose them.
            converged = same;
            if (!same && pass == 63) throw new AssemblyException("Assembly layout did not converge (cyclic EQU/ORG or unstable allocation)");
            previous = symbols; previousLayout = layout.ToArray();
            _ = unresolved;
        }
        var emitted = listing.Where(x => x.Bytes.Length != 0).ToArray();
        int origin = emitted.Length == 0 ? finalPc : emitted.Min(x => x.Address);
        int endAddress = emitted.Length == 0 ? origin : emitted.Max(x => x.Address + x.Bytes.Length);
        var binary = new byte[endAddress - origin]; Array.Fill(binary, options.Fill); var occupied = new bool[binary.Length];
        foreach (var line in emitted)
            for (int i = 0; i < line.Bytes.Length; i++)
            {
                int index = line.Address + i - origin;
                if (occupied[index]) throw At(line.Source, $"Overlapping output at {line.Address + i:X5}h");
                occupied[index] = true; binary[index] = line.Bytes[i];
            }
        return new(origin, binary, symbols, listing) { InputFiles = binaryPaths.ToArray() };
    }
}
