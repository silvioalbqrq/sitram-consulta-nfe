@echo off
REM iniciar_sitram.bat - 2 cliques: liga o backend e abre o site. Nao feche esta janela enquanto usar.
cd /d "%~dp0"
set PORTA=8001
echo ============================================
echo  SITRAM - Consulta NFe Interestadual
echo ============================================
echo.
where python >nul 2>nul
if errorlevel 1 (
  echo [ERRO] Python nao foi encontrado.
  echo Instale o Python 3 em python.org e marque a opcao Add to PATH.
  echo.
  pause
  exit /b 1
)
python -m uvicorn --version >nul 2>nul
if errorlevel 1 (
  echo Instalando dependencias: fastapi e uvicorn...
  python -m pip install fastapi uvicorn
  if errorlevel 1 (
    echo [ERRO] Falha ao instalar. Verifique a internet e tente de novo.
    echo.
    pause
    exit /b 1
  )
)
REM Se o backend ja estiver no ar, so abre o navegador
python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8001/api/status', timeout=3).read()" >nul 2>nul
if not errorlevel 1 (
  echo Backend ja estava no ar. Abrindo o site...
  goto abrir
)
echo Ligando o backend (janela minimizada "SITRAM backend")...
start "SITRAM backend" /min python -m uvicorn backend_sitram:app --port 8001
echo Aguardando o backend responder...
set TENT=0
:espera
python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8001/api/status', timeout=3).read()" >nul 2>nul
if not errorlevel 1 (
  echo Backend no ar!
  goto abrir
)
set /a TENT+=1
if %TENT% GEQ 30 (
  echo [ERRO] Backend nao respondeu em 30 segundos.
  echo Veja a janela SITRAM backend para detalhes do erro.
  echo.
  pause
  exit /b 1
)
timeout /t 1 /nobreak >nul
goto espera
:abrir
start "" "http://127.0.0.1:8001/"
echo.
echo Site aberto no navegador (http://127.0.0.1:8001/).
echo NAO feche esta janela enquanto usar o site.
echo Para encerrar: feche esta janela e a janela "SITRAM backend".
echo.
pause
