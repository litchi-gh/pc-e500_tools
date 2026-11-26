using System.Collections.Concurrent;
using System.Diagnostics;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using E500Disassembler;

namespace E500DebugServer;

/// <summary>
/// e500dbg: runs a PC-E500 for the VS Code extension. One JSON object per line:
/// requests on stdin ({"id","cmd","args"}), responses ({"id","ok","body"|"error"})
/// and events ({"event","body"}) on stdout. The machine runs on the main thread,
/// in real time while "running", and every request is handled between slices.
/// VS Code 拡張のための PC-E500 実行サーバー。stdin/stdout に 1 行 1 JSON。
/// </summary>
internal static class Program
{
    static readonly BlockingCollection<JsonObject?> requests = new();
    static readonly object writeLock = new();
    static readonly Stream stdout = Console.OpenStandardOutput();
    static Machine? machine;
    // Running state.
    static bool running;
    static bool resume;
    static int depth = -1;
    static double speed = 1;
    static readonly Stopwatch clock = new();
    static ulong clockCycles;
    // Breakpoints of the client, and the address a "call" returns to.
    static uint[] breakpoints = [];
    static int? returnAddress;
    // The CPU as it was before a "call": put back once the routine returns, so the
    // ROM goes on waiting at its prompt as if nothing had happened.
    static (Dictionary<string, uint> Registers, bool Halt)? beforeCall;
    // Screen updates go out at most 60 times a second, and only when something changed.
    static byte[] lastPixels = [];
    static int[] lastSymbols = [];
    static readonly Stopwatch frameClock = Stopwatch.StartNew();
    static bool framesOn = true;
    // S before a CALL that is stepped over, and a "call" not yet gone on from.
    static uint? stepS;
    static uint stepNext;
    static bool called;

    static int Main(string[] args)
    {
        Console.InputEncoding = new UTF8Encoding(false);
        string? core = null;
        for (int i = 0; i < args.Length; i++)
        {
            if (args[i] == "--core" && i + 1 < args.Length) core = args[++i];
            else if (args[i] == "--lang" && i + 1 < args.Length) Lang.English = args[++i] != "ja";
        }
        try
        {
            Native.Load(core ?? Path.Combine(AppContext.BaseDirectory, OperatingSystem.IsWindows() ? "e500core.dll" : OperatingSystem.IsMacOS() ? "libe500core.dylib" : "libe500core.so"));
        }
        catch (Exception e)
        {
            Send(new JsonObject { ["event"] = "fatal", ["body"] = new JsonObject { ["message"] = e.Message } });
            return 2;
        }
        var reader = new Thread(() =>
        {
            using var input = new StreamReader(Console.OpenStandardInput(), new UTF8Encoding(false));
            string? line;
            while ((line = input.ReadLine()) != null)
            {
                if (line.Trim().Length == 0) continue;
                try { requests.Add(JsonNode.Parse(line) as JsonObject); }
                catch (JsonException e) { Send(new JsonObject { ["event"] = "output", ["body"] = new JsonObject { ["text"] = "bad request: " + e.Message } }); }
            }
            requests.Add(null);
        }) { IsBackground = true };
        reader.Start();
        Send(new JsonObject { ["event"] = "ready", ["body"] = new JsonObject { ["version"] = 1 } });

        while (true)
        {
            // Handle what has come in; wait for more only while the machine is still.
            while (requests.TryTake(out var request, running ? 0 : 50))
            {
                if (request is null) { machine?.Dispose(); return 0; }
                Handle(request);
            }
            if (running && machine is not null) Slice(machine);
        }
    }

    // ---- Running ----

    /// <summary>Runs one slice of real time (or as fast as it goes), then sends the screen.</summary>
    static void Slice(Machine m)
    {
        int budget;
        if (speed <= 0) budget = Machine.CpuHz / 30;
        else
        {
            double due = clock.Elapsed.TotalSeconds * Machine.CpuHz * speed - clockCycles;
            // Far behind (a pause in the debugger, a slow PC): give up on catching up.
            if (due > Machine.CpuHz / 5.0) { clockCycles = (ulong)(clock.Elapsed.TotalSeconds * Machine.CpuHz * speed) - (ulong)(Machine.CpuHz / 60); due = Machine.CpuHz / 60.0; }
            if (due < 2000) { Thread.Sleep(2); return; }
            budget = (int)Math.Min(due, Machine.CpuHz / 20.0);
        }
        var (reason, ran) = m.Run(budget, resume, depth);
        // Still inside the call stepped over: an interrupt taken with it has returned, or its return address was only taken off and put back.
        while (reason == StopReason.Depth && Inside(m) && ran < budget)
        {
            // Breakpoints count here too: the next instruction has not been looked at yet.
            var (why2, more) = m.Run(budget - ran, false, depth);
            reason = why2; ran += more;
        }
        if (reason == StopReason.Depth && Inside(m)) reason = StopReason.None;
        resume = false;
        clockCycles += (ulong)ran;
        if (reason != StopReason.None)
        {
            string why = reason switch
            {
                StopReason.Fault => "exception",
                StopReason.Depth => StepReason(m),
                StopReason.Read => "read",
                _ => (int)m.Register("P") == returnAddress ? "return" : "breakpoint"
            };
            Stop(m, why);
            return;
        }
        SendFrame(m, false);
    }

    // A step that came to where a "call" returns is its return (the CPU goes back to where it was).
    static string StepReason(Machine m) => returnAddress is int r && (int)m.Register("P") == r ? "return" : "step";

    /// <summary>
    /// Whether the call being stepped over has not returned yet: S is below what it was before
    /// the call, or its return address was only taken off (to skip data after the CALL). What
    /// RET and RETF take off is still under S, and is where P is.
    /// </summary>
    static bool Inside(Machine m)
    {
        if (stepS is not uint before) return false;
        uint s = m.Register("S"), p = m.Register("P");
        if (s < before) return true;
        if (p == stepNext) return false;
        var b = m.Read((int)(s - 3) & 0xfffff, 3);
        return (b[1] | b[2] << 8) != (p & 0xffff) && (b[0] | b[1] << 8 | (b[2] & 15) << 16) != p;
    }

    /// <summary>Stops a machine that runs, and says so: no request leaves it standing in silence.</summary>
    static void Halt(Machine m) { if (running) Stop(m, "pause"); }

    static void Start(Machine m, int stopDepth = -1)
    {
        // From where a "call" has put the CPU, a breakpoint on the first instruction counts.
        running = true; resume = !called; called = false; depth = stopDepth; stepS = null;
        clock.Restart(); clockCycles = 0;
        Send(new JsonObject { ["event"] = "continued" });
    }

    static void Stop(Machine m, string reason)
    {
        running = false; depth = -1; stepS = null; called = false;
        var body = new JsonObject { ["reason"] = reason, ["pc"] = (int)m.Register("P") };
        if (reason == "return") body["registers"] = Returned(m);
        if (reason == "read") body["address"] = Native.e500_debug_read_hit(m.Handle);
        SendFrame(m, true);
        Send(new JsonObject { ["event"] = "stopped", ["body"] = body });
    }

    // The routine of a "call" came back: its registers as it left them are the
    // result, and the CPU goes back to where it was before the call.
    static JsonObject Returned(Machine m)
    {
        var result = Registers(m);
        returnAddress = null;
        ApplyBreakpoints(m);
        if (beforeCall is { } saved)
        {
            foreach (var (name, value) in saved.Registers) m.SetRegister(name, value);
            Native.e500_debug_halt(m.Handle, saved.Halt ? 1 : 0);
            beforeCall = null;
        }
        return result;
    }

    static void ForgetCall(Machine m)
    {
        returnAddress = null; beforeCall = null;
        ApplyBreakpoints(m);
    }

    static void ApplyBreakpoints(Machine m)
    {
        var list = returnAddress is int r ? [.. breakpoints, (uint)r] : breakpoints;
        Native.e500_debug_breakpoints(m.Handle, list.Length == 0 ? null : list, list.Length);
    }

    static void SendFrame(Machine m, bool force)
    {
        if (!framesOn) return;
        if (!force && frameClock.ElapsedMilliseconds < 16) return;
        var pixels = m.Pixels();
        var symbols = m.Symbols();
        if (!force && pixels.AsSpan().SequenceEqual(lastPixels) && symbols.AsSpan().SequenceEqual(lastSymbols)) return;
        lastPixels = pixels; lastSymbols = symbols; frameClock.Restart();
        Send(new JsonObject { ["event"] = "frame", ["body"] = Screen(m, pixels, false) });
    }

    static JsonObject Screen(Machine m, byte[] pixels, bool text)
    {
        // 240 x 32 dots, eight to a byte, row by row (bit 7 is the leftmost dot).
        var packed = new byte[pixels.Length / 8];
        for (int i = 0; i < pixels.Length; i++) if (pixels[i] != 0) packed[i >> 3] |= (byte)(0x80 >> (i & 7));
        var body = new JsonObject
        {
            ["pixels"] = Convert.ToBase64String(packed),
            ["symbols"] = new JsonArray([.. m.Symbols().Select(x => (JsonNode)x)])
        };
        if (text) body["text"] = m.ScreenText(pixels);
        return body;
    }

    // Runs unpaced (as fast as it goes) for at most `cycles`, until the keys are all typed
    // and `settle` cycles after that have gone by; a breakpoint, a return or a fault stops it.
    static (string Reason, ulong Ran) RunFast(Machine m, long cycles, int settle, bool untilTyped)
    {
        ulong start = m.Cycles;
        bool first = true;
        long settleLeft = settle;
        while ((long)(m.Cycles - start) < cycles)
        {
            int slice = (int)Math.Min(Machine.CpuHz / 10, cycles - (long)(m.Cycles - start));
            bool typing = m.Typing;
            if (untilTyped && !typing) slice = (int)Math.Min(slice, settleLeft);
            if (slice <= 0) return ("idle", m.Cycles - start);
            var (reason, ran) = m.Run(slice, first, -1);
            first = false;
            if (untilTyped && !typing) settleLeft -= ran;
            if (reason == StopReason.Fault) return ("exception", m.Cycles - start);
            if (reason == StopReason.Breakpoint) return ((int)m.Register("P") == returnAddress ? "return" : "breakpoint", m.Cycles - start);
            if (reason == StopReason.Read) return ("read", m.Cycles - start);
        }
        return ("timeout", m.Cycles - start);
    }

    // ---- Requests ----

    static void Handle(JsonObject request)
    {
        var id = request["id"]?.DeepClone();
        string cmd = request["cmd"]?.GetValue<string>() ?? "";
        var args = request["args"] as JsonObject ?? [];
        try
        {
            var body = Execute(cmd, args);
            Send(new JsonObject { ["id"] = id, ["ok"] = true, ["body"] = body });
        }
        catch (Exception e)
        {
            Send(new JsonObject { ["id"] = id, ["ok"] = false, ["error"] = e.Message });
        }
    }

    static Machine M => machine ?? throw new InvalidOperationException(Lang.L("ROM が読み込まれていません（open が先です）。", "No ROM is loaded (open comes first)."));

    static int Int(JsonObject args, string name, int? fallback = null)
    {
        var node = args[name];
        if (node is null) return fallback ?? throw new ArgumentException(Lang.L($"{name} がありません。", $"{name} is missing."));
        if (node.GetValueKind() == JsonValueKind.String)
        {
            string s = node.GetValue<string>().Trim();
            if (s.StartsWith("&H", StringComparison.OrdinalIgnoreCase)) return Convert.ToInt32(s[2..], 16);
            if (s.StartsWith("0x", StringComparison.OrdinalIgnoreCase)) return Convert.ToInt32(s[2..], 16);
            if (s.StartsWith('$')) return Convert.ToInt32(s[1..], 16);
            return int.Parse(s);
        }
        return (int)node.GetValue<double>();
    }

    static string Str(JsonObject args, string name, string? fallback = null) =>
        args[name]?.GetValue<string>() ?? fallback ?? throw new ArgumentException(Lang.L($"{name} がありません。", $"{name} is missing."));

    static bool Bool(JsonObject args, string name, bool fallback) => args[name]?.GetValue<bool>() ?? fallback;

    static JsonNode? Execute(string cmd, JsonObject args)
    {
        switch (cmd)
        {
            case "open":
            {
                if (machine is not null) Halt(machine);
                returnAddress = null; beforeCall = null; breakpoints = [];
                machine?.Dispose(); machine = null;
                var m = new Machine(Str(args, "rom"), Int(args, "ram", 32), Int(args, "card", 0));
                machine = m;
                lastPixels = []; lastSymbols = [];
                return Info(m);
            }
            case "info": return Info(M);
            case "reset":
            {
                // A machine that runs goes on running, from the start.
                ForgetCall(M); depth = -1; stepS = null; called = false;
                M.ReleaseKeys();
                Native.e500_reset(M.Handle, Bool(args, "clear", false) ? 1 : 0);
                Native.e500_debug_clear_frames(M.Handle);
                clock.Restart(); clockCycles = 0;
                SendFrame(M, true);
                return null;
            }
            case "boot": return Boot(M, args);
            case "frames.on": framesOn = Bool(args, "on", true); return null;
            case "continue":
            {
                if (args["speed"] is not null) speed = args["speed"]!.GetValue<double>();
                if (!running) Start(M);
                return null;
            }
            case "speed": speed = args["speed"]!.GetValue<double>(); clock.Restart(); clockCycles = 0; return null;
            case "pause":
                if (running) Stop(M, "pause");
                return null;
            case "step":
            {
                running = false; called = false;
                var reason = M.Step();
                Stop(M, reason == StopReason.Fault ? "exception" : StepReason(M));
                return null;
            }
            case "stepOver":
            {
                running = false; called = false;
                int before = M.Frames().Count;
                uint at = M.Register("P");
                byte op = M.Read((int)at, 1)[0];
                bool call = op is 0x04 or 0x05;
                uint next = (at & 0xf0000) | ((at + (op == 4 ? 3u : 4u)) & 0xffff);
                uint s = M.Register("S");
                var reason = M.Step();
                if (reason == StopReason.Fault) { Stop(M, "exception"); return null; }
                // A call (or an interrupt taken on the way) added a frame: run until it returns.
                if (M.Frames().Count > before) { Start(M, before + 1); resume = false; if (call) { stepS = s; stepNext = next; } return null; }
                Stop(M, StepReason(M));
                return null;
            }
            case "stepOut":
            {
                int n = M.Frames().Count;
                if (n == 0) { var reason = M.Step(); Stop(M, reason == StopReason.Fault ? "exception" : StepReason(M)); return null; }
                Start(M, n);
                return null;
            }
            case "breakpoints":
            {
                breakpoints = (args["addresses"] as JsonArray ?? []).Select(x => (uint)(x!.GetValue<double>()) & 0xfffff).Distinct().ToArray();
                ApplyBreakpoints(M);
                return null;
            }
            case "watchReads":
            {
                // Stop as soon as an instruction reads one of these bytes (a BASIC line being run).
                var list = (args["addresses"] as JsonArray ?? []).Select(x => (uint)(x!.GetValue<double>()) & 0xfffff).Distinct().ToArray();
                Native.e500_debug_watch_reads(M.Handle, list.Length == 0 ? null : list, list.Length, Int(args, "after", -1));
                return null;
            }
            case "disk.mount":
            {
                // The CE-140F on the 11-pin port, with this folder as its disk (null: unplugged).
                string? folder = args["folder"]?.GetValue<string>();
                if (Native.e500_disk_mount(M.Handle, folder, Bool(args, "readOnly", false) ? 1 : 0) == 0 && folder is not null)
                    throw new InvalidOperationException(Lang.L($"CE-140F にフォルダをつなげません: {folder}", $"Cannot connect the folder to the CE-140F: {folder}"));
                return new JsonObject { ["status"] = Native.e500_disk_status(M.Handle) };
            }
            case "disk.status": return new JsonObject { ["status"] = Native.e500_disk_status(M.Handle) };
            case "registers": return Registers(M);
            case "setRegister":
                M.SetRegister(Str(args, "name"), (uint)Int(args, "value"));
                return Registers(M);
            case "read":
                return new JsonObject { ["data"] = Convert.ToBase64String(M.Read(Int(args, "address"), Int(args, "length"))) };
            case "write":
            {
                var data = Convert.FromBase64String(Str(args, "data"));
                if (!M.Write(Int(args, "address"), data)) throw new InvalidOperationException(Lang.L($"{Int(args, "address"):X5}h から {data.Length} バイトは RAM ではないため書き込めません。", $"{data.Length} bytes from {Int(args, "address"):X5}h are not all RAM and cannot be written."));
                SendFrame(M, true);
                return null;
            }
            case "imem.write":
            {
                var data = Convert.FromBase64String(Str(args, "data"));
                if (!M.WriteInternalMemory(Int(args, "address"), data))
                    throw new InvalidOperationException(Lang.L("内部 RAM は 00h〜EEh だけ書き換えられます（EFh の AMC と F0h からの I/O は書くと動作が変わるため）。",
                        "Only internal RAM 00h-EEh can be changed (the AMC at EFh and the I/O from F0h act when written)."));
                return null;
            }
            case "imem": return new JsonObject { ["data"] = Convert.ToBase64String(M.InternalMemory()) };
            case "callstack":
                return new JsonArray([.. M.Frames().Select(f => (JsonNode)new JsonObject { ["site"] = f.Site, ["target"] = f.Target, ["sp"] = f.Sp, ["interrupt"] = f.Interrupt })]);
            case "key":
                M.Key(Str(args, "name"), Bool(args, "down", true));
                return null;
            case "tap": M.Tap(Str(args, "name")); return null;
            case "type": return new JsonObject { ["skipped"] = M.Type(Str(args, "text")) };
            case "releaseKeys": M.ReleaseKeys(); return null;
            case "screen": return Screen(M, M.Pixels(), true);
            case "disassemble": return Disassemble(M, Int(args, "address"), Int(args, "count", 16), Int(args, "before", 0));
            case "state.save": return new JsonObject { ["data"] = Convert.ToBase64String(M.SaveState()) };
            case "state.load":
                Halt(M); ForgetCall(M);
                M.LoadState(Convert.FromBase64String(Str(args, "data")));
                SendFrame(M, true);
                return null;
            case "state.loadFile": Halt(M); ForgetCall(M); LoadStateFile(M, Str(args, "path")); SendFrame(M, true); return Info(M);
            case "area":
                return M.MachineCodeArea() is { } area ? new JsonObject { ["start"] = area.Start, ["size"] = area.Size } : null;
            case "reserve": return Reserve(M, Int(args, "size"));
            case "call":
            {
                // As BASIC's CALL does (CALLF), or a near CALL from the routine's own page.
                Halt(M);
                int entry = Int(args, "entry") & 0xfffff;
                bool far = Bool(args, "far", true);
                int back = far ? 0xffff2 : (entry & 0xf0000) | 0xfff2;
                var saved = Machine.RegisterIds.Keys.ToDictionary(name => name, name => M.Register(name));
                bool halted = (Native.e500_status(M.Handle) & 2) != 0;
                if (Native.e500_debug_call(M.Handle, entry, back, far ? 1 : 0) == 0) throw new InvalidOperationException(Lang.L("呼び出せません（電源 OFF か停止中）。", "Cannot call (the power is off or the CPU has stopped)."));
                beforeCall ??= (saved, halted);
                // Registers given for the call (A, X, ...) are set after the jump.
                if (args["registers"] is JsonObject given)
                    foreach (var (name, value) in given) if (name is not ("P" or "S")) M.SetRegister(name, (uint)Int(given, name));
                returnAddress = back; called = true;
                ApplyBreakpoints(M);
                return new JsonObject { ["returnAddress"] = back };
            }
            case "run":
            {
                // Unpaced: until keys are typed (+settle), a breakpoint, a return, or the cycles run out.
                Halt(M);
                called = false;
                var (reason, ran) = RunFast(M, (long)(args["cycles"]?.GetValue<double>() ?? Machine.CpuHz * 10.0), Int(args, "settle", 0), Bool(args, "untilTyped", false));
                var result = new JsonObject { ["reason"] = reason, ["cycles"] = ran, ["pc"] = (int)M.Register("P") };
                if (reason == "return") result["registers"] = Returned(M);
                if (reason == "read") result["address"] = Native.e500_debug_read_hit(M.Handle);
                SendFrame(M, true);
                return result;
            }
            case "mode":
            {
                var (busy, run, pro) = M.Mode();
                return new JsonObject { ["busy"] = busy, ["run"] = run, ["pro"] = pro };
            }
            case "status": return new JsonObject { ["running"] = running, ["cycles"] = M.Cycles };
            default: throw new ArgumentException(Lang.L($"不明なコマンド: {cmd}", $"Unknown command: {cmd}"));
        }
    }

    static JsonObject Info(Machine m) => new()
    {
        ["romVersion"] = m.RomVersion, ["romKB"] = m.RomKB, ["internalKB"] = m.InternalKB, ["cardKB"] = m.CardKB, ["cpuHz"] = Machine.CpuHz
    };

    static JsonObject Registers(Machine m)
    {
        var o = new JsonObject();
        foreach (var name in new[] { "A", "IL", "BA", "I", "X", "Y", "U", "S", "P", "F" }) o[name] = m.Register(name);
        int status = Native.e500_status(m.Handle);
        o["off"] = (status & 1) != 0; o["halt"] = (status & 2) != 0; o["fault"] = (status & 4) != 0;
        o["cycles"] = m.Cycles;
        return o;
    }

    // From a cold start (RAM cleared) to BASIC's RUN mode prompt, as a person would:
    // the ROM starts in its menu (or asks to set up RAM), F1 picks BASIC.
    static JsonObject Boot(Machine m, JsonObject args)
    {
        Halt(m); ForgetCall(m);
        m.ReleaseKeys();
        Native.e500_reset(m.Handle, 1);
        Native.e500_debug_clear_frames(m.Handle);
        RunFast(m, Machine.CpuHz * 2, 0, false);
        var log = new StringBuilder();
        // A key pressed while the ROM is still busy after showing a screen is lost (with 256KB
        // of RAM the main menu stays deaf for a while), so each key gets time to take effect.
        for (int attempt = 0; attempt < 10; attempt++)
        {
            var (_, run, pro) = m.Mode();
            string text = m.ScreenText();
            log.AppendLine($"[{attempt}] {text.Replace("\n", " / ")}");
            if (run && !m.Mode().Busy) break;
            if (pro) { m.Tap("BASIC"); }
            // The RAM set-up question on a fresh machine: answer it as the manual says.
            else if (text.Contains("Y/N", StringComparison.OrdinalIgnoreCase) || text.Contains("(Y)", StringComparison.OrdinalIgnoreCase)) m.Type("Y");
            else if (attempt == 0) m.Tap("F1");
            else m.Tap("BASIC");
            RunFast(m, Machine.CpuHz * 6, Machine.CpuHz * 2, true);
        }
        SendFrame(m, true);
        var mode = m.Mode();
        var result = new JsonObject { ["run"] = mode.Run, ["pro"] = mode.Pro, ["screen"] = m.ScreenText(), ["log"] = log.ToString() };
        if (!mode.Run) throw new InvalidOperationException(Lang.L("BASIC の RUN モードになりませんでした。画面: ", "BASIC's RUN mode was not reached. Screen: ") + m.ScreenText().Replace("\n", " / "));
        return result;
    }

    // Sizes the machine-code area with the ROM's routine (typed at the BASIC prompt), then back to BASIC.
    static JsonObject Reserve(Machine m, int size)
    {
        Halt(m);
        var (busy, run, pro) = m.Mode();
        if (busy) throw new InvalidOperationException(Lang.L("BASIC のプログラムの実行中です。", "A BASIC program is running."));
        if (!run && !pro) throw new InvalidOperationException(Lang.L("機械語エリアの確保は BASIC の RUN か PRO モードで行います。", "The machine-code area is reserved in BASIC's RUN or PRO mode."));
        m.Tap("C-CE");
        m.Type(Machine.MachineCodeCommand(size) + "\n");
        RunFast(m, Machine.CpuHz * 20, Machine.CpuHz, true);
        m.Tap("BASIC");
        RunFast(m, Machine.CpuHz * 5, Machine.CpuHz / 2, true);
        if (m.MachineCodeArea() is not { } area || area.Size < size) throw new InvalidOperationException(Lang.L($"機械語エリアを {size:X}h バイト確保できませんでした。画面: ", $"Could not reserve {size:X}h bytes for machine code. Screen: ") + m.ScreenText().Replace("\n", " / "));
        SendFrame(m, true);
        return new JsonObject { ["start"] = area.Start, ["size"] = area.Size, ["screen"] = m.ScreenText() };
    }

    // The PC-E500 emulator's state file (*.e500state): JSON with the core's snapshot in Data.
    static void LoadStateFile(Machine m, string path)
    {
        var json = JsonNode.Parse(File.ReadAllText(path)) as JsonObject ?? throw new InvalidDataException(Lang.L("状態ファイルの形式が違います。", "Not a state file."));
        var data = Convert.FromBase64String(json["Data"]?.GetValue<string>() ?? throw new InvalidDataException(Lang.L("状態ファイルに Data がありません。", "The state file has no Data.")));
        m.LoadState(data);
    }

    // Instructions from `address`, with `before` of them ahead of it. Going back means
    // guessing where an instruction starts: decode from further back and keep the
    // run that lands exactly on `address`.
    static JsonArray Disassemble(Machine m, int address, int count, int before)
    {
        address &= 0xfffff;
        count = Math.Clamp(count, 1, 2000);
        var result = new List<DecodedLine>();
        if (before > 0)
        {
            // Of the starts that decode into a run ending exactly at `address`, the one giving the most lines.
            List<DecodedLine> best = [];
            for (int back = Math.Min(address, before * 6); back > 0; back--)
            {
                var aligned = Decode(m, address - back, back + 8).TakeWhile(l => l.Address < address).ToList();
                int end = aligned.Count == 0 ? -1 : aligned[^1].Address + aligned[^1].Bytes.Length;
                if (end == address && aligned.Count > best.Count) best = aligned;
                if (best.Count >= before) break;
            }
            result.AddRange(best.TakeLast(before));
        }
        int length = Math.Min(count * 6 + 8, 0x100000 - address);
        result.AddRange(Decode(m, address, length).Take(count));
        return new JsonArray([.. result.Select(l => (JsonNode)new JsonObject
        {
            ["address"] = l.Address,
            ["bytes"] = Convert.ToHexString(l.Bytes),
            ["text"] = (l.Mnemonic + " " + string.Join(",", l.Operands)).Trim(),
            ["target"] = l.BranchTarget
        })]);
    }

    static List<DecodedLine> Decode(Machine m, int address, int length)
    {
        if (length <= 0) return [];
        var bytes = m.Read(address, length);
        var image = InputImage.Read(bytes, InputFormat.Raw, address);
        var lines = new Disassembler().Disassemble(image, new DisassemblerOptions { GenerateLabels = false }).Lines;
        // The last line may be cut off by the end of what was read.
        return lines.Count > 1 ? lines.Take(lines.Count - 1).ToList() : [.. lines];
    }

    static void Send(JsonObject message)
    {
        var bytes = Encoding.UTF8.GetBytes(message.ToJsonString() + "\n");
        lock (writeLock) { stdout.Write(bytes); stdout.Flush(); }
    }
}
