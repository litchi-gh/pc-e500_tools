@echo off
rem The extension from a command line. Runs on Node.js, or on the one inside VS Code.
rem The arguments stay out of ( ) blocks: a parenthesis in one would end the block.
setlocal
rem node.exe of PATH, and not of the folder one happens to be in.
set "E500_NODE="
for %%I in (node.exe) do set "E500_NODE=%%~$PATH:I"
if not defined E500_NODE goto vscode
"%E500_NODE%" "%~dp0..\out\cli\main.js" %*
exit /b %errorlevel%

:vscode
set "E500_CODE=%LOCALAPPDATA%\Programs\Microsoft VS Code\Code.exe"
if not exist "%E500_CODE%" set "E500_CODE=%ProgramFiles%\Microsoft VS Code\Code.exe"
if not exist "%E500_CODE%" (
  echo Node.js or VS Code is needed. 1>&2
  exit /b 2
)
set ELECTRON_RUN_AS_NODE=1
"%E500_CODE%" "%~dp0..\out\cli\main.js" %*
exit /b %errorlevel%
