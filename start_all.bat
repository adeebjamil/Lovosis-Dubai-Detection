@echo off
echo ===================================================
echo     STARTING LOVOSIS DUBAI AI SYSTEM
echo ===================================================

echo [1/4] Starting MediaMTX RTSP/WebRTC Server...
if exist "mediamtx\mediamtx.exe" (
    start "Lovosis [1/4] MediaMTX RTSP" cmd /k "cd mediamtx && mediamtx.exe mediamtx.yml"
) else if exist "mediamtx.exe" (
    start "Lovosis [1/4] MediaMTX RTSP" cmd /k "mediamtx.exe mediamtx.yml"
) else (
    echo [WARNING] mediamtx.exe not found in mediamtx/ or root folder. Please download from https://github.com/bluenviron/mediamtx/releases
)

timeout /t 2 /nobreak >nul

echo [2/4] Starting Backend Server on http://localhost:5000...
start "Lovosis [2/4] Backend API (:5000)" cmd /k "cd backend && npm run dev"

timeout /t 3 /nobreak >nul

echo [3/4] Starting Frontend App on http://localhost:3000...
start "Lovosis [3/4] Frontend Web (:3000)" cmd /k "cd frontend && npm run dev"

timeout /t 2 /nobreak >nul

echo [4/4] Starting Python AI Detector Engine...
start "Lovosis [4/4] AI Detector Engine" cmd /k "call .venv\Scripts\activate && python -u -m detector"

echo.
echo ===================================================
echo  All 4 services launched in separate windows!
echo  Open your browser at: http://localhost:3000
echo  Default Login:
echo    Email:    admin@gmail.com
echo    Password: Admin@000
echo ===================================================
timeout /t 5
