$ErrorActionPreference = 'Stop'
# The deep test: the program in the workspace's emulator core, dot by dot, and from the ROM.
# NINEBOX.BIN must be up to date ("PC-E500: Make BIN" in VS Code).
$here = $PSScriptRoot
$root = (Resolve-Path (Join-Path $here '..\..\..\..')).Path   # the folder with pc-e500_tools and Emulator
$assembler = Join-Path $root 'pc-e500_tools\Assembler\app\e500asm.exe'
$native = Join-Path $root 'Emulator\src\native'
$rom = Join-Path $root 'Emulator\app\rom\PC-E500(7.2).ROM'
foreach ($needed in $assembler, $native, $rom) {
    if (-not (Test-Path -LiteralPath $needed)) { throw "Not found: $needed" }
}
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
if (-not (Test-Path -LiteralPath $vswhere)) { throw 'Visual Studio C++ tools are required for the emulator-core test.' }
$install = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (-not $install) { throw 'Visual Studio C++ tools are required for the emulator-core test.' }
$vcvars = Join-Path $install 'VC\Auxiliary\Build\vcvars64.bat'

$build = Join-Path ([IO.Path]::GetTempPath()) ('pce500-ninebox-test-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $build | Out-Null
Push-Location $here
try {
    & $assembler (Join-Path $here 'ninebox.asm') -o (Join-Path $build 'NINEBOX.RAW') -l (Join-Path $build 'NINEBOX.LST') -s (Join-Path $build 'NINEBOX.SYM')
    if ($LASTEXITCODE -ne 0) { throw 'Assembly failed.' }
    $sources = (Get-ChildItem -LiteralPath $native -Filter '*.cpp' | ForEach-Object { '"{0}"' -f $_.FullName }) -join ' '
    $script = Join-Path $build 'build.cmd'
    $lines = @(
        '@echo off', 'chcp 65001 >nul', ('call "{0}" >nul || exit /b 1' -f $vcvars), ('cd /d "{0}" || exit /b 1' -f $build),
        ('cl /nologo /utf-8 /std:c++17 /O2 /MT /EHsc /I"{0}" "{1}" {2} /Fe:test_runner.exe /link /INCREMENTAL:NO || exit /b 1' -f $native, (Join-Path $here 'test_runner.cpp'), $sources),
        ('cd /d "{0}" || exit /b 1' -f $here), ('"{0}" "{1}" "{2}"' -f (Join-Path $build 'test_runner.exe'), $build, $rom))
    [IO.File]::WriteAllLines($script, $lines, (New-Object Text.UTF8Encoding $false))
    & cmd.exe /d /c $script
    if ($LASTEXITCODE -ne 0) { throw 'Emulator-core test failed.' }
    & (Join-Path $here 'render_captures.ps1')
} finally {
    Pop-Location
    Remove-Item -LiteralPath $build -Recurse -Force -ErrorAction SilentlyContinue
}
