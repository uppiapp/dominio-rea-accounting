@echo off
chcp 65001 > nul
cls
echo Criando atalho na sua Area de Trabalho...

set SCRIPT_DIR=%~dp0
set TARGET_BAT=%SCRIPT_DIR%Iniciar MC Contabil.bat
set DESKTOP_DIR=%USERPROFILE%\Desktop
set SHORTCUT=%DESKTOP_DIR%\MC Contabil Hub.lnk

powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%SHORTCUT%'); $s.TargetPath = '%TARGET_BAT%'; $s.WorkingDirectory = '%SCRIPT_DIR%'; $s.WindowStyle = 7; $s.Description = 'MC Contabil - Sistema Contabil e Fiscal Local'; $s.Save()"

echo.
echo ===================================================================
echo   [OK] Atalho criado com sucesso na sua Area de Trabalho!
echo   Procure pelo icone "MC Contabil Hub" no seu Desktop.
echo ===================================================================
echo.
pause
