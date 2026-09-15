@echo off
rem ce140conv build helper (Windows)
rem Tries MSVC (cl) first, then MinGW (g++), then clang++.
setlocal

where cl >nul 2>nul
if %errorlevel%==0 (
    echo [build] using MSVC cl
    cl /nologo /EHsc /std:c++17 /O2 ce140conv.cpp /Fe:ce140conv.exe
    goto :done
)

where g++ >nul 2>nul
if %errorlevel%==0 (
    echo [build] using g++
    g++ -std=c++17 -O2 -o ce140conv.exe ce140conv.cpp
    goto :done
)

where clang++ >nul 2>nul
if %errorlevel%==0 (
    echo [build] using clang++
    clang++ -std=c++17 -O2 -o ce140conv.exe ce140conv.cpp
    goto :done
)

echo [build] ERROR: no C++ compiler found (cl / g++ / clang++).
echo         Install one of:
echo           - Visual Studio Build Tools (provides cl), or
echo           - MSYS2 / MinGW-w64 (provides g++), or
echo           - LLVM (provides clang++)
echo         then re-run build.bat from a shell where the compiler is on PATH.
exit /b 1

:done
if exist ce140conv.exe (
    echo [build] OK -^> ce140conv.exe
) else (
    echo [build] FAILED
    exit /b 1
)
endlocal
