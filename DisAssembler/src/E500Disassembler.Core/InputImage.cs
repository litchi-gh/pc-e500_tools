namespace E500Disassembler;

public enum InputFormat { Raw, Ce140f }
public sealed class DisassemblyException(string message) : Exception(message);

public sealed record InputImage(byte[] Payload, int Origin, InputFormat Format, byte[] Header)
{
    public static InputImage Read(byte[] file, InputFormat format, int? rawOrigin = null)
    {
        if (format is not (InputFormat.Raw or InputFormat.Ce140f)) throw new DisassemblyException("Unknown input format");
        if (format == InputFormat.Raw)
        {
            if (rawOrigin == null) throw new DisassemblyException("RAW input requires a start address (--org)");
            ValidateRange(rawOrigin.Value, file.Length);
            return new((byte[])file.Clone(), rawOrigin.Value, format, []);
        }
        if (rawOrigin != null) throw new DisassemblyException("CE-140F input uses the header address; --org is for RAW only");
        if (file.Length < 16) throw new DisassemblyException("CE-140F file is shorter than its 16-byte header");
        if (!file.AsSpan(0, 5).SequenceEqual(new byte[] { 0xff, 0, 6, 1, 0x10 }))
            throw new DisassemblyException("Not a CE-140F SAVE M machine-code header (expected FF 00 06 01 10)");
        if (!file.AsSpan(11, 5).SequenceEqual(new byte[] { 0xff, 0xff, 0xff, 0, 0x0f }))
            throw new DisassemblyException("Unsupported CE-140F header tail (expected FF FF FF 00 0F)");
        int length = Read24(file, 5), origin = Read24(file, 8);
        if (length != file.Length - 16) throw new DisassemblyException($"Header length {length} does not match payload length {file.Length - 16}; no data was discarded");
        ValidateRange(origin, length);
        return new(file[16..], origin, format, file[..16]);
    }
    public static InputImage ReadFile(string path, InputFormat format, int? rawOrigin = null)
    {
        if (new FileInfo(path).Length > 0x100010) throw new DisassemblyException("Input exceeds the SC62015 1 MiB address space plus header");
        return Read(File.ReadAllBytes(path), format, rawOrigin);
    }
    public byte[] Rewrap(byte[] payload)
    {
        if (payload.Length != Payload.Length) throw new DisassemblyException("Payload size changed; the saved header cannot be reused unchanged");
        return [.. Header, .. payload];
    }
    internal static void ValidateRange(int origin, int length)
    {
        if (origin is < 0 or > 0xfffff || length < 0 || (long)origin + length > 0x100000)
            throw new DisassemblyException("Image must fit in addresses 00000h..FFFFFh");
    }
    private static int Read24(byte[] bytes, int offset) => bytes[offset] | bytes[offset + 1] << 8 | bytes[offset + 2] << 16;
}
