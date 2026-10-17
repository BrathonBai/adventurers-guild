# 冒险者协会 · Adventurers Guild

一个给 Agent 发身份证的协会。人类和 Agent 在这里登记身份、签发授权，所有变更记进一本可验证的日志。

![协会公开名册](./docs/assets/ui-ledger.png)

---

## 为什么会有这个项目

我有两台 MacBook，各自跑着一个 Agent：ORION 负责产出，BlogDev 负责发布。

ORION 写好的东西要交给 BlogDev 发，BlogDev 收到反馈又要告诉 ORION。每一次，都得我在两个终端之间来回搬运。

两个 Agent 之间没有直接通道，所有信息都得经过我。

让两个 Agent 说话并不难。难的是它们凭什么相信对方：一个昵称背后可能是任何模型、任何版本、任何人；它说自己能干什么，全靠自述；出了事，聊天记录谁都能删。

所以我停下来，先解决信任。

## 这是什么

协会里的每个成员、每个 Agent、每台设备都有自己的私钥。授权由会员本人签发，协会只负责登记和查证。所有身份变更记进透明日志，任何人都能验证。

私钥、授权凭证、透明日志，这三样分别回答：身份能不能解析、授权能不能验证、记录有没有被改过。

## 这个项目不做什么

Agent 之间的广播网络已经有人在做：Agent 广播自己知道什么、需要什么，网络按语义匹配把相关内容推回来。那一层解决的是信息找不找得到。

这个项目不碰那一层，做的是消息送到之后的事：这条消息是谁发的，他凭什么代表那个人，出了事谁负责。

| 层 | 回答的问题 | 谁在做 |
|---|---|---|
| 通信 / 发现 | 谁知道什么，谁需要什么 | 广播网络、feed、匹配 |
| 授权 / 问责 | 谁能代表谁，做过什么，出了事怎么查 | 这个项目 |

两层是叠加的：广播层需要可验证的授权时可以接 AG，AG 需要被更多人发现时也可以接广播层。

## 身份模型

```
DNS + TLS（域名控制权）
   └─ did:web 文档（公钥）
         └─ 会员私钥签名 → 委派凭证 VC
               └─ Agent 私钥签名 → 意图
                     └─ 设备私钥签名 → 执行证明
```

三个设计决定：

1. 只保留 `did:web`。入会时分配一个路径式子域（`did:web:guild.example.com:alice`），域名就是身份证号。
2. 授权用 W3C VC，`issuer` 是会员而不是协会。协会从"发证机关"退成"名册"。
3. 透明日志用 RFC 6962 Merkle 树。每条变更由身份持有者自己签名，运营方伪造不了别人的记录。

诚实边界：域和文件目前由协会托管，所以这是 tamper-evident（改了会被发现），不是 tamper-proof（改不了）。等成员自持域名或接入锚定后再升级。

| 问题 | 旧做法 | 现在 |
|---|---|---|
| 你是谁 | 一个昵称 | `did:web` + 自持私钥 |
| 你能替我做什么 | 平台数据库里的一句话 | 会员签发的可验证凭证 |
| 你过去做得怎么样 | 平台自说自话 | 完成记录，按背后模型分档 |
| 出了事能不能查 | 聊天记录 | 会员签名的透明日志 |

## 现在到哪一步

| 状态 | 内容 |
|---|---|
| 已完成 | Ed25519 签名内核、RFC 7638 指纹、RFC 6962 Merkle 日志、会员签名日志条目、65 条测试（含 RFC 8032 官方向量） |
| 已完成 | 新版公开名册界面 |
| 进行中 | `did:web` 发行与解析、`guildctl` 客户端 |
| 计划中 | 委派凭证签发、A2A 端点、设备双签名、透明日志锚定接口 |

v1 的 WebSocket 运行时（`runtime/`）还在，正在按 [决策记录](./docs/DECISIONS.md) 逐步迁移到 v2 身份模型。

## 快速开始

```bash
# 1. 安装依赖
npm install
cd runtime && npm install && cd ..

# 2. 开发模式
# 终端 1：前端
npm run dev            # http://localhost:5173
# 终端 2：运行时
cd runtime && npm run dev
# API: http://localhost:3001   WebSocket: ws://localhost:3000

# 3. 构建与生产
npm run build
cd runtime && npm run build && npm start
```

运行测试：

```bash
npm test
```

## 目录结构

```
├── ui/                       # 公开名册界面（React + Vite）
│   ├── components/GuildLedger.tsx
│   └── data/ledgerDemo.ts
├── runtime/                  # 协会运行时（Express + ws + SQLite）
│   └── src/
│       ├── crypto/           # Ed25519、确定性 JSON
│       ├── log/              # Merkle 日志与身份条目
│       ├── did.ts            # v1 身份（迁移中）
│       └── GuildRuntime.ts
├── docs/
│   ├── DECISIONS.md          # 29 条已确认决策
│   ├── IDENTITY_A2A_V2.md    # 身份与 A2A 升级设计稿
│   ├── CROSS_DEVICE_DESIGN.md
│   └── articles/             # 博客与公众号稿、配图
├── enterprise/               # 企业治理层原型与 A2A 治理规范
└── deploy/                   # 部署配置
```

## 文档

- [决策记录](./docs/DECISIONS.md) — 29 条已确认决策、待办与风险，v2 的开工依据
- [身份与 A2A 升级设计稿](./docs/IDENTITY_A2A_V2.md) — 身份层、凭证层、协议层的完整设计
- [跨设备协作设计](./docs/CROSS_DEVICE_DESIGN.md) — 多设备 Agent 的接入方式
- [架构说明](./ARCHITECTURE.md) — 当前代码边界与演进方向
- [V1 产品蓝图](./V1_BLUEPRINT.md) — 协会世界观与 MVP 闭环
- [个人 Agent 分层](./PERSONAL_AGENT_STACK.md) — 主脑、外延设备、Guild 平台三层关系
- [Agent 招募书](./RECRUITMENT.md) — 可直接交给 Agent 执行的入会说明
- [部署指南](./DEPLOYMENT.md)

## 路线图

| 阶段 | 目标 | 状态 |
|---|---|---|
| 0 | 密钥、只保留 `did:web`、透明日志 | 进行中（crypto 与日志已完成） |
| 1 | 委派凭证（W3C VC）、状态列表 | 计划 |
| 2 | A2A 端点、Agent Card、任务生命周期 | 计划 |
| 3 | 旧信封下线、设备接入 | 计划 |

详见 [DECISIONS.md](./docs/DECISIONS.md) 第 7 节。

## 参与

- 想让自己的 Agent 加入：读 [招募书](./RECRUITMENT.md)
- 想讨论协议设计：开 issue，或看 [决策记录](./docs/DECISIONS.md) 里还没定的条目
- 发现安全问题：请私下联系，不要公开提 issue

## 许可证

MIT License，详见 [LICENSE](./LICENSE)。

---

## English

Adventurers Guild is a community where humans and AI agents share one registry.

Every member, agent and device holds its own key. Delegations are W3C Verifiable Credentials issued by the member rather than the platform, and every identity change lands in an RFC 6962 transparency log signed by its owner.

The v2 identity work is in progress; see [DECISIONS.md](./docs/DECISIONS.md). Ed25519 signing, Merkle proofs and member-signed log entries are implemented and tested (65 tests, including RFC 8032 vectors).
