using System.Text;
using E500Assembler;

Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
Console.OutputEncoding = new UTF8Encoding(false);
try { return Run(args); }
catch (Exception e) when (e is AssemblyException or IOException or UnauthorizedAccessException or ArgumentException or DecoderFallbackException or OverflowException or DivideByZeroException)
{ Console.Error.WriteLine(e is AssemblyException ? e.Message : "error: " + e.Message); return 1; }

static int Run(string[] args)
{
    string? input = null, output = null, listing = null, symbols = null; string format = "bin", encoding = "utf-8";
    int origin = 0, fill = 0; var includes = new List<string>(); var defines = new Dictionary<string, long>(StringComparer.OrdinalIgnoreCase);
    for (int i = 0; i < args.Length; i++)
    {
        string Next() => ++i < args.Length ? args[i] : throw new AssemblyException($"Missing value for {args[i - 1]}");
        switch (args[i])
        {
            case "--help": case "-h": Help(); return 0;
            case "--version": Console.WriteLine("e500asm 0.1.0 (SC62015)"); return 0;
            case "-o": case "--output": output = Next(); break;
            case "-f": case "--format": format = Next().ToLowerInvariant(); break;
            case "-l": case "--listing": listing = Next(); break;
            case "-s": case "--symbols": symbols = Next(); break;
            case "--org": origin = checked((int)Assembler.EvaluateExpression(Next())); break;
            case "--fill": fill = checked((int)Assembler.EvaluateExpression(Next())); break;
            case "--encoding": encoding = Next(); break;
            case "-I": includes.Add(Next()); break;
            case "-D":
                string definition = Next(); int split = definition.IndexOf('=');
                string key = split < 0 ? definition : definition[..split];
                if (!defines.TryAdd(key, split < 0 ? 1 : Assembler.EvaluateExpression(definition[(split + 1)..]))) throw new AssemblyException($"Duplicate -D symbol: {key}");
                break;
            default:
                if (args[i].StartsWith('-')) throw new AssemblyException($"Unknown option: {args[i]}");
                if (input != null) throw new AssemblyException("Specify one input assembly file"); input = args[i]; break;
        }
    }
    if (input == null) { Help(); return args.Length == 0 ? 0 : 1; }
    if (format is not ("bin" or "hex")) throw new AssemblyException("Format must be bin or hex");
    if (fill is < 0 or > 255) throw new AssemblyException("Fill must be 0..255");
    output ??= Path.ChangeExtension(input, format == "bin" ? ".bin" : ".hex");
    var paths = new[] { output, listing, symbols }.Where(p => p != null).Select(p => Path.GetFullPath(p!)).ToArray();
    if (paths.Distinct(StringComparer.OrdinalIgnoreCase).Count() != paths.Length) throw new AssemblyException("Output, listing and symbols must have different paths");
    if (paths.Contains(Path.GetFullPath(input), StringComparer.OrdinalIgnoreCase)) throw new AssemblyException("Output would overwrite the input source");
    Encoding sourceEncoding = Encoding.GetEncoding(encoding, EncoderFallback.ExceptionFallback, DecoderFallback.ExceptionFallback);
    var result = new Assembler().AssembleFile(input, new AssemblerOptions { Origin = origin, Fill = (byte)fill, SourceEncoding = sourceEncoding, IncludeDirectories = includes, Defines = defines });
    var sources = result.InputFiles.ToHashSet(StringComparer.OrdinalIgnoreCase);
    if (paths.Any(sources.Contains)) throw new AssemblyException("Output would overwrite an included source");
    var outputs = new List<(string Path, byte[] Data)> { (output, format == "bin" ? result.Binary : Encoding.ASCII.GetBytes(result.IntelHex())) };
    if (listing != null) outputs.Add((listing, Encoding.UTF8.GetBytes(result.ListingText())));
    if (symbols != null) outputs.Add((symbols, Encoding.UTF8.GetBytes(result.SymbolText())));
    // Stage every file before replacing existing results. Assembly errors never touch output.
    var staged = new List<(string Target, string Temp)>();
    try
    {
        foreach (var item in outputs)
        {
            string path = Path.GetFullPath(item.Path); Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            string temp = path + "." + Guid.NewGuid().ToString("N") + ".tmp"; staged.Add((path, temp)); File.WriteAllBytes(temp, item.Data);
        }
        foreach (var item in staged) File.Move(item.Temp, item.Target, true);
    }
    finally { foreach (var item in staged) if (File.Exists(item.Temp)) File.Delete(item.Temp); }
    Console.WriteLine($"OK: {result.Binary.Length} bytes, origin={result.Origin:X5}h -> {Path.GetFullPath(output)}");
    return 0;
}

static void Help() => Console.WriteLine("""
e500asm 0.1.0 - SHARP PC-E500 series / SC62015 cross assembler
Usage: e500asm source.asm [options]
  -o, --output PATH     Output path (default: source.bin / source.hex)
  -f, --format bin|hex  Raw binary or Intel HEX (default: bin)
  -l, --listing PATH    Address / bytes / source listing
  -s, --symbols PATH    Symbol table
  --org VALUE          Initial origin (default: 0; source ORG takes precedence)
  --fill VALUE         Fill gaps and reserved space (default: 0)
  --encoding NAME      Source encoding: utf-8 (default), shift_jis, etc.
  -I DIRECTORY         INCLUDE / INCBIN search path (repeatable)
  -D NAME=VALUE        Define a constant (repeatable; default value: 1)
  -h, --help           Show this help
  --version            Show version
Numbers: decimal, $hex, &hex, 0xhex, 0FFh, 0bbinary.
Exit code: 0 = success/help, 1 = error. Source defaults to UTF-8.
""");
