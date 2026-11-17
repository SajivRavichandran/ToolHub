@echo off
rem ---------------------------------------------------------------------------
rem Starts the ToolHub production server (next start) on port 3000.
rem Launched at logon by the "ToolHub Autostart" scheduled task (via the .vbs
rem wrapper, which runs this hidden). Safe to run manually too.
rem ---------------------------------------------------------------------------
setlocal

set "NODE_DIR=C:\Users\Sajiv.Ravichandran\AppData\Local\nodejs-portable\node-v22.14.0-win-x64"
set "PATH=%NODE_DIR%;%PATH%"
set "PROJECT=C:\Claude Codebase"
set "LOG=%LOCALAPPDATA%\toolhub-autostart.log"

cd /d "%PROJECT%"

echo [%DATE% %TIME%] ToolHub autostart invoked>> "%LOG%"

rem --- Don't start a second instance if port 3000 is already serving ---
netstat -ano | findstr /r /c:":3000 .*LISTENING" >nul 2>&1
if %errorlevel%==0 (
  echo [%DATE% %TIME%] Port 3000 already in use - not starting another instance.>> "%LOG%"
  exit /b 0
)

rem --- Always rebuild on logon so the server serves the latest code ---
echo [%DATE% %TIME%] Building latest code: npm run build...>> "%LOG%"
call npm run build >> "%LOG%" 2>&1
if %errorlevel% neq 0 (
  echo [%DATE% %TIME%] BUILD FAILED - not starting. See log above.>> "%LOG%"
  exit /b 1
)

echo [%DATE% %TIME%] Starting server: npm run start>> "%LOG%"
call npm run start >> "%LOG%" 2>&1
