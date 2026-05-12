@echo off
setlocal
title PhotoVault - Local
color 0A
cd /d "%~dp0"
cls

echo.
echo  ================================================
echo   PHOTOVAULT - Rodar local
echo  ================================================
echo.

if not exist "package.json" (
    echo  [ERRO] package.json nao encontrado.
    echo  Abra este .bat na pasta raiz do projeto.
    pause
    exit /b 1
)

if not exist "node_modules\" (
    echo  [!] node_modules nao encontrado. Instalando dependencias...
    echo.
    npm install
    if errorlevel 1 (
        echo.
        echo  [ERRO] Falha no npm install. Verifique o Node.js.
        pause
        exit /b 1
    )
)

if exist ".next\" (
    echo  [OK] Limpando cache gerado do Next...
    rmdir /s /q ".next"
)

echo  [OK] Dependencias prontas.
echo  [OK] O navegador abrira em http://localhost:3000
echo.
echo  Login admin padrao, se nao foi alterado:
echo       email: admin@test.com
echo       senha: 123456
echo.
echo  Para parar o servidor: Ctrl+C
echo  ================================================
echo.

start "" powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Sleep -Seconds 5; Start-Process 'http://localhost:3000'"

npm run dev

echo.
echo  O servidor foi encerrado. Pressione qualquer tecla para fechar...
pause >nul
