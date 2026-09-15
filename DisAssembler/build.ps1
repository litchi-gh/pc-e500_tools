param([switch]$TestOnly)
$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
    dotnet run --project tests/E500Disassembler.Tests -c Release
    if ($LASTEXITCODE -ne 0) { throw 'Disassembler tests failed' }
    dotnet run --project ../Assembler/tests/E500Assembler.Tests -c Release
    if ($LASTEXITCODE -ne 0) { throw 'Assembler tests failed' }
    if (-not $TestOnly) {
        New-Item -ItemType Directory -Force app | Out-Null
        dotnet publish src/E500Disassembler.Cli -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:DebugType=None -o app
        if ($LASTEXITCODE -ne 0) { throw 'CLI publish failed' }
        dotnet publish src/E500Disassembler.Gui -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:DebugType=None -o app
        if ($LASTEXITCODE -ne 0) { throw 'GUI publish failed' }
    }
} finally { Pop-Location }
