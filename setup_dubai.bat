@echo off
echo ===================================================
echo     LOVOSIS DUBAI DETECTION - INITIAL SETUP
echo ===================================================

echo [1/5] Setting up Environment Files...
if not exist "backend\.env" (
    copy "backend\.env.example" "backend\.env"
    echo Created backend\.env from template.
)
if not exist "frontend\.env.local" (
    copy "frontend\.env.example" "frontend\.env.local"
    echo Created frontend\.env.local from template.
)

echo.
echo [2/5] Installing Backend Node Dependencies...
cd backend
call npm install
echo Pushing Prisma Database Schema...
call npx prisma db push
echo Seeding Default Admin and Settings...
call npm run db:seed
cd ..

echo.
echo [3/5] Installing Frontend Dependencies...
cd frontend
call npm install
cd ..

echo.
echo [4/5] Setting up Python Virtual Environment...
if not exist ".venv" (
    python -m venv .venv
    echo Created virtual environment .venv
)
call .venv\Scripts\activate
python -m pip install --upgrade pip
echo Installing Python AI Detector Dependencies...
pip install -r requirements.txt

echo.
echo ===================================================
echo Setup Complete!
echo To run the full system, run: start_all.bat
echo ===================================================
pause
