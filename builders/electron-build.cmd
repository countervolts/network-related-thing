@echo off
setlocal

cd ..

echo ===================================================
echo STEP 1: BUILDING PYTHON EXECUTABLE
echo ===================================================

echo Cleaning up previous build files...
if exist "build" rmdir /s /q "build"
if exist "dist" rmdir /s /q "dist"
if exist "server.spec" del /f /q "server.spec"
echo [+] Previous build files removed.

echo Starting Python compilation...

echo [1/2] Compiling auto-bypass service...
pyinstaller src/auto_bypass.py --onefile --name=auto_bypass_service --icon=favicon.ico --clean --noconfirm --noconsole ^
--add-data "src;src" --hidden-import=ctypes > NUL 2>&1

if %errorlevel% neq 0 (
    echo [!] Failed to compile auto-bypass service. Check logs for details.
    pause
    exit /b %errorlevel%
)

echo [2/2] Compiling main server and embedding service...
pyinstaller server.py --onefile --name=server --icon=favicon.ico --clean --noconfirm ^
--add-data "index.html;." --add-data "favicon.ico;." ^
--add-data "src;src" ^
--add-binary "dist/auto_bypass_service.exe;." > NUL 2>&1

if %errorlevel% neq 0 (
    echo [!] Failed to compile main server. Check logs for details.
    pause
    exit /b %errorlevel%
)

echo [+] Python executable built successfully.

echo.
echo ===================================================
echo STEP 2: BUILDING ELECTRON APPLICATION
echo ===================================================

cd electron-wrapper

echo Installing Node dependencies...
call npm install
if %errorlevel% neq 0 (
    echo Failed to install dependencies
    exit /b %errorlevel%
)

echo Building Electron app...
call npm run build
if %errorlevel% neq 0 (
    echo Failed to build Electron application
    exit /b %errorlevel%
)

echo [+] Electron build completed successfully!
cd ..

echo.
echo ===================================================
echo STEP 3: FINALIZING RELEASE
echo ===================================================

echo Cleaning and creating release folder...
if exist "release" rmdir /s /q "release"
mkdir "release"

echo Copying build artifacts to release folder...
copy "dist\server.exe" "release\" >nul 2>&1
if exist "electron-wrapper\dist\Network Related Thing Portable.exe" (
    copy "electron-wrapper\dist\Network Related Thing Portable.exe" "release\" >nul 2>&1
) else (
    echo [!] Electron portable executable not found.
)

echo.
echo ===================================================
echo Build completed! Files are in the 'release' folder.
echo ===================================================
echo.