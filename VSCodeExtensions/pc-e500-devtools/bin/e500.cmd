@echo off
rem The extension from a command line. Runs on Node.js, or on the one inside VS Code.
rem The arguments stay out of ( ) blocks: a parenthesis in one would end the block.
setlocal
where node >nul 2>nul
if errorlevel 1 goto vscode
node "%~dp0..\out\cli\main.js" %*
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
