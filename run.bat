@echo off

REM Check if dev mode is enabled
set DEV_MODE=0
if "%1"=="dev" (
    set DEV_MODE=1
)

REM Check for an active internet connection
echo Checking for an active internet connection...
ping -n 1 google.com >nul 2>&1
if %errorlevel% neq 0 (
    echo No internet connection detected. Please check your connection and press any key to retry.
    pause
    exit /b
)

REM Check if Python is installed
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Python is not installed. Downloading and installing Python...
    
    set PYTHON_INSTALLER_URL=https://www.python.org/ftp/python/3.11.5/python-3.11.5-amd64.exe
    set PYTHON_INSTALLER=python-installer.exe

    powershell -Command "Invoke-WebRequest -Uri %PYTHON_INSTALLER_URL% -OutFile %PYTHON_INSTALLER%" >nul 2>&1
    if %errorlevel% neq 0 (
        echo Failed to download Python installer. Please check your internet connection.
        pause
        exit /b
    )

    echo Installing Python silently...
    %PYTHON_INSTALLER% /quiet InstallAllUsers=1 PrependPath=1 Include_test=0 >nul 2>&1
    if %errorlevel% neq 0 (
        echo Failed to install Python. Please install it manually.
        pause
        exit /b
    )

    del %PYTHON_INSTALLER%
)

if %DEV_MODE%==1 (
    echo Dev mode enabled. Skipping pip checks...
) else (
    REM Check if pip is installed
    pip --version >nul 2>&1
    if %errorlevel% neq 0 (
        echo Pip is not installed. Please install pip and try again.
        pause
        exit /b
    )
)

REM Install required Python package: getmac
echo Installing required package: getmac...
pip install getmac 
if %errorlevel% neq 0 (
    echo Failed to install getmac. Please check the output for details.
    pause
    exit /b
)

REM Run getmac module
echo Running getmac module...
cmd /k python -m getmac