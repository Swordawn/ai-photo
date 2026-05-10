#!/bin/bash
# AI Photo Booth 启动脚本（Linux 服务器部署）
# 用法：chmod +x start.sh && ./start.sh

cd "$(dirname "$0")"

# 清除关机标志
rm -f .shutdown

while true; do
  if [ -f ".shutdown" ]; then
    echo "[$(date)] 远程关机，已停止。"
    rm -f .shutdown
    exit 0
  fi

  echo "[$(date)] 启动服务..."
  npm start
  EXIT_CODE=$?

  if [ -f ".shutdown" ]; then
    echo "[$(date)] 远程关机，已停止。"
    rm -f .shutdown
    exit 0
  fi

  echo "[$(date)] 服务停止 (exit=$EXIT_CODE)，3秒后重启..."
  sleep 3
done
