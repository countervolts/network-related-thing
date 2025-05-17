@echo off
echo ===================================================
echo Building Electron application...
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

echo Electron build completed successfully!
cd ..