@echo off
setlocal
set "TASK_ROOT=%~dp0.."
set "TASK_CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
set "TASK_BIN=%TASK_ROOT%\bin\diagnostics"
if not exist "%TASK_CSC%" (
  echo .NET Framework x64 C# compiler was not found. 1>&2
  exit /b 1
)
if not exist "%TASK_BIN%" mkdir "%TASK_BIN%"
if /I "%~1"=="Asar" goto asar
"%TASK_CSC%" /nologo /target:exe /platform:x64 /out:"%TASK_BIN%\Probe.exe" /reference:System.Drawing.dll /reference:System.Windows.Forms.dll /reference:System.Web.Extensions.dll "%TASK_ROOT%\research\transparency-probe\Probe.cs" "%TASK_ROOT%\tools\NativeProcess.cs"
if errorlevel 1 exit /b 1
"%TASK_BIN%\Probe.exe" inspect-auto "%TASK_ROOT%"
if errorlevel 1 exit /b 1
type "%TASK_ROOT%\outputs\latest-inspection.json"
exit /b 0
:asar
"%TASK_CSC%" /nologo /target:exe /platform:x64 /out:"%TASK_BIN%\SourceInspector.exe" /reference:System.Web.Extensions.dll "%TASK_ROOT%\tools\SourceInspector.cs" "%TASK_ROOT%\tools\NativeProcess.cs"
if errorlevel 1 exit /b 1
if "%~2"=="" (
  "%TASK_BIN%\SourceInspector.exe"
) else (
  "%TASK_BIN%\SourceInspector.exe" "%~2"
)
exit /b %errorlevel%
