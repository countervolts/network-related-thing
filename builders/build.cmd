@echo off
setlocal enabledelayedexpansion

cd ..

echo ===================================================
echo building source code...
echo ===================================================

echo Installing dependencies...
python -m pip install -r requirements.txt --quiet
echo [+] Dependencies installed successfully
python -m pip install pyinstaller --quiet
echo [+] PyInstaller installed successfully

echo Cleaning up previous build files...
if exist "build" rmdir /s /q "build"
if exist "dist" rmdir /s /q "dist"
if exist "server.spec" del /f /q "server.spec"
if exist "auto_bypass_service.spec" del /f /q "auto_bypass_service.spec"
echo [+] Previous build files removed

echo Removing all __pycache__ folders...
for /d /r %%d in (__pycache__) do if exist "%%d" rmdir /s /q "%%d"
echo [+] __pycache__ folders removed

echo Starting compilation...
set start_time=%time%

echo [1/2] Compiling auto-bypass service...
pyinstaller src/auto_bypass.py --onefile --name=auto_bypass_service --icon=favicon.ico --clean --noconfirm --noconsole ^
--add-data "src;src" --hidden-import=ctypes > NUL 2>&1

echo [2/2] Compiling main server and embedding service...
pyinstaller server.py --onefile --name=server --icon=favicon.ico --clean --noconfirm ^
--add-data "index.html;." --add-data "favicon.ico;." ^
--add-data "src;src" ^
--add-binary "dist/auto_bypass_service.exe;." > NUL 2>&1

set end_time=%time%
set BUILD_STATUS=!errorlevel!

for /f "tokens=1-4 delims=:." %%a in ("%start_time%") do (
    set /a "start_ms=1%%d-100, start_s=1%%c-100, start_m=1%%b-100"
)
for /f "tokens=1-4 delims=:." %%a in ("%end_time%") do (
    set /a "end_ms=1%%d-100, end_s=1%%c-100, end_m=1%%b-100"
)
set /a elapsed_ms=(end_m*60+end_s)*100+end_ms - (start_m*60+start_s)*100+start_ms
if !elapsed_ms! lss 0 set /a elapsed_ms+=60*60*100
set /a mm=elapsed_ms/(60*100)
set /a ss=(elapsed_ms/100)%%60
set /a ms=elapsed_ms%%100
if !ss! lss 10 set ss=0!ss!
if !ms! lss 10 set ms=0!ms!
echo [+] Compilation took !mm!:!ss!.!ms!

if !BUILD_STATUS! neq 0 (
    echo.
    echo Build failed! Please check the errors above.
    pause
    exit /b !BUILD_STATUS!
)

echo [+] Executable built successfully

echo.
echo ===================================================
echo Build completed! The final executable is in the 'dist' folder.
echo ===================================================
echo.
echo Press Enter to open the dist folder...
pause > nul
explorer "%~dp0dist"