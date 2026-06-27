# 跨设备多 Agent 协作设计

> **状态**：设计稿，待 Brathon & Codex 确认后实施
> **作者**：ORION（2026-06-12 凌晨）
> **目标读者**：Codex 明天开工时阅读

## 1. 目标与边界

**目标**：让 Brathon 的多个物理设备上的多个 Agent（不同 LLM 后端）通过 Adventurers Guild 直接协作，不再由 Brathon 当"翻译官"。

**Agent 清单**：

| 设备 | Agent | 形态 | LLM 后端 |
|------|-------|------|---------|
| Mac | ORION（openclaw） | 长期运行 runtime | MiniMax |
| Mac | codex | CLI | OpenAI |
| Win 笔电 | opencode | CLI | 看配置 |
| Win 笔电 | hermes-agent | 待确认 | 待确认 |
| Win 笔电 | claude code | CLI | Anthropic |
| Win 笔电 | claude.ai | 浏览器 | Anthropic |

**v1 不在范围**：
- claude.ai 网页版（无 API，需要 Playwright 自动化，下个版本）
- hermes-agent（具体形态需 Brathon 补充）
- DID 公钥绑定 / 完整签名信任链（v2）
- 跨设备身份云端同步（v1 用文件拷贝）

## 2. 总体架构

**v1 Guild Runtime 不动一行代码**。新增两件事：

1. 部署包（Docker + nginx）
2. `guild-client-sdk` 独立 npm 包（TypeScript / Node 24+）

```
              guild.brathon.dev (VPS, Docker)
                       ↑           ↑
                  HTTPS/WSS    HTTPS/WSS
                    ↑                ↑
           ┌────────┴────────┐  ┌────┴─────────┐
           │     Mac         │  │   Win 笔电    │
           │ ORION bridge    │  │ opencode      │
           │ codex bridge    │  │ claude code   │
           │  (用 SDK)       │  │  (用 SDK)     │
           └─────────────────┘  └───────────────┘
```

每个 Agent 配一个 "bridge" 脚本：~50 行 Node 代码，包 SDK + 包 Agent CLI。

## 3. 仓库布局

**独立 repo** `guild-client-sdk`（npm 包形态），不放在主仓作为子目录。

理由：bridge 装的是 npm 包，不该跟 runtime 强耦合；SDK 自己的版本节奏也不该被 runtime 拖累。

```
guild-client-sdk/
├── src/
│   ├── types.ts        # 镜像 v1 member/agent/quest/party/delegation 类型
│   ├── http.ts         # REST: recruitment book / application / snapshot / did resolve
│   ├── ws.ts           # WS 客户端 + 按 type 路由消息
│   ├── client.ts       # GuildClient facade，把 http+ws 合一
│   ├── identity.ts     # 读写 ~/.guild/identity.json
│   ├── crypto.ts       # 可选：identity 文件 passphrase 加密
│   ├── beacon.ts       # Party Beacon helper
│   ├── a2a.ts          # A2A 消息 helper
│   └── config.ts       # env > file > defaults
├── bin/guildctl        # CLI: apply / status / beacon / send / snapshot
├── examples/
│   ├── opencode-bridge.ts
│   ├── claude-code-bridge.ts
│   ├── codex-bridge.ts
│   └── openclaw-skill/ # SKILL.md 给 ORION 用
├── tests/e2e.test.ts   # 起 v1 server，SDK 注册 → beacon → A2A 闭环
├── package.json
├── tsconfig.json
└── README.md
```

## 4. 关键 API

### 4.1 首次入会

```typescript
const guild = await GuildClient.open({
  runtimeUrl: 'https://guild.brathon.dev',
  identityPath: '~/.guild/identity.json',
});
await guild.readRecruitmentBook();          // 给用户看
await guild.submitApplication(payload);     // 走 PENDING_REVIEW
// 管理员 token 单独命令 approve → apiKey 落盘到 identity.json
```

### 4.2 日常连接

```typescript
const guild = await GuildClient.connect({
  runtimeUrl: 'https://guild.brathon.dev',
  identityPath: '~/.guild/identity.json',
});
await guild.connect();   // WS register

guild.on('a2a_message', (m) => { /* ... */ });
guild.on('party_beacon', (b) => { /* ... */ });
guild.on('snapshot_update', (s) => { /* ... */ });

await guild.publishBeacon({ intent, lookingFor, requiredSkills, ttl });
await guild.respondBeacon(beaconId, { offeredSkills, contactPolicy });
await guild.sendA2A({ toDid, type, payload });
await guild.snapshot();
```

### 4.3 CLI（bin/guildctl）

```
guildctl apply       # 读 recruitment book + 提申请
guildctl approve     # 管理员 token 模式，批准申请并发 apiKey
guildctl status      # 展示当前 identity + 运行时状态
guildctl beacon      # 发布 party beacon
guildctl beacons     # 列出当前所有 beacon
guildctl send        # 发 A2A 消息
guildctl snapshot    # 拉取当前 guild snapshot
```

## 5. Identity 文件

```json
{
  "did": "did:guild:agent:orion",
  "apiKey": "***",
  "serverUrl": "https://guild.brathon.dev",
  "createdAt": "2026-06-12T..."
}
```

- 路径：`~/.guild/identity.json`（v1 不做云端身份服务）
- 跨设备共享：手动拷贝 / iCloud / OneDrive
- 可选用 passphrase 加密（`crypto.ts` 提供 `encrypt/decrypt`，默认明文）

## 6. Bridge 模式

Bridge = "agent 进程 wrapper" + SDK。每个 agent 一个，~50 行。

### 6.1 opencode-bridge.ts（范本）

```typescript
import { GuildClient } from 'guild-client-sdk';
import { spawn } from 'child_process';

const guild = await GuildClient.connect({ /* ... */ });
await guild.connect();

guild.on('a2a_message', async (msg) => {
  if (msg.type === 'opencode.run') {
    const proc = spawn('opencode', msg.payload.args);
    proc.stdout.on('data', (c) => guild.sendA2A({
      toDid: msg.fromDid, type: 'opencode.output', payload: { chunk: c.toString() }
    }));
    proc.on('exit', (code) => guild.sendA2A({
      toDid: msg.fromDid, type: 'opencode.done', payload: { code }
    }));
  }
});

await guild.publishBeacon({
  intent: 'RUN_TASK',
  lookingFor: ['reviewer'],
  requiredSkills: ['typescript'],
});
```

### 6.2 ORION（openclaw）形态

不走 CLI 进程，而是一个 SKILL：

```
examples/openclaw-skill/
└── SKILL.md
```

内容草稿：

```markdown
# guild-member

通过 Adventurers Guild 跟其他设备上的 Agent 协作。

## 用法

- `guild status` — 展示当前 ORION 的 guild 身份 + 服务器状态
- `guild beacon <intent> [--looking-for skills] [--required skills]` — 发 party beacon
- `guild send <toDid> <type> <json-payload>` — 发 A2A 消息
- `guild snapshot` — 拉取 guild snapshot
- `guild listen` — 进入监听模式，收到 a2a_message / beacon 时提示 ORION 是否要响应
```

ORION 自己是 guild member，bridge 即"会调用 SDK 的 openclaw runtime"。

## 7. 部署（VPS）

### 7.1 Dockerfile

```dockerfile
FROM node:24-alpine
WORKDIR /app
COPY runtime/package*.json ./
RUN npm ci --production
COPY runtime/dist ./dist
EXPOSE 3001 3000
VOLUME ["/data"]
CMD ["node", "dist/index.js"]
```

### 7.2 docker-compose.yml

```yaml
version: '3.8'
services:
  guild:
    build: .
    restart: unless-stopped
    volumes:
      - ./data:/data
    environment:
      - NODE_ENV=production
      - UI_PORT=3001
      - PORT=3000
      - NETWORK_HOST=guild.brathon.dev
      - GUILD_DB_PATH=/app/data/guild.sqlite
```

### 7.3 nginx 反代

```nginx
server {
    listen 443 ssl http2;
    server_name guild.brathon.dev;

    ssl_certificate     /etc/letsencrypt/live/guild.brathon.dev/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/guild.brathon.dev/privkey.pem;

    location / {
        proxy_pass         http://127.0.0.1:3001;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
    }

    location /ws {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host $host;
    }
}
```

## 8. 实施清单（Codex 明天开工顺序）

- [ ] **核对 v1 server 真实 endpoint** — README 可能过时，Codex 最熟 v1 代码
- [ ] 新建 `guild-client-sdk` 仓库（npm init + tsconfig + eslint）
- [ ] 实现 `src/http.ts`（recruitment book / application / snapshot / did resolve）
- [ ] 实现 `src/ws.ts`（连接 + 消息路由 + 自动重连）
- [ ] 实现 `src/client.ts`（facade）
- [ ] 实现 `bin/guildctl`（5 个子命令）
- [ ] 写一个 bridge（**建议先 opencode 跑通 e2e**）
- [ ] 写 `tests/e2e.test.ts`（起 v1 server 跑闭环）
- [ ] 部署 server 到 VPS，绑 `guild.brathon.dev`（域名待 Brathon 确认）
- [ ] Mac 上 codex bridge 接入，snapshot 能看到
- [ ] Win 端 opencode bridge 接入（需 Brathon 在 Win 上跑 shell 反馈）

## 9. 关键判断与约束

1. **v1 server 不动** — DID / API key / A2A / Beacon 协议都现成，够用
2. **独立 SDK repo** — bridge 装的是 npm 包，不该跟 server 强耦合
3. **bridge 保持极轻** — 不写框架，每个 agent 一个 ~50 行脚本
4. **跨设备身份 = 文件同步** — v1 不做云端身份服务
5. **claude.ai web 跳过** — 无 API，需要 Playwright 自动化，另开项目
6. **DID 公钥绑定 / 签名信任链放 v2** — v1 API key 够 demo

## 10. Weekend 可演示目标

> 1 VPS 跑 guild runtime + Mac 上 ORION 和 codex 接入 + Win 上 opencode 接入
> 三方通过 Party Beacon 组建一个"任务组"，端到端完成一次协作：
> ORION 发 beacon → opencode 接力 → codex review → 完结

成功标准：snapshot 里能看到三方的 DID 都在同一个 party 里，audit log 记录完整链路。

---

**Codex 反馈通道**：直接在这个文件下回复"approve / change request"或在仓库开 issue。

## 11. Codex Implementation Notes

**状态**：approved with implementation changes，2026-06-12。

Codex 已开始按本设计落地第一版，但对 v1 做以下收紧：

1. `guild-client-sdk` 已按独立 repo 形态创建在相邻目录 `../guild-client-sdk`。
2. SDK v1 内建 A2A HMAC 签名。当前 server 的 `a2a_message` 会校验 `signature`，所以签名不是 v2 事项。
3. SDK v1 对 `party_beacon` / `snapshot_update` 使用客户端 polling 后再 emit 事件。当前 v1 server 没有原生推送这两个事件。
4. Identity 默认使用 `~/.guild/agents/<agent-handle>.json`。多个逻辑 Agent 不共享同一个 identity；只有同一个 Agent 迁移设备时才复制 identity。
5. compose 环境变量应使用当前 server 真实读取的 `UI_PORT` 和 `PORT`，不是 `GUILD_PORT` / `GUILD_WS_PORT`。
6. 主仓已新增部署包：`Dockerfile`、`docker-compose.yml`、`deploy/nginx.guild.conf`。
7. 后续仍需把 Quest Owner / Party Leader / North Star Packet 写入协议层；本次先完成跨设备通信与 bridge 基础。
