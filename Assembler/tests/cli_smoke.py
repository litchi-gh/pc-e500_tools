"""Windows EXE integration checks. Optional existing emulator DLL, no device ROM needed."""
from pathlib import Path
import ctypes
import subprocess

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "tests" / "output"
OUT.mkdir(parents=True, exist_ok=True)
EXE = ROOT / "app" / "e500asm.exe"
checks = 0


def run(*args, ok=True):
    global checks
    result = subprocess.run([str(EXE), *map(str, args)], capture_output=True, encoding="utf-8")
    assert result.returncode == (0 if ok else 1), (args, result.stdout, result.stderr)
    checks += 1
    return result


run("--help")
run("--version")
run("--bad-option", ok=False)
run("-o", ok=False)
source = OUT / "日本語 ソース.asm"
source.write_text('ORG &B8000\nvalue: DB 1,2,3\n', encoding="utf-8")
binary, listing, symbols = [OUT / ("result." + ext) for ext in ("bin", "lst", "sym")]
run(source, "-o", binary, "-l", listing, "-s", symbols)
assert binary.read_bytes() == b"\x01\x02\x03"
assert "B8000" in listing.read_text(encoding="utf-8")
assert "value EQU $B8000" in symbols.read_text(encoding="utf-8")
run(source, "-o", OUT / "result.hex", "-f", "hex")
assert ":02000004000BEF" in (OUT / "result.hex").read_text()
run(source, "-o", source, ok=False)
run(source, "-o", binary, "-l", binary, ok=False)
run(source, "--fill", "256", ok=False)
run(source, "--format", "elf", ok=False)
before = binary.read_bytes()
source.write_text("MV A,256\n", encoding="utf-8")
error = run(source, "-o", binary, ok=False)
assert "(1): error:" in error.stderr and binary.read_bytes() == before
source.write_bytes("; 日本語コメント\nDB 42\n".encode("shift_jis"))
run(source, "--encoding", "shift_jis", "-o", binary)
assert binary.read_bytes() == b"*"
run(source, "-o", binary, ok=False)
include = OUT / "empty.inc"
include.write_text("", encoding="utf-8")
source.write_text('INCLUDE "empty.inc"\nDB 1\n', encoding="utf-8")
run(source, "-o", include, ok=False)
source.write_text('INCBIN "result.bin"\n', encoding="utf-8")
run(source, "-o", binary, ok=False)
source.write_text("DB TEST\n", encoding="utf-8")
run(source, "-D", "TEST=42", "-o", binary)
assert binary.read_bytes() == b"*"
run(ROOT / "examples" / "sum.asm", "-o", OUT / "sum.bin")
assert (OUT / "sum.bin").read_bytes().hex() == "0800090a46017c011b0606"

# This harness only uses read-only exports of a separate in-memory machine.
# The live emulator, its ROMs, state files and configuration are never touched.
dll_path = ROOT.parent / "Emulator" / "app" / "e500core.dll"
if dll_path.exists():
    program = OUT / "cpu-smoke.asm"
    program.write_text("""
ORG $C0000
MV S,$BFFF0
CALL sum
MV ($10),A
MV ($EC),$20
MV ($ED),2
MV ($EE),3
MV (BP+4),$A5
MV (PX+5),$5A
MV (BP+PX),(BP+4)
MV (PX+1),(PY+4)
MV X,$B8100
MV [X],A
MVP ($30),$B8200
MV [($30)],A
MV ($12),[($30)]
MV I,3
MVL ($40),[X]
HALT
sum:
MV A,0
MV IL,10
loop:
ADD A,IL
DEC IL
JRNZ loop
RET
""", encoding="utf-8")
    run(program, "-o", OUT / "cpu-smoke.bin")
    code = (OUT / "cpu-smoke.bin").read_bytes()
    rom = bytearray(256 * 1024)
    rom[:len(code)] = code
    rom[-3:] = (0xC0000).to_bytes(3, "little")
    dll = ctypes.CDLL(str(dll_path))
    ptr = ctypes.c_void_p
    buf_type = ctypes.POINTER(ctypes.c_ubyte)
    dll.e500_create.argtypes = [buf_type, ctypes.c_int]
    dll.e500_create.restype = ptr
    dll.e500_run.argtypes = [ptr, ctypes.c_int]
    dll.e500_run.restype = ctypes.c_int
    dll.e500_reg.argtypes = [ptr, ctypes.c_int]
    dll.e500_reg.restype = ctypes.c_uint32
    dll.e500_status.argtypes = [ptr]
    dll.e500_status.restype = ctypes.c_int
    dll.e500_peek.argtypes = [ptr, ctypes.c_int]
    dll.e500_peek.restype = ctypes.c_int
    dll.e500_imem.argtypes = [ptr, buf_type]
    dll.e500_imem.restype = ctypes.c_int
    dll.e500_destroy.argtypes = [ptr]
    rom_buffer = (ctypes.c_ubyte * len(rom)).from_buffer_copy(rom)
    machine = dll.e500_create(rom_buffer, len(rom))
    assert machine
    try:
        assert dll.e500_run(machine, 1000) == 0
        assert dll.e500_status(machine) & 2, "CPU should halt"
        assert dll.e500_reg(machine, 0) == 55, "10+9+...+1 must be 55"
        internal = (ctypes.c_ubyte * 256)()
        assert dll.e500_imem(machine, internal) == 1
        for address, expected in [(0x10,55),(0x12,55),(0x24,0xA5),(7,0x5A),(0x22,0xA5),(3,0x5A),(0x40,55)]:
            assert internal[address] == expected, (address, expected, internal[address])
        assert dll.e500_peek(machine, 0xB8100) == 55
        assert dll.e500_peek(machine, 0xB8200) == 55
        checks += 12
        print("PASS: emulator execution (sum=55, call/return, PRE modes, indirect RAM, block transfer)")
    finally:
        dll.e500_destroy(machine)
else:
    print("SKIP: optional emulator execution; e500core.dll not found")
print(f"PASS: {checks} CLI / emulator checks")
