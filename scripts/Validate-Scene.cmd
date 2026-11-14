@echo off
setlocal
node "%~dp0validate-scene.mjs" --picker
if errorlevel 1 pause
