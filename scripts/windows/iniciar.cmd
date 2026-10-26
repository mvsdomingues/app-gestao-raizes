@echo off
REM -------------------------------------------------------------
REM  Inicia a aplicacao Raizes (http://localhost:5000)
REM  Use este arquivo na inicializacao do Windows (ou com dois cliques).
REM -------------------------------------------------------------
chcp 65001 >nul
cd /d "%~dp0..\.."

if not exist "node_modules" (
  echo Instalando dependencias...
  call npm install || goto :erro
)
if not exist "apps\web\dist\index.html" (
  echo Gerando o build...
  call npm run build || goto :erro
)

call npm start
goto :eof

:erro
echo.
echo Falha ao iniciar. Verifique se o Node.js 22+ esta instalado.
pause
