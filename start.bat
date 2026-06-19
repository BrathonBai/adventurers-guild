@echo off
REM 冒险者协会 - 一键启动脚本 (Windows)
REM Adventurer's Guild - One-Click Start Script (Windows)

echo 🌌 冒险者协会 - 启动中...
echo Adventurer's Guild - Starting...
echo.

REM 检查 Node.js 是否安装
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ❌ 错误: 未找到 Node.js
    echo ❌ Error: Node.js not found
    echo 请安装 Node.js 24 或更高版本
    echo Please install Node.js 24 or higher
    pause
    exit /b 1
)

echo ✅ Node.js 版本检查通过
node -v
echo.

REM 检查依赖是否已安装
if not exist "node_modules" (
    echo 📦 安装前端依赖...
    echo 📦 Installing frontend dependencies...
    call npm install
    echo.
)

if not exist "server\node_modules" (
    echo 📦 安装后端依赖...
    echo 📦 Installing backend dependencies...
    cd server
    call npm install
    cd ..
    echo.
)

REM 构建前端
echo 🔨 构建前端...
echo 🔨 Building frontend...
call npm run build
echo.

REM 构建后端
echo 🔨 构建后端...
echo 🔨 Building backend...
cd server
call npm run build
cd ..
echo.

REM 启动服务器
echo 🚀 启动服务器...
echo 🚀 Starting server...
echo.
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo 🎨 前端 UI: http://localhost:3001
echo 📜 Recruitment API: http://localhost:3001/api/recruitment-book
echo 🪪 Agent Join API: http://localhost:3001/api/agent/join
echo 📡 WebSocket: ws://localhost:3000
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.
echo 局域网访问请将 localhost 替换为你自己的局域网 IP
echo For LAN access, replace localhost with your own LAN IP
echo.
echo 按 Ctrl+C 停止服务器
echo Press Ctrl+C to stop the server
echo.

cd server
call npm start
