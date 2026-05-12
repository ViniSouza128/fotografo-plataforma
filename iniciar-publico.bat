@echo off
setlocal
title PhotoVault - Publico via Cloudflare Tunnel
color 0B
cd /d "%~dp0"
cls

echo.
echo  ================================================
echo   PHOTOVAULT - Modo PUBLICO (Cloudflare Tunnel)
echo  ================================================
echo.
echo  Este script:
echo    1. Sobe o servidor local (npm run dev)
echo    2. Cria um tunel Cloudflare apontando p/ localhost:3000
echo    3. Te da uma URL HTTPS publica do tipo
echo       https://abc-def-ghi.trycloudflare.com
echo.
echo  Vantagens vs deploy "de verdade":
echo    - 100%% gratis e sem cadastro
echo    - Sem precisar abrir porta no roteador
echo    - Sem expor seu IP residencial
echo    - HTTPS automatico (certificado da Cloudflare)
echo    - URL nova a cada vez (anonima/temporaria)
echo.
echo  Limitacoes:
echo    - URL muda toda vez que voce reinicia
echo    - Servidor depende do seu PC ligado
echo    - Para URL fixa, precisa criar conta gratis na Cloudflare
echo      (instrucoes em docs/OPERACAO.md)
echo.
echo  ================================================

REM ----- 1. Verifica se cloudflared esta instalado -----
where cloudflared >nul 2>&1
if errorlevel 1 (
    echo.
    echo  [!] cloudflared nao encontrado no PATH.
    echo.
    echo  Para instalar:
    echo    1. Abra PowerShell como administrador
    echo    2. Rode:
    echo       winget install --id Cloudflare.cloudflared
    echo.
    echo    OU baixe manualmente em:
    echo       https://github.com/cloudflare/cloudflared/releases/latest
    echo       Procure por: cloudflared-windows-amd64.exe
    echo       Renomeie para cloudflared.exe e coloque em C:\Windows\System32
    echo.
    echo  Depois rode este script de novo.
    echo  ================================================
    pause
    exit /b 1
)

REM ----- 2. Limpa cache do Next se existir -----
if exist ".next\" (
    echo  [OK] Limpando cache do Next.js...
    rmdir /s /q ".next"
)

echo  [OK] cloudflared encontrado.
echo  [OK] Iniciando servidor local em background...
echo.

REM ----- 3. Sobe o servidor em background -----
start "PhotoVault DEV (local)" cmd /c "npm run dev"

echo  [...] Aguardando servidor subir (~10s)...
timeout /t 10 /nobreak >nul

echo.
echo  ================================================
echo   ABRINDO TUNEL PUBLICO...
echo  ================================================
echo.
echo  A URL publica vai aparecer logo abaixo.
echo  Anote ela (ex: https://abc-def.trycloudflare.com).
echo.
echo  Para parar tudo: feche esta janela + a janela "PhotoVault DEV".
echo  ================================================
echo.

REM ----- 4. Sobe o tunel -----
cloudflared tunnel --url http://localhost:3000

echo.
echo  Tunel encerrado. Pressione qualquer tecla para fechar...
pause >nul
