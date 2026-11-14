#!/bin/sh
# Run the tests and build app/e500dasm on Linux or macOS. Needs the .NET 10 SDK.
# The GUI uses Windows Forms, so it is not built here.
#   ./build.sh               tests, then the program
#   ./build.sh --test-only   tests only
set -e
cd "$(dirname "$0")"
case "$(uname -s)-$(uname -m)" in
    Linux-x86_64)  runtime=linux-x64 ;;
    Linux-aarch64) runtime=linux-arm64 ;;
    Darwin-x86_64) runtime=osx-x64 ;;
    Darwin-arm64)  runtime=osx-arm64 ;;
    *) echo "build.sh: unknown system: $(uname -s) $(uname -m)" >&2; exit 2 ;;
esac
dotnet run --project tests/E500Disassembler.Tests -c Release
dotnet run --project ../Assembler/tests/E500Assembler.Tests -c Release
[ "$1" = "--test-only" ] && exit 0
dotnet publish src/E500Disassembler.Cli -c Release -r "$runtime" --self-contained true -p:PublishSingleFile=true -p:DebugType=None -o app
