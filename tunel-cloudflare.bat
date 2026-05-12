@echo off
setlocal
title PhotoVault - Local + Cloudflare
color 0B
cd /d "%~dp0"
cls

echo.
echo  ================================================
echo   PHOTOVAULT - Rodar local + tunel Cloudflare
echo  ================================================
echo.
echo  Este atalho faz 3 coisas:
echo    1. Sobe o Next em http://localhost:3000
echo    2. Abre o localhost no navegador
echo    3. Abre o tunel Cloudflare e a URL publica
echo.
echo  Qualquer pessoa com a URL Cloudflare acessa seu site.
echo  Para parar o tunel: Ctrl+C nesta janela.
echo  Para parar o servidor local: feche a janela do Next.
echo.
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

set "CLOUDFLARED=cloudflared"
where cloudflared >nul 2>&1
if errorlevel 1 (
    if exist "%~dp0cloudflared.exe" (
        set "CLOUDFLARED=%~dp0cloudflared.exe"
        echo  [OK] Usando cloudflared.exe da pasta do projeto.
    ) else (
        echo  [ERRO] cloudflared nao encontrado.
        echo.
        echo  Baixe em:
        echo  https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
        echo.
        echo  Opcao simples:
        echo    1. Baixe o cloudflared.exe
        echo    2. Coloque nesta pasta
        echo    3. Rode este .bat novamente
        echo.
        start "" "https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
        pause
        exit /b 1
    )
)

echo  [OK] Abrindo servidor local em uma nova janela...
start "PhotoVault Next" cmd /k "cd /d ""%~dp0"" && npm run dev"

echo  [OK] Aguardando http://localhost:3000 responder...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ok=$false; for($i=0; $i -lt 60; $i++){ try { $r=Invoke-WebRequest -UseBasicParsing 'http://localhost:3000' -TimeoutSec 2; if($r.StatusCode -lt 500){ $ok=$true; break } } catch {}; Start-Sleep -Seconds 1 }; if($ok){ Start-Process 'http://localhost:3000'; exit 0 } else { exit 1 }"
if errorlevel 1 (
    echo  [ERRO] O localhost nao respondeu em tempo.
    echo  Verifique a janela do Next e rode novamente.
    pause
    exit /b 1
)

echo.
echo  [OK] Iniciando tunel Cloudflare...
echo  Quando a URL aparecer, ela sera aberta no navegador.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "$opened=$false; & $env:CLOUDFLARED tunnel --url 'http://localhost:3000' 2>&1 | ForEach-Object { $line=$_.ToString(); Write-Host $line; if((-not $opened) -and ($line -match 'https://[-a-zA-Z0-9]+\.trycloudflare\.com')){ $opened=$true; Write-Host ''; Write-Host ('URL publica: ' + $Matches[0]); Start-Process $Matches[0] } }"

echo.
echo  O tunel foi encerrado. Pressione qualquer tecla para fechar...
pause >nul
