@echo off
title MC Assessoria Contabil - Programa Desktop Local
chcp 65001 > nul
cls

echo ===================================================================
echo             MC ASSESSORIA CONTABIL - PROGRAMA DESKTOP
echo ===================================================================
echo.
echo [1/3] Verificando conexao com a rede local \\192.168.15.2...
if exist "\\192.168.15.2\mc assessoria contabil" (
    echo       [OK] Rede local conectada e acessivel!
) else (
    echo       [AVISO] Pasta de rede \\192.168.15.2 nao encontrada no momento.
    echo               O programa usara o banco de dados e cache locais.
)
echo.

cd /d "%~dp0"

echo [2/3] Verificando Servidor e Banco de Dados Local...
netstat -ano | findstr :3000 | findstr LISTENING > nul
if %errorlevel% equ 0 (
    echo       [OK] Servidor local ja esta ativo na porta 3000.
) else (
    echo       [INFO] Iniciando motor local em segundo plano...
    start /B node server.js
    timeout /t 2 /nobreak > nul
)
echo.

echo [3/3] Abrindo Aplicativo Desktop em Janela Nativa...
set EDGE_PATH="C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
set CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"

if exist %EDGE_PATH% (
    start "" %EDGE_PATH% --app="http://localhost:3000" --window-size=1440,900 --user-data-dir="%LOCALAPPDATA%\MCContabilApp"
) else if exist %CHROME_PATH% (
    start "" %CHROME_PATH% --app="http://localhost:3000" --window-size=1440,900 --user-data-dir="%LOCALAPPDATA%\MCContabilApp"
) else (
    start "" http://localhost:3000
)

echo.
echo ===================================================================
echo      Programa rodando em modo desktop nativo com acesso a pastas!
echo ===================================================================
echo.
timeout /t 3 > nul

