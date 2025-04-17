@echo off
setlocal enabledelayedexpansion
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
echo [+] Previous build files removed

echo Building executable...
pyinstaller server.py --onefile --name=server --icon=favicon.ico --clean --noconfirm ^
--add-data "index.html;." --add-data "favicon.ico;." ^
--add-data "src\bypass;src\bypass" --add-data "src\history;src\history" ^
--add-data "src\misc;src\misc" --add-data "src\scanner;src\scanner" ^
--add-data "src\settings;src\settings" ^
--add-data "src\visualizer;src\visualizer" > NUL 2>&1

set BUILD_STATUS=!errorlevel!
if !BUILD_STATUS! neq 0 (
    echo.
    echo Build failed! Please check the errors above.
    pause
    exit /b !BUILD_STATUS!
)

echo [+] Executable built successfully

echo.
echo ===================================================
echo Build completed!
echo ===================================================
echo.
echo Press Enter to open the dist folder...
pause > nul
explorer "%~dp0dist"