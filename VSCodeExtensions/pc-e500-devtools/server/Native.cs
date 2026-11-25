using System.Reflection;
using System.Runtime.InteropServices;

namespace E500DebugServer;

/// <summary>
/// The PC-E500 emulator core (e500core.dll of the PC-E500 emulator, GPL-2.0-or-later).
/// It is not part of this program: it is loaded at run time from the emulator's folder.
/// エミュレータのコア e500core.dll（別配布、GPL）を実行時に読み込んで呼ぶ。
/// </summary>
internal static class Native
{
    const string Dll = "e500core";
    static IntPtr library;

    /// <summary>Loads the core from <paramref name="path"/> and checks it has the debugger API.</summary>
    internal static void Load(string path)
    {
        if (!File.Exists(path)) throw new FileNotFoundException(Lang.L($"e500core.dll が見つかりません: {path}", $"e500core.dll was not found: {path}"));
        library = NativeLibrary.Load(path);
        NativeLibrary.SetDllImportResolver(Assembly.GetExecutingAssembly(), (name, _, _) => name == Dll ? library : IntPtr.Zero);
        foreach (var export in new[] { "e500_debug_run", "e500_debug_step", "e500_debug_frames", "e500_debug_call", "e500_debug_halt", "e500_debug_watch_reads", "e500_set_reg" })
            if (!NativeLibrary.TryGetExport(library, export, out _))
                throw new InvalidOperationException(Lang.L($"この e500core.dll にはデバッグ用の関数 {export} がありません。新しいエミュレータの e500core.dll を指定してください: {path}", $"This e500core.dll lacks the debugger function {export}. Give the e500core.dll of a newer emulator: {path}"));
    }

    [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)] internal static extern IntPtr e500_create_config(byte[] rom, int size, int ram, int card);
    [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)] internal static extern void e500_destroy(IntPtr m);
    [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)] internal static extern void e500_reset(IntPtr m, int clearInternal);
    [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)] internal static extern int e500_capacity(IntPtr m, int card);
    [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)] internal static extern int e500_memory(IntPtr m, int card, byte[] data, int size, int write);
    [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)] internal static extern void e500_key(IntPtr m, int row, int bit, int down);
    [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)] internal static extern void e500_release_keys(IntPtr m);
    [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)] internal static extern void e500_pixels(IntPtr m, [Out] byte[] pixels);
    [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)] internal static extern uint e500_reg(IntPtr m, int id);
    [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)] internal static extern void e500_set_reg(IntPtr m, int id, uint value);
    [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)] internal static extern int e500_status(IntPtr m);
    [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)] internal static extern int e500_symbols(IntPtr m, int index);
    [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)] internal static extern int e500_dump(IntPtr m, int address, [Out] byte[] data, int length);
    [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)] internal static extern int e500_write(IntPtr m, int address, byte[] data, int length);
    [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)] internal static extern int e500_imem(IntPtr m, [Out] byte[] data);
    [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)] internal static extern ulong e500_cycles(IntPtr m);
    [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)] internal static extern int e500_state_size();
    [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)] internal static extern int e500_save(IntPtr m, [Out] byte[] data, int size);
    [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)] internal static extern int e500_load(IntPtr m, byte[] data, int size);
    [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)] internal static extern int e500_audio(IntPtr m, [Out] short[] data, int count);
    [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)] internal static extern void e500_debug_breakpoints(IntPtr m, uint[]? list, int count);
    [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)] internal static extern int e500_debug_run(IntPtr m, int cycles, int flags, int depth);
    [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)] internal static extern int e500_debug_step(IntPtr m);
    [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)] internal static extern int e500_debug_frames(IntPtr m, [Out] uint[]? output, int max);
    [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)] internal static extern int e500_debug_call(IntPtr m, int entry, int returnAddress, int far);
    [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)] internal static extern void e500_debug_clear_frames(IntPtr m);
    [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)] internal static extern void e500_debug_halt(IntPtr m, int on);
    [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)] internal static extern void e500_debug_watch_reads(IntPtr m, uint[]? list, int count, int after);
    [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)] internal static extern int e500_debug_read_hit(IntPtr m);
    [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)] internal static extern int e500_debug_write_imem(IntPtr m, int at, byte[] data, int length);
    [DllImport(Dll, CallingConvention = CallingConvention.Cdecl, CharSet = CharSet.Auto)] internal static extern int e500_disk_mount(IntPtr m, string? folder, int readOnly);
    [DllImport(Dll, CallingConvention = CallingConvention.Cdecl)] internal static extern int e500_disk_status(IntPtr m);
}
