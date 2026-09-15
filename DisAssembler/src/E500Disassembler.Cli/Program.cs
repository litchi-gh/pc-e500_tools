using System.Globalization;
using System.Text;
using E500Disassembler;

Console.OutputEncoding = new UTF8Encoding(false);
try { return Run(args); }
catch (Exception e) when (e is DisassemblyException or IOException or UnauthorizedAccessException or ArgumentException or OverflowException)
{ Console.Error.WriteLine(e is DisassemblyException ? e.Message : "error: " + e.Message); return 1; }

static int Run(string[] args)
{
    string? input = null, output = null; InputFormat? format = null; int? origin = null;
    bool labels = true, addresses = true, bytes = true;
    for (int i = 0; i < args.Length; i++)
    {
        string Next() => ++i < args.Length ? args[i] : throw new DisassemblyException($"Missing value for {args[i - 1]}");
        switch (args[i].ToLowerInvariant())
        {
            case "-h": case "--help": Help(); return 0;
            case "--version": Console.WriteLine("e500dasm 0.1.0 (SC62015)"); return 0;
            case "-o": case "--output": output = Next(); break;
            case "-f": case "--format":
                string f = Next().ToLowerInvariant();
                format = f switch { "raw" => InputFormat.Raw, "ce140f" or "save-m" => InputFormat.Ce140f, _ => throw new DisassemblyException("Format must be raw or ce140f") }; break;
            case "--org": origin = Number(Next()); break;
            case "--no-labels": labels = false; break;
            case "--no-addresses": addresses = false; break;
            case "--no-bytes": bytes = false; break;
            default:
                if (args[i].StartsWith('-')) throw new DisassemblyException($"Unknown option: {args[i]}");
                if (input != null) throw new DisassemblyException("Specify one input file"); input = args[i]; break;
        }
    }
    if (input == null) { Help(); return args.Length == 0 ? 0 : 1; }
    if (format == null) throw new DisassemblyException("Select input format with --format raw or --format ce140f");
    output ??= Path.ChangeExtension(input, ".asm");
    string inputPath = Path.GetFullPath(input), outputPath = Path.GetFullPath(output);
    if (string.Equals(inputPath, outputPath, StringComparison.OrdinalIgnoreCase)) throw new DisassemblyException("Output would overwrite the input file");
    var result = new Disassembler().DisassembleFile(inputPath, format.Value, origin, new() { GenerateLabels = labels, ShowAddresses = addresses, ShowBytes = bytes });
    Directory.CreateDirectory(Path.GetDirectoryName(outputPath)!);
    string temp = outputPath + "." + Guid.NewGuid().ToString("N") + ".tmp";
    try { File.WriteAllText(temp, result.Source, new UTF8Encoding(false)); File.Move(temp, outputPath, true); }
    finally { if (File.Exists(temp)) File.Delete(temp); }
    Console.WriteLine($"OK: {result.Image.Payload.Length} bytes, origin={result.Image.Origin:X5}h, {result.InstructionCount} instructions, {result.DataByteCount} DB bytes -> {outputPath}");
    return 0;
}

static int Number(string text)
{
    string n = text.Trim().Replace("_", ""); int radix = 16;
    if (n.StartsWith('$') || n.StartsWith('&')) n = n[1..];
    else if (n.StartsWith("0x", StringComparison.OrdinalIgnoreCase)) { n = n[2..]; radix = 16; }
    else if (n.EndsWith('h') || n.EndsWith('H')) { n = n[..^1]; radix = 16; }
    try { return Convert.ToInt32(n, radix); } catch { throw new DisassemblyException($"Invalid number: {text}"); }
}

static void Help() => Console.WriteLine("""
e500dasm 0.1.0 - SHARP PC-E500 series / SC62015 disassembler
Usage: e500dasm input-file --format raw|ce140f [options]
  -f, --format raw|ce140f   RAW or CE-140F SAVE M with 16-byte header (required)
  --org ADDRESS             RAW load/start address (required for RAW)
  -o, --output PATH         Assembly output (default: input-file.asm)
  --no-labels               Keep branch targets numeric
  --no-addresses            Hide addresses in comments
  --no-bytes                Hide machine bytes in comments
  -h, --help                Show this help
  --version                 Show version
Addresses are hexadecimal: B8000, $B8000, &B8000, 0xB8000 or 0B8000h.
Exit code: 0 success, 1 error.
""");
