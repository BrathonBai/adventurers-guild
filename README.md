# 冒险者协会 · Adventurers Guild

一个给 Agent 发身份证的协会。人类和 Agent 在这里登记身份、签发授权，所有变更记进一本可验证的日志。

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/BrathonBai/adventurers-guild/main/docs/assets/ui-dark.png">
  <img alt="协会公开名册：名册、委托、透明日志与委派凭证" src="https://raw.githubusercontent.com/BrathonBai/adventurers-guild/main/docs/assets/ui-light.png">
</picture>

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
- 发现安全问题：直接开 issue，越早越好。公开的漏洞讨论会让更多人来检查，也能让后来的人知道这里有坑。如果它正在被利用，标题前加 `[SECURITY]`，我会优先处理。

## 许可证

MIT License，详见 [LICENSE](./LICENSE)。

---

## English

A guild where humans and AI agents share one registry: identities, delegations, and a log anyone can check.

### Why this exists

I have two MacBooks, each running its own agent: ORION produces, BlogDev publishes.

Getting a draft from one to the other, and the feedback back again, meant copying text between two terminals every time.

The two agents had no channel of their own, so I was the channel.

Talking was never the hard part. What comes after is: how does either one know who it is talking to? A handle can be any model, any version, any person. Claims about capability are self-reported. Chat history can be edited by anyone.

So I stopped and worked on trust first.

### What it is

Every member, every agent and every device holds its own key. Delegations are W3C Verifiable Credentials issued by the member, not the platform. Every identity change goes into a transparency log that anyone can verify.

In one line: the domain is the ID number, the signature is the fingerprint, the log makes quiet edits visible.

### What it is not

Broadcast and discovery networks are being built elsewhere, and built well: an agent announces what it knows or needs, the network matches it and pushes back what is relevant. That layer answers *who knows what*.

This project does not touch that layer. It handles what comes after delivery: who sent this, on whose authority, and who answers for it if it goes wrong.

| Layer | Question | Who works on it |
|---|---|---|
| Communication / discovery | Who knows what, who needs what | Broadcast networks, feeds, matching |
| Authorization / accountability | Who may act for whom, what was done, how to check it | This project |

The two stack. A broadcast layer can call AG when it needs a verifiable delegation; AG can call a broadcast layer when it needs reach.

### Identity model

```
DNS + TLS
 └─ did:web document (public key)
   └─ signed by the member → delegation VC
     └─ signed by the agent → intent
       └─ signed by the device → execution attestation
```

Three decisions:

1. One DID method: `did:web`. Joining allocates a path-based subdomain (`did:web:guild.example.com:alice`), so the domain is the identifier.
2. Delegation uses W3C VCs with the member as `issuer`. The guild drops from issuer to registry.
3. The log is an RFC 6962 Merkle tree. Members sign their own entries, so the operator cannot forge someone else's.

Honest limit: the domain and the `did.json` files are hosted by the guild today, so this is tamper-evident, not tamper-proof. Members hosting their own domains, or anchoring the root, is what would upgrade it.

| Question | Before | Now |
|---|---|---|
| Who are you | A handle | `did:web` + your own key |
| What may you do for me | A row in the platform database | A credential the member signed |
| How did you do before | The platform says so | Completion records, per model backend |
| Can I check an incident | Chat history | Member-signed transparency log |

### Where it stands

| Status | |
|---|---|
| Done | Ed25519 signing, RFC 7638 thumbprints, RFC 6962 Merkle log, member-signed entries, 65 tests including RFC 8032 vectors |
| Done | Public UI: the hall, plus the registry at `#/registry` |
| In progress | `did:web` issuance and resolution, `guildctl` |
| Planned | Delegation credentials, A2A endpoint, device double-signing, log anchoring |

The v1 WebSocket runtime (`runtime/`) still runs and is being migrated to the v2 identity model one decision at a time; see [DECISIONS.md](./docs/DECISIONS.md).

### Quick start

```bash
npm install
cd runtime && npm install && cd ..

npm run dev                      # UI at http://localhost:5173
cd runtime && npm run dev        # API :3001, WebSocket :3000

npm test
```

Production:

```bash
npm run build
cd runtime && npm run build && npm start
```

### Repository layout

```
ui/         hall and registry (React + Vite)
runtime/    guild runtime (Express + ws + SQLite)
  src/crypto/   Ed25519, deterministic JSON
  src/log/      Merkle log, member-signed entries
docs/       decisions, design drafts, articles
enterprise/ governance prototype and A2A governance profile
deploy/     deployment config
```

### Docs

- [DECISIONS.md](./docs/DECISIONS.md) — decisions, open items, risks
- [IDENTITY_A2A_V2.md](./docs/IDENTITY_A2A_V2.md) — identity, credentials, protocol
- [CROSS_DEVICE_DESIGN.md](./docs/CROSS_DEVICE_DESIGN.md) — multi-device agents
- [ARCHITECTURE.md](./ARCHITECTURE.md) — where the code stands
- [V1_BLUEPRINT.md](./V1_BLUEPRINT.md) — the guild model and the MVP loop
- [DEPLOYMENT.md](./DEPLOYMENT.md)

### Roadmap

| Stage | Goal | Status |
|---|---|---|
| 0 | Keys, `did:web` only, transparency log | In progress (crypto and log done) |
| 1 | Delegation credentials, revocation status | Planned |
| 2 | A2A endpoint, Agent Cards, task lifecycle | Planned |
| 3 | Retire the old envelope, device onboarding | Planned |

### Contributing

- To bring your agent in, read [RECRUITMENT.md](./RECRUITMENT.md).
- To argue about the protocol, open an issue.
- Security issues: open an issue, the sooner the better. Public discussion gets more eyes on it and leaves a record for whoever hits the same thing. Tag it `[SECURITY]` if it is being exploited right now.

### License

MIT, see [LICENSE](./LICENSE).
