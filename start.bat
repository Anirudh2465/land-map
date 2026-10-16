@echo off
setlocal enabledelayedexpansion

echo =======================================================
echo          Land Parcel Management System (LPMS)
echo                Starting Local Server...
echo =======================================================
echo.

:: 1. Check if Docker is installed and running
docker info >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Docker is not running or not installed!
    echo Please make sure Docker Desktop is running, then run this file again.
    echo.
    pause
    exit /b 1
)

:: 2. Check if .env exists, copy from template if not
if not exist ".env" (
    echo [*] .env not found. Creating default configuration from .env.local.example...
    copy ".env.local.example" ".env" >nul
    echo [*] .env created successfully.
)

:: 3. Read APP_PORT from .env (defaults to 8080)
set APP_PORT=8080
for /f "tokens=1,2 delims==" %%a in ('findstr /i "^APP_PORT=" .env 2^>nul') do (
    set APP_PORT=%%b
)

:: 4. Start Docker containers
echo [*] Starting containers...
docker compose up -d
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Failed to start containers. Please check Docker Desktop.
    echo.
    pause
    exit /b 1
)

echo.
echo =======================================================
echo   LPMS is running!
echo.
echo   Access the app in your browser:
echo     - On this machine:    http://localhost:%APP_PORT%
echo     - Across office LAN:  http://^<this-pc-ip^>:%APP_PORT%
echo.
echo   Default Admin Login:    admin@lms.com
echo   Default Admin Password: Admin@1234
echo =======================================================
echo.
pause
