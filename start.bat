@echo off
title AI Photo Booth
del /q ".shutdown" >nul 2>&1
:loop
if exist ".shutdown" (
  echo [%date% %time%] 远程关机，已停止。
  del /q ".shutdown" >nul 2>&1
  pause
  exit /b 0
)
echo [%date% %time%] 启动服务...
call npm start
if exist ".shutdown" (
  echo [%date% %time%] 远程关机，已停止。
  del /q ".shutdown" >nul 2>&1
  pause
  exit /b 0
)
echo [%date% %time%] 服务异常停止，3秒后重启...
timeout /t 3 /nobreak >nul
goto loop
