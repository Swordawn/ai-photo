@echo off
title AI Photo Booth
:loop
echo [%date% %time%] 启动服务...
call npm start
echo [%date% %time%] 服务已停止，3秒后重启...
timeout /t 3 /nobreak >nul
goto loop
