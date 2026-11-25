using System.Numerics;

namespace E500DebugServer;

/// <summary>Stop reasons of <see cref="Machine.Run"/>.</summary>
internal enum StopReason { None = 0, Fault = 1, Breakpoint = 2, Depth = 3, Read = 4 }

/// <summary>
/// One emulated PC-E500: the core, the keys still to be typed (each held for a
/// number of CPU cycles, as a person would), and the screen read as text.
/// エミュレータ1台分。コア、打ち込み待ちのキー（押している時間つき）、画面の文字の読み取り。
/// </summary>
internal sealed class Machine : IDisposable
{
    /// <summary>CPU cycles in one emulated second.</summary>
    internal const int CpuHz = 768000;
    const int KeyDownCycles = 18000, KeyUpCycles = 24000, ModeSettleCycles = 200000, ShiftCycles = 18000;

    /// <summary>Register ids of e500_reg (the SC62015 REGNAME order).</summary>
    internal static readonly Dictionary<string, int> RegisterIds = new(StringComparer.OrdinalIgnoreCase)
    {
        ["A"] = 0, ["IL"] = 1, ["BA"] = 2, ["I"] = 3, ["X"] = 4, ["Y"] = 5, ["U"] = 7, ["S"] = 8, ["P"] = 9, ["F"] = 10
    };

    // Keyboard matrix: 12 rows of 8 bits (key names as printed on the case).
    static readonly string[][] Matrix =
    [
        ["TEXT", "Q", "MENU", "A", "BASIC", "Z", "SHIFT", "CTRL"],
        ["W", "E", "S", "D", "X", "C", "CAPS", "KANA"],
        ["R", "T", "F", "G", "V", "B", "SPACE", "DOWN"],
        ["Y", "U", "H", "J", "N", "M", "UP", "LEFT"],
        ["I", "O", "K", "L", ",", ";", "RIGHT", "ENTER"],
        ["RCL", "HYP", "HEX", "EXP", "7", "4", "1", "0"],
        ["STO", "SIN", "DEG", "^", "8", "5", "2", "+/-"],
        ["C-CE", "COS", "LN", "SQRT", "9", "6", "3", "."],
        ["STAT", "TAN", "LOG", "x²", "/", "*", "-", "+"],
        [")", "FSE", "1/x", "(", "DEL", "BS", "INS", "="],
        ["P", "2ndF", "F5", "F4", "F3", "F2", "F1", ""],
        ["OFF", "ON/BRK", "", "", "", "", "", ""]
    ];
    internal static readonly Dictionary<string, int> KeyCodes = Matrix
        .SelectMany((row, r) => row.Select((name, b) => (name, code: r * 8 + b)))
        .Where(x => x.name != "").ToDictionary(x => x.name, x => x.code, StringComparer.OrdinalIgnoreCase);
    // Characters typed with SHIFT, and the key under them.
    static readonly Dictionary<char, string> Shifted = new()
    {
        ['!'] = "Q", ['"'] = "W", ['#'] = "E", ['$'] = "R", ['%'] = "T", ['&'] = "Y", ['\''] = "U",
        ['<'] = "I", ['>'] = "O", ['@'] = "P", ['['] = "A", [']'] = "S", ['{'] = "D", ['}'] = "F",
        ['\\'] = "G", ['|'] = "H", ['~'] = "J", ['_'] = "K", ['`'] = "M", ['?'] = ",", [':'] = ";"
    };

    readonly Queue<(int Code, bool Down, int Cycles)> keys = new();
    int keyWait;
    readonly byte[] font = [];
    readonly Dictionary<ulong, char> glyphs = [];

    internal IntPtr Handle { get; }
    internal byte[] Rom { get; }
    internal string RomVersion { get; }
    internal int RomKB => Rom.Length / 1024;
    internal int InternalKB => Native.e500_capacity(Handle, 0);
    internal int CardKB => Native.e500_capacity(Handle, 1);
    internal ulong Cycles => Native.e500_cycles(Handle);
    /// <summary>Keys still waiting to be pressed or released.</summary>
    internal bool Typing => keys.Count > 0 || keyWait > 0;

    internal Machine(string romPath, int ramKB, int cardKB)
    {
        var rom = File.ReadAllBytes(romPath);
        // A dump straight from the machine (SAVEM) has a 16-byte header before the C0000-FFFFF ROM.
        if (rom.Length == 256 * 1024 + 16 && rom[0] == 0xff && rom[1] == 0 && rom[2] == 6) rom = rom[16..];
        if (rom.Length != 256 * 1024 && rom.Length != 384 * 1024)
            throw new InvalidDataException(Lang.L("ROM は 256KB（PC-E500 など）か 384KB（PC-E500S・E650・U6000）のイメージを指定してください。", "Give a 256KB ROM image (PC-E500 etc.) or a 384KB one (PC-E500S, E650, U6000)."));
        Rom = rom;
        RomVersion = rom[^16] <= 99 && rom[^15] <= 99 ? $"{rom[^16]}.{rom[^15]}" : "?";
        // The E650 and U6000 carry 64KB as standard; their smallest internal RAM.
        if (rom.Length == 384 * 1024 && rom[^15] != 3 && ramKB < 64) ramKB = 64;
        Handle = Native.e500_create_config(rom, rom.Length, ramKB, cardKB);
        if (Handle == IntPtr.Zero) throw new InvalidOperationException(Lang.L($"エミュレータを作れません（RAM {ramKB}KB、カード {cardKB}KB）。", $"Cannot create the emulator (RAM {ramKB}KB, card {cardKB}KB)."));
        int fontAt = FindFont(rom);
        if (fontAt >= 0)
        {
            font = rom.AsSpan(fontAt, (0xe0 - 0x20) * 6).ToArray();
            for (int code = 0x20; code < 0xe0; code++)
            {
                char? c = code switch { >= 0x20 and <= 0x7e => (char)code, >= 0xa1 and <= 0xdf => (char)(0xff61 + code - 0xa1), _ => null };
                if (c is null) continue;
                ulong pattern = 0;
                for (int x = 0; x < 6; x++) pattern |= (ulong)font[(code - 0x20) * 6 + x] << (x * 8);
                glyphs.TryAdd(pattern, c.Value);
            }
        }
    }

    public void Dispose() => Native.e500_destroy(Handle);

    // The ROM's 6x8 font is found by the shapes of 0-3; it starts 16 characters earlier, at 20h.
    static int FindFont(byte[] rom)
    {
        byte[] digits = [0x3e, 0x51, 0x49, 0x45, 0x3e, 0x00, 0x00, 0x42, 0x7f, 0x40, 0x00, 0x00, 0x42, 0x61, 0x51, 0x49, 0x46, 0x00, 0x41, 0x49, 0x4d, 0x4b, 0x31, 0x00];
        int at = rom.AsSpan().IndexOf(digits) - 16 * 6;
        return at < 0 || at + (0xe0 - 0x20) * 6 > rom.Length ? -1 : at;
    }

    /// <summary>
    /// Runs up to <paramref name="cycles"/> CPU cycles, pressing and releasing the
    /// queued keys on time. Breakpoints stop it (not on the first instruction when
    /// <paramref name="resume"/>), and so does a return below <paramref name="depth"/> frames.
    /// </summary>
    internal (StopReason Reason, int Ran) Run(int cycles, bool resume, int depth = -1)
    {
        ulong start = Cycles;
        bool first = true;
        while (true)
        {
            int ran = (int)(Cycles - start);
            int left = cycles - ran;
            if (left <= 0) return (StopReason.None, ran);
            if (keyWait <= 0 && keys.TryDequeue(out var key))
            {
                Native.e500_key(Handle, key.Code / 8, key.Code % 8, key.Down ? 1 : 0);
                keyWait = key.Cycles;
            }
            int slice = keyWait > 0 ? Math.Min(left, keyWait) : left;
            ulong before = Cycles;
            int result = Native.e500_debug_run(Handle, slice, first && resume ? 1 : 0, depth);
            first = false;
            keyWait = Math.Max(0, keyWait - (int)(Cycles - before));
            if (result != 0) return ((StopReason)result, (int)(Cycles - start));
        }
    }

    /// <summary>Runs one instruction (a prefix and its instruction are one).</summary>
    internal StopReason Step() => Native.e500_debug_step(Handle) == 0 ? StopReason.None : StopReason.Fault;

    /// <summary>Presses (or releases) one key now.</summary>
    internal void Key(string name, bool down)
    {
        if (!KeyCodes.TryGetValue(name, out int code)) throw new ArgumentException(Lang.L($"キー {name} はありません。", $"There is no key {name}."));
        Native.e500_key(Handle, code / 8, code % 8, down ? 1 : 0);
    }

    /// <summary>Queues one press and release of a key.</summary>
    internal void Tap(string name)
    {
        if (!KeyCodes.TryGetValue(name, out int code)) throw new ArgumentException(Lang.L($"キー {name} はありません。", $"There is no key {name}."));
        keys.Enqueue((code, true, KeyDownCycles));
        keys.Enqueue((code, false, name is "BASIC" or "MENU" or "F1" ? ModeSettleCycles : KeyUpCycles));
    }

    /// <summary>Queues text as key presses (a newline is ENTER). Returns the characters that have no key.</summary>
    internal string Type(string text)
    {
        var skipped = new System.Text.StringBuilder();
        foreach (char raw in text.Replace("\r\n", "\n"))
        {
            if (raw == '\n') { Tap("ENTER"); continue; }
            string name = raw == ' ' ? "SPACE" : char.ToUpperInvariant(raw).ToString();
            if (KeyCodes.ContainsKey(name)) { Tap(name); continue; }
            if (Shifted.TryGetValue(raw, out var under))
            {
                keys.Enqueue((KeyCodes["SHIFT"], true, ShiftCycles));
                Tap(under);
                keys.Enqueue((KeyCodes["SHIFT"], false, ShiftCycles));
                continue;
            }
            skipped.Append(raw);
        }
        return skipped.ToString();
    }

    /// <summary>Drops the keys still to be typed and lets go of every key.</summary>
    internal void ReleaseKeys()
    {
        keys.Clear(); keyWait = 0;
        Native.e500_release_keys(Handle);
    }

    internal byte[] Pixels()
    {
        var pixels = new byte[240 * 32];
        Native.e500_pixels(Handle, pixels);
        return pixels;
    }

    /// <summary>The LCD symbols (BUSY, RUN, PRO, 2ndF ...) as e500_symbols bytes 0, 4, 5 and 6.</summary>
    internal int[] Symbols() => [Native.e500_symbols(Handle, 0), Native.e500_symbols(Handle, 4), Native.e500_symbols(Handle, 5), Native.e500_symbols(Handle, 6)];

    /// <summary>The 40 x 4 characters on the LCD, matched against the ROM's font (□ where none matches).</summary>
    internal string ScreenText(byte[]? pixels = null)
    {
        pixels ??= Pixels();
        if (glyphs.Count == 0) return "";
        var lines = new string[4];
        for (int row = 0; row < 4; row++)
        {
            var text = new char[40];
            for (int col = 0; col < 40; col++)
            {
                ulong pattern = 0;
                for (int x = 0; x < 6; x++)
                {
                    byte bits = 0;
                    for (int y = 0; y < 8; y++) if (pixels[(row * 8 + y) * 240 + col * 6 + x] != 0) bits |= (byte)(1 << y);
                    pattern |= (ulong)bits << (x * 8);
                }
                ulong inverse = ~pattern & ((1UL << 48) - 1);
                if (glyphs.TryGetValue(pattern, out char c) || glyphs.TryGetValue(inverse, out c)) { text[col] = c; continue; }
                int best = 3; c = '□';
                foreach (var (glyph, ch) in glyphs)
                {
                    int d = Math.Min(BitOperations.PopCount(pattern ^ glyph), BitOperations.PopCount(inverse ^ glyph));
                    if (d < best) { best = d; c = ch; }
                }
                text[col] = c;
            }
            lines[row] = new string(text).TrimEnd();
        }
        return string.Join("\n", lines).TrimEnd('\n');
    }

    internal uint Register(string name) => Native.e500_reg(Handle, RegisterIds.TryGetValue(name, out int id) ? id : throw new ArgumentException(Lang.L($"レジスタ {name} はありません。", $"There is no register {name}.")));
    internal void SetRegister(string name, uint value) => Native.e500_set_reg(Handle, RegisterIds.TryGetValue(name, out int id) ? id : throw new ArgumentException(Lang.L($"レジスタ {name} はありません。", $"There is no register {name}.")), value);

    internal byte[] Read(int address, int length)
    {
        address &= 0xfffff;
        length = Math.Clamp(length, 0, 0x100000 - address);
        var data = new byte[length];
        if (length > 0 && Native.e500_dump(Handle, address, data, length) == 0) throw new InvalidOperationException(Lang.L("メモリを読めません。", "Cannot read the memory."));
        return data;
    }

    internal bool Write(int address, byte[] data) => data.Length == 0 || Native.e500_write(Handle, address, data, data.Length) != 0;

    internal byte[] InternalMemory()
    {
        var data = new byte[256];
        Native.e500_imem(Handle, data);
        return data;
    }

    /// <summary>Writes internal RAM 00h-EEh; false when the range reaches the AMC or the I/O.</summary>
    internal bool WriteInternalMemory(int at, byte[] data)
    {
        try { return Native.e500_debug_write_imem(Handle, at, data, data.Length) != 0; }
        catch (EntryPointNotFoundException)
        {
            throw new InvalidOperationException(Lang.L("この e500core.dll は内部 RAM の書き込みに対応していません。新しいエミュレータの e500core.dll を使ってください。",
                "This e500core.dll cannot write internal RAM. Use the e500core.dll of a newer emulator."));
        }
    }

    /// <summary>Calls frames, oldest first: (call site, target, S after the push, interrupt).</summary>
    internal List<(uint Site, uint Target, uint Sp, bool Interrupt)> Frames()
    {
        int n = Native.e500_debug_frames(Handle, null, 0);
        var raw = new uint[n * 4];
        n = Math.Min(n, Native.e500_debug_frames(Handle, raw, n));
        var list = new List<(uint, uint, uint, bool)>(n);
        for (int i = 0; i < n; i++) list.Add((raw[i * 4], raw[i * 4 + 1], raw[i * 4 + 2], raw[i * 4 + 3] != 0));
        return list;
    }

    internal byte[] SaveState()
    {
        var data = new byte[Native.e500_state_size()];
        if (Native.e500_save(Handle, data, data.Length) == 0) throw new InvalidOperationException(Lang.L("今は状態を保存できません（周辺機器の通信中など）。", "The state cannot be saved now (a peripheral is busy, for example)."));
        return data;
    }

    internal void LoadState(byte[] data)
    {
        if (Native.e500_load(Handle, data, data.Length) == 0) throw new InvalidOperationException(Lang.L("この状態は読み込めません（別の ROM・RAM 構成のものなど）。", "This state cannot be loaded (it is of another ROM or RAM set-up, for example)."));
        ReleaseKeys();
        Native.e500_debug_clear_frames(Handle);
    }

    /// <summary>The machine-code area (start, size) from the pointer at BFD1Ah, or null when RAM is not set up.</summary>
    internal (int Start, int Size)? MachineCodeArea()
    {
        var b = Read(0xbfd1a, 3);
        int start = b[0] | b[1] << 8 | b[2] << 16, bottom = 0xc0000 - InternalKB * 1024;
        return start < bottom || start > 0xbfc00 ? null : (start, 0xbfc00 - start);
    }

    /// <summary>The BASIC line that sizes the machine-code area (the ROM's own routine at FFFD8h).</summary>
    internal static string MachineCodeCommand(int size)
    {
        const int pointer = 0xbfd1a;
        return $"POKE {0xbfe03},{pointer & 0xff},{(pointer >> 8) & 0xff},{pointer >> 16},{size & 0xff},{(size >> 8) & 0xff},{size >> 16}:CALL {0xfffd8}";
    }

    /// <summary>Mode lamps: BUSY (a program running), RUN, PRO.</summary>
    internal (bool Busy, bool Run, bool Pro) Mode()
    {
        int s = Native.e500_symbols(Handle, 0);
        return ((s & 1) != 0, (s & 2) != 0, (s & 4) != 0);
    }
}
