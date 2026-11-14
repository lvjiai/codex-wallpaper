@echo off
setlocal
node "%~dp0..\src\launch.mjs"
if errorlevel 1 pause
