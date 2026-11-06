#!/bin/sh
# Build ce140conv on Linux or macOS with the first compiler found.
set -e
cd "$(dirname "$0")"
found=
for compiler in "$CXX" g++ clang++ c++; do
    if [ -n "$compiler" ] && command -v "$compiler" >/dev/null 2>&1; then
        found=$compiler
        break
    fi
done
if [ -z "$found" ]; then
    echo "build.sh: no C++17 compiler found (g++ or clang++)" >&2
    exit 2
fi
# iconv is part of the C library on Linux and a separate library on macOS
libs=
if [ "$(uname -s)" = Darwin ]; then libs=-liconv; fi
"$found" -std=c++17 -O2 -o ce140conv ce140conv.cpp $libs
echo "built ce140conv with $found"
