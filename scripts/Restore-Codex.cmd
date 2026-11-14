@echo off
setlocal
node "%~dp0..\src\launch.mjs" --normal
if errorlevel 1 pause
