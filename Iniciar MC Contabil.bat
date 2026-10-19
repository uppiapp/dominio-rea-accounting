@echo off
title MC Assessoria Contabil - Central de Gestao de Pastas
chcp 65001 > nul
cls

echo ===================================================================
echo             MC ASSESSORIA CONTABIL - HUB DE AUTOMACAO
echo ===================================================================
echo.
echo [1/2] Verificando conexao com a rede \\192.168.15.2...
echo.

cd /d "%~dp0"

echo [2/2] Iniciando Servidor Local em http://localhost:3000...
start "" http://localhost:3000

node server.js

pause
