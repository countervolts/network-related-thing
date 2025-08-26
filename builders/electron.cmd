@echo off
setlocal enabledelayedexpansion

set "LOG_DIR=%APPDATA%\ayosbypasser"
set "TEMP_BUILD_DIR=%LOG_DIR%\build_temp"
set "LOG_FILE=%LOG_DIR%\build.log"
set "FINAL_EXE_NAME=Network Related Thing.exe"

echo Cleaning up and preparing build environment...
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
if exist "%LOG_FILE%" del "%LOG_FILE%"
if exist "%TEMP_BUILD_DIR%" rmdir /s /q "%TEMP_BUILD_DIR%"
mkdir "%TEMP_BUILD_DIR%"
echo [+] Temporary build directory is ready at: %TEMP_BUILD_DIR%
echo [+] Build output will be logged to: %LOG_FILE%

cd ..

echo.
echo ===================================================
echo STEP 1: BUILDING PYTHON EXECUTABLE
echo ===================================================

set "PY_DIST_PATH=%TEMP_BUILD_DIR%\py_dist"
set "PY_WORK_PATH=%TEMP_BUILD_DIR%\py_build"

echo Starting Python compilation into temp directory...

echo [1/2] Compiling auto-bypass service...
pyinstaller src/auto_bypass.py --onefile --name=auto_bypass_service --icon=favicon.ico --clean --noconfirm --noconsole ^
--distpath "%PY_DIST_PATH%" --workpath "%PY_WORK_PATH%" ^
--add-data "src;src" --hidden-import=ctypes >> "%LOG_FILE%" 2>&1

if %errorlevel% neq 0 (
    echo [!] Failed to compile auto-bypass service. Check %LOG_FILE% for details.
    pause
    goto cleanup_and_exit
)

echo [2/2] Compiling main server and embedding service...
pyinstaller server.py --onefile --name=server --icon=favicon.ico --clean --noconfirm ^
--distpath "%PY_DIST_PATH%" --workpath "%PY_WORK_PATH%" ^
--add-data "index.html;." --add-data "favicon.ico;." ^
--add-data "src;src" ^
--add-binary "%PY_DIST_PATH%\auto_bypass_service.exe;." >> "%LOG_FILE%" 2>&1

if %errorlevel% neq 0 (
    echo [!] Failed to compile main server. Check %LOG_FILE% for details.
    pause
    goto cleanup_and_exit
)

echo [+] Python executable built successfully.

echo.
echo ===================================================
echo STEP 2: BUILDING ELECTRON APPLICATION
echo ===================================================

cd electron-wrapper

copy "%PY_DIST_PATH%\server.exe" "..\server.exe" /Y > nul

echo Installing Node dependencies...
call npm install --quiet >> "%LOG_FILE%" 2>&1
if %errorlevel% neq 0 (
    echo Failed to install dependencies. Check %LOG_FILE% for details.
    cd ..
    pause
    goto cleanup_and_exit
)

echo Building Electron app...
call npm run build -- --win -c.directories.output="%TEMP_BUILD_DIR%\electron_dist" >> "%LOG_FILE%" 2>&1
if %errorlevel% neq 0 (
    echo Failed to build Electron application. Check %LOG_FILE% for details.
    cd ..
    pause
    goto cleanup_and_exit
)

echo [+] Electron build completed successfully!
cd ..

echo.
echo ===================================================
echo STEP 3: FINALIZING RELEASE
echo ===================================================

echo Moving final executable to Desktop...
if exist "%TEMP_BUILD_DIR%\electron_dist\%FINAL_EXE_NAME%" (
    move /Y "%TEMP_BUILD_DIR%\electron_dist\%FINAL_EXE_NAME%" "%USERPROFILE%\Desktop\" > nul
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
if exist "server.exe" del "server.exe"
echo [+] Cleanup complete.

echo.
echo ===================================================
echo Build process finished.
echo ===================================================
echo.
pause