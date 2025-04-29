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

echo Removing all __pycache__ folders...
for /d /r %%d in (__pycache__) do (
    if exist "%%d" rmdir /s /q "%%d"
)
echo [+] __pycache__ folders removed

echo Starting compilation...
set start_time=%time%

pyinstaller server.py --onefile --name=server --icon=favicon.ico --clean --noconfirm ^
--add-data "index.html;." --add-data "favicon.ico;." ^
--add-data "src\bypass;src\bypass" --add-data "src\history;src\history" ^
--add-data "src\misc;src\misc" --add-data "src\scanner;src\scanner" ^
--add-data "src\settings;src\settings" ^
--add-data "src\visualizer;src\visualizer" ^
--add-data "src\hotspot;src\hotspot" > NUL 2>&1

set end_time=%time%
set BUILD_STATUS=!errorlevel!

rem calculate the build time duration
set /a start_h=%start_time:~0,2%
set /a start_m=%start_time:~3,2%
set /a start_s=%start_time:~6,2%
set /a start_cs=%start_time:~9,2%
set /a start_total_s=(start_h*3600)+(start_m*60)+start_s
set /a start_total_cs=start_total_s*100+start_cs
set /a end_h=%end_time:~0,2%
set /a end_m=%end_time:~3,2%
set /a end_s=%end_time:~6,2%
set /a end_cs=%end_time:~9,2%
set /a end_total_s=(end_h*3600)+(end_m*60)+end_s
set /a end_total_cs=end_total_s*100+end_cs
set /a duration_cs=end_total_cs-start_total_cs
set /a duration_s=duration_cs/100
set /a duration_cs=duration_cs%%100
set /a total_minutes=duration_s/60
set /a duration_s=duration_s%%60

if !BUILD_STATUS! neq 0 (
    echo.
    echo Build failed! Please check the errors above.
    pause
    exit /b !BUILD_STATUS!
)

echo [+] Executable built successfully
echo [+] Compilation took %total_minutes%m %duration_s%.%duration_cs%s

echo.
echo ===================================================
echo Build completed!
echo ===================================================
echo.
echo Press Enter to open the dist folder...
pause > nul
explorer "%~dp0dist"