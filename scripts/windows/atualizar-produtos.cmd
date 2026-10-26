@echo off
REM -------------------------------------------------------------
REM  Atualiza a base de produtos de todos os fornecedores.
REM  Para agendar: Agendador de Tarefas > Criar tarefa basica >
REM  Diariamente > Iniciar um programa > este arquivo.
REM  Para fornecedores especificos: atualizar-produtos.cmd asia spot
REM -------------------------------------------------------------
chcp 65001 >nul
cd /d "%~dp0..\.."
if not exist "logs" mkdir logs
call npm run atualizar -- %* >> "logs\atualizacao.log" 2>&1
