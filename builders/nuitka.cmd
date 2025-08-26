@echo off
setlocal enabledelayedexpansion

set "LOG_DIR=%APPDATA%\ayosbypasser"
set "TEMP_BUILD_DIR=%LOG_DIR%\nuitka_build_temp"
set "LOG_FILE=%LOG_DIR%\nuitka_build.log"
set "FINAL_EXE_NAME=server.exe"

echo Cleaning up and preparing build environment...
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
if exist "%LOG_FILE%" del "%LOG_FILE%"
if exist "%TEMP_BUILD_DIR%" rmdir /s /q "%TEMP_BUILD_DIR%"
mkdir "%TEMP_BUILD_DIR%"
echo [+] Temporary build directory is ready at: %TEMP_BUILD_DIR%
echo [+] Build output will be logged to: %LOG_FILE%

cd ..

echo ===================================================
echo STEP 1: PREPARING DEPENDENCIES
echo ===================================================
echo Installing dependencies...
python -m pip install -r requirements.txt --quiet >> "%LOG_FILE%" 2>&1
python -m pip install nuitka --quiet >> "%LOG_FILE%" 2>&1
echo [+] Dependencies installed successfully.

echo.
echo ===================================================
echo STEP 2: BUILDING PYTHON EXECUTABLE WITH NUITKA
echo ===================================================
set "PY_DIST_PATH=%TEMP_BUILD_DIR%\dist"
set "PY_WORK_PATH=%TEMP_BUILD_DIR%\build"

echo Starting compilation...
set start_time=%time%

echo [1/2] Compiling auto-bypass service...
python -m nuitka src/auto_bypass.py ^
  --onefile ^
  --standalone ^
  --windows-disable-console ^
  --output-dir="%PY_DIST_PATH%" ^
  --output-filename=auto_bypass_service.exe ^
  --windows-icon-from-ico="%cd%\favicon.ico" ^
  --include-data-dir="%cd%\src=src" ^
  --jobs=%NUMBER_OF_PROCESSORS% ^
  --remove-output >> "%LOG_FILE%" 2>&1

if %errorlevel% neq 0 (
    echo [!] Failed to compile auto-bypass service. Check %LOG_FILE% for details.
    pause
    goto cleanup_and_exit
)

echo [2/2] Compiling main server and embedding service...
python -m nuitka server.py ^
  --onefile ^
  --standalone ^
  --output-dir="%PY_DIST_PATH%" ^
  --output-filename=server.exe ^
  --windows-icon-from-ico="%cd%\favicon.ico" ^
  --include-data-file="%cd%\index.html=index.html" ^
  --include-data-file="%cd%\favicon.ico=favicon.ico" ^
  --include-data-dir="%cd%\src=src" ^
  --include-data-file="%PY_DIST_PATH%\auto_bypass_service.exe=auto_bypass_service.exe" ^
  --jobs=%NUMBER_OF_PROCESSORS% ^
  --remove-output >> "%LOG_FILE%" 2>&1

set end_time=%time%
if %errorlevel% neq 0 (
    echo [!] Failed to compile main server. Check %LOG_FILE% for details.
    pause
    goto cleanup_and_exit
)

for /f "tokens=1-4 delims=:." %%a in ("%start_time%") do set /a "start_ms=1%%d-100, start_s=1%%c-100, start_m=1%%b-100"
for /f "tokens=1-4 delims=:." %%a in ("%end_time%") do set /a "end_ms=1%%d-100, end_s=1%%c-100, end_m=1%%b-100"
set /a elapsed_ms=(end_m*60+end_s)*100+end_ms - (start_m*60+start_s)*100+start_ms
if !elapsed_ms! lss 0 set /a elapsed_ms+=60*60*100
set /a mm=elapsed_ms/(60*100), ss=(elapsed_ms/100)%%60, ms=elapsed_ms%%100
if !ss! lss 10 set ss=0!ss!
if !ms! lss 10 set ms=0!ms!
echo [+] Compilation took !mm!:!ss!.!ms!
echo [+] Python executable built successfully.

echo.
echo ===================================================
echo STEP 3: FINALIZING RELEASE
echo ===================================================
echo Moving final executable to Desktop...
if exist "%PY_DIST_PATH%\%FINAL_EXE_NAME%" (
    move /Y "%PY_DIST_PATH%\%FINAL_EXE_NAME%" "%USERPROFILE%\Desktop\" > nul
    echo [+] Success! %FINAL_EXE_NAME% is now on your Desktop.
) else (
    echo [!] Could not find the final executable: %FINAL_EXE_NAME%
    pause
    goto cleanup_and_exit
)

:cleanup_and_exit
echo.
echo Cleaning up temporary files...
if exist "%TEMP_BUILD_DIR%" rmdir /s /q "%TEMP_BUILD_DIR%"
echo [+] Cleanup complete.

echo.
echo ===================================================
echo Build process finished.
echo ===================================================
echo.
echo Press Enter to open your Desktop folder...
pause > nul