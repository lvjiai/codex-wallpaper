@echo off
setlocal
set "TASK_ROOT=%~dp0.."
set "TASK_BIN=%TASK_ROOT%\bin\capture"
if not "%~1"=="" set "TASK_BIN=%~f1"
set "TASK_VC=%ProgramFiles%\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat"
if not exist "%TASK_VC%" (
  echo Visual Studio 2022 C++ tools were not found. 1>&2
  exit /b 1
)
call "%TASK_VC%" >nul
if errorlevel 1 exit /b 1
if not exist "%TASK_BIN%" mkdir "%TASK_BIN%"
cl /nologo /utf-8 /std:c++17 /EHsc /O2 /MT /DUNICODE /D_UNICODE /Fo"%TASK_BIN%\scene-capture.obj" /Fe"%TASK_BIN%\scene-capture.exe" "%TASK_ROOT%\native\scene-capture.cpp" /link windowsapp.lib d3d11.lib dxgi.lib dwmapi.lib windowscodecs.lib ole32.lib oleaut32.lib user32.lib gdi32.lib
exit /b %errorlevel%
