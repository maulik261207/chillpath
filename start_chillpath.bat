@echo off
setlocal
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Python virtual environment not found.
  echo Create it with: python -m venv .venv
  echo Then install dependencies with: .venv\Scripts\python -m pip install -e .
  pause
  exit /b 1
)
set "CHILLPATH_DB_MODE=sqlite"
set "DATABASE_MODE=sqlite"
set "AUTO_CREATE_SCHEMA=true"
echo Starting ChillPath with local SQLite database: chillpath.db
echo Read-only database summary: http://127.0.0.1:8000/v1/local/database/summary
".venv\Scripts\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
pause
