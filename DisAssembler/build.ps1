# -Runtime linux-x64 and so on build the CLI for another system into app/<runtime>/. The GUI is Windows only.
param([switch]$TestOnly, [string]$Runtime = 'win-x64')
$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
    dotnet run --project tests/E500Disassembler.Tests -c Release
    if ($LASTEXITCODE -ne 0) { throw 'Disassembler tests failed' }
    dotnet run --project ../Assembler/tests/E500Assembler.Tests -c Release
    if ($LASTEXITCODE -ne 0) { throw 'Assembler tests failed' }
    if (-not $TestOnly) {
        New-Item -ItemType Directory -Force app | Out-Null
        $out = if ($Runtime -eq 'win-x64') { 'app' } else { "app/$Runtime" }
        dotnet publish src/E500Disassembler.Cli -c Release -r $Runtime --self-contained true -p:PublishSingleFile=true -p:DebugType=None -o $out
        if ($LASTEXITCODE -ne 0) { throw 'CLI publish failed' }
        if ($Runtime -like 'win-*') {
            dotnet publish src/E500Disassembler.Gui -c Release -r $Runtime --self-contained true -p:PublishSingleFile=true -p:DebugType=None -o $out
            if ($LASTEXITCODE -ne 0) { throw 'GUI publish failed' }
        }
    }
} finally { Pop-Location }
