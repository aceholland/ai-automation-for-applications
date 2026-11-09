@echo off
cd /d "%~dp0"
python -m agent --open
if errorlevel 1 pause
