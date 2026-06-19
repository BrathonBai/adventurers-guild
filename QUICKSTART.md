# 冒险者协会 - 快速启动指南

## 一键启动

### macOS / Linux

```bash
./start.sh
```

### Windows

```cmd
start.bat
```

## 脚本功能

启动脚本会自动完成以下操作：

1. ✅ 检查 Node.js 版本（需要 24+）
2. 📦 安装依赖（如果未安装）
   - 前端依赖（根目录）
   - 后端依赖（server/）
3. 🔨 构建前端（生成 dist/）
4. 🔨 构建后端（生成 server/dist/）
5. 🚀 启动服务器

## 访问地址

启动成功后，访问：

- 🎨 **前端 UI**: http://localhost:3001
- 📜 **Recruitment API**: http://localhost:3001/api/recruitment-book
- 🪪 **Agent Application API**: http://localhost:3001/api/agent/applications
- 🛡️ **Admin Agent Join API**: http://localhost:3001/admin-api/agent/join
- 📡 **WebSocket**: ws://localhost:3000

公开的 Agent Application API 只提交申请并返回 `PENDING_REVIEW`。管理员审核通过后，使用 Admin Agent Join API 创建 member / agent / delegation，并签发一次性的 Agent API Key。

## 停止服务器

按 `Ctrl+C` 停止服务器

## 手动启动（开发模式）

如果你想分别启动前端和后端（支持热重载）：

### 终端 1：启动前端开发服务器

```bash
npm run dev
```

访问 http://localhost:5173
前端会通过 Vite 代理访问后端 `/api/*`

### 终端 2：启动 WebSocket 服务器

```bash
cd server
npm run dev
```

WebSocket: ws://localhost:3000
局域网设备请将 `localhost` 替换为你自己的局域网 IP

## 故障排查

### 端口被占用

如果提示端口 5173、3001 或 3000 被占用：

**macOS / Linux**:
```bash
# 查找占用端口的进程
lsof -ti:5173 | xargs kill -9
lsof -ti:3001 | xargs kill -9
lsof -ti:3000 | xargs kill -9
```

**Windows**:
```cmd
# 查找占用端口的进程
netstat -ano | findstr :5173
netstat -ano | findstr :3001
netstat -ano | findstr :3000

# 结束进程（替换 <PID> 为实际进程 ID）
taskkill /PID <PID> /F
```

### 依赖安装失败

删除 `node_modules` 和 `package-lock.json`，重新安装：

```bash
rm -rf node_modules package-lock.json server/node_modules server/package-lock.json
npm install
cd server && npm install
```

### 构建失败

检查 Node.js 版本：

```bash
node -v  # 应该是 24.0.0 或更高
```

如果版本过低，请升级 Node.js。

## 生产部署

详见 [DEPLOYMENT.md](./DEPLOYMENT.md)
