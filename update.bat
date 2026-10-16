@echo off
setlocal enabledelayedexpansion

echo =======================================================
echo          Land Parcel Management System (LPMS)
echo               Updating Application...
echo =======================================================
echo.

:: 1. Check Git
where git >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Git is not installed or not in PATH!
    echo Please ensure Git is installed to pull updates.
    pause
    exit /b 1
)

:: 2. Check Docker
docker info >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Docker is not running or not installed!
    echo Please make sure Docker Desktop is running before updating.
    pause
    exit /b 1
)

:: 3. Pull latest changes from demo-branch
echo [*] Stashing any local changes...
git stash

echo [*] Checking out demo-branch...
git checkout demo-branch
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Failed to switch to demo-branch.
    pause
    exit /b 1
)

echo [*] Pulling latest updates from GitHub...
git pull origin demo-branch
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Failed to pull updates from GitHub.
    echo Please check your internet connection and try again.
    pause
    exit /b 1
)

:: 4. Read APP_PORT from .env (defaults to 8080)
set APP_PORT=8080
if exist ".env" (
    for /f "tokens=1,2 delims==" %%a in ('findstr /i "^APP_PORT=" .env 2^>nul') do (
        set APP_PORT=%%b
    )
)

:: 5. Rebuild and restart containers
echo.
echo [*] Rebuilding and restarting containers with latest code...
echo     (This may take a few minutes)
echo.
docker compose up -d --build
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Docker build failed. Please check the logs above.
    pause
    exit /b 1
)

echo.
echo =======================================================
echo   LPMS has been successfully updated and restarted!
echo.
echo   Access the app:     http://localhost:%APP_PORT%
echo =======================================================
echo.
pause
