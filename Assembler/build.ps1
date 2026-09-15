param([switch]$TestOnly)
$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
    dotnet run --project tests/E500Assembler.Tests -c Release
    if ($LASTEXITCODE -ne 0) { throw 'Tests failed' }
    if (-not $TestOnly) {
        dotnet publish src/E500Assembler.Cli -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:DebugType=None -o app
        if ($LASTEXITCODE -ne 0) { throw 'Publish failed' }
    }
} finally { Pop-Location }
