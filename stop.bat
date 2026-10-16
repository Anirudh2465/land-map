@echo off
echo =======================================================
echo          Land Parcel Management System (LPMS)
echo                Stopping Local Server...
echo =======================================================
echo.

docker info >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Docker is not running.
    pause
    exit /b 1
)

docker compose down
echo.
echo [*] LPMS containers have been stopped.
echo.
pause
