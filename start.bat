@echo off
title AI Photo Booth
:loop
if exist ".shutdown" (
  echo [%date% %time%] 收到远程关机指令，不再重启。
  del /q ".shutdown" >nul 2>&1
  pause
  exit /b 0
)
echo [%date% %time%] 启动服务...
call npm start
if exist ".shutdown" (
  echo [%date% %time%] 收到远程关机指令，不再重启。
  del /q ".shutdown" >nul 2>&1
  pause
  exit /b 0
)
echo [%date% %time%] 服务已停止，3秒后重启...
timeout /t 3 /nobreak >nul
goto loop
