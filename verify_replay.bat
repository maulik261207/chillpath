@echo off
setlocal
cd /d "%~dp0"
set "CHILLPATH_DB_MODE=sqlite"
set "DATABASE_MODE=sqlite"
if exist ".venv\Scripts\python.exe" (set "PYTHON=.venv\Scripts\python.exe") else (set "PYTHON=python")
%PYTHON% verify_replay.py
pause
