#!/bin/bash

# 冒险者协会 - 一键启动脚本
# Adventurers Guild - One-Click Start Script

set -e

echo "🌌 冒险者协会 - 启动中..."
echo "Adventurers Guild - Starting..."
echo ""

# 检查 Node.js 版本
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 24 ]; then
  echo "❌ 错误: 需要 Node.js 24 或更高版本"
  echo "❌ Error: Node.js 24 or higher is required"
  echo "当前版本 / Current version: $(node -v)"
  exit 1
fi

echo "✅ Node.js 版本检查通过: $(node -v)"
echo ""

# 检查依赖是否已安装
if [ ! -d "node_modules" ]; then
  echo "📦 安装前端依赖..."
  echo "📦 Installing frontend dependencies..."
  npm install
  echo ""
fi

if [ ! -d "runtime/node_modules" ]; then
  echo "📦 安装运行时依赖..."
  echo "📦 Installing runtime dependencies..."
  cd runtime && npm install && cd ..
  echo ""
fi

# 构建前端
echo "🔨 构建前端..."
echo "🔨 Building frontend..."
npm run build
echo ""

# 构建运行时
echo "🔨 构建运行时..."
echo "🔨 Building runtime..."
cd runtime && npm run build && cd ..
echo ""

# 启动运行时
echo "🚀 启动运行时..."
echo "🚀 Starting runtime..."
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎨 前端 UI: http://localhost:3001"
echo "📜 Recruitment API: http://localhost:3001/api/recruitment-book"
echo "🪪 Agent Application API: http://localhost:3001/api/agent/applications"
echo "🛡️ Admin Agent Join API: http://localhost:3001/admin-api/agent/join"
echo "📡 WebSocket: ws://localhost:3000"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "局域网访问请将 localhost 替换为你自己的局域网 IP"
echo "For LAN access, replace localhost with your own LAN IP"
echo ""
echo "按 Ctrl+C 停止运行时"
echo "Press Ctrl+C to stop the runtime"
echo ""

cd runtime && npm start
