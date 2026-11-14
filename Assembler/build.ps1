# -Runtime linux-x64 and so on build for another system into app/<runtime>/.
param([switch]$TestOnly, [string]$Runtime = 'win-x64')
$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
    dotnet run --project tests/E500Assembler.Tests -c Release
    if ($LASTEXITCODE -ne 0) { throw 'Tests failed' }
    if (-not $TestOnly) {
        dotnet publish src/E500Assembler.Cli -c Release -r $Runtime --self-contained true -p:PublishSingleFile=true -p:DebugType=None -o $(if ($Runtime -eq 'win-x64') { 'app' } else { "app/$Runtime" })
        if ($LASTEXITCODE -ne 0) { throw 'Publish failed' }
    }
} finally { Pop-Location }
