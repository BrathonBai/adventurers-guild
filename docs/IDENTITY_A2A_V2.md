# 身份层与 A2A 协议升级（v2）

> **状态**：v1.2（2026-10-17）— **部分内容已被 `docs/DECISIONS.md` 取代，待重写为 v2.1**
> **范围**：`adventurers-guild-server` / `guild-client-sdk` / `codex-ADV-client`
> **前置**：`docs/CROSS_DEVICE_DESIGN.md` 中列为 v2 的「DID 公钥绑定 / 完整签名信任链」
> **不在范围**：跨协会联邦的具体实现、支付托管、JSON-LD 全量处理

> [!WARNING]
> **2026-10-17 决策变更**：身份模型改动较大，本文以下内容已过时，请以 [`DECISIONS.md`](./DECISIONS.md) 为准：
>
> - 取消 `did:guild`，**只保留 `did:web`**，且由协会自动分配子域（D-07/D-08）
> - 设备不再挂在 agent 之下，而是**独立 DID**（D-09）
> - 成员档位从三档改为**两档（成员/访客）**，取消 EXTERNAL（D-17）
> - `guild-verify.json` 废弃（D-18）
> - jurisdiction **简化为两档**（D-20）
> - 设备**不做跨 agent 共享与租约**（D-26）
> - 密码套件改为 **`eddsa-rdfc-2022`**（D-15），状态列表**阶段 1 就做**（D-16）
> - 执行证明**只签 `seq`**，不签绝对时间（D-13）
> - 新增：**透明日志 + 会员签名 + Merkle 锚定接口**（D-21 ~ D-24）

---

## 0. 决策记录与摘要

### 0.1 已定决策

| # | 决策项 | 结论 | 影响面 |
|---|---|---|---|
| 1 | DID 方法 | **`did:guild` 为默认，同时支持 `did:web`** | 需要多方法解析器、缓存、SSRF 防护 |
| 2 | 授权凭证 | **W3C Verifiable Credentials（Data Integrity）** | 替换 JWT 方案；不需要 JWT 库，需要 JCS |
| 3 | apiKey 定位 | **降级为传输凭证**，不再承载授权 | 三处调用点语义收窄 |
| 4 | Party Beacon | **保持 guild 扩展**，不塞进 A2A | 无代码影响，只是边界声明 |
| 5 | 固件接入时机 | **阶段 3 之后**（本轮不动） | 但本轮的凭证设计必须为它留出引用式携带能力 |
| 6 | 设备定位 | **执行端点**：独立 DID 与 device-key，仅 `EXECUTE_TASK` / `REPORT_RESULT` 两个 scope | 新增 `devices` 表与设备信誉（只记可靠性） |
| 7 | 签名分工 | **双签名**：agent 签意图，设备签执行证明 | 对应 `INTENT_TO_ACT` / `ACTION_EXECUTED` |
| 8 | 模型后端 | 模型厂商**不进信任图**；后端在 Agent Card 声明、在任务记录里冻结 | 新增 `modelBackend` / `modelFingerprint` / `jurisdiction` |

### 0.2 一页摘要

现在这套身份和协议有个结构性缺陷，一句话讲完：

> **协会（server）持有所有密钥，所以它能冒充任何一个 agent；而 A2A 签名只证明「你知道协会发给你的密码」，不证明「你是谁」。**

具体表现是 `verifyDidSignature(agent.apiKey, ...)`：用协会签发的共享密钥做 HMAC，而这个密钥同时也是 HTTP 凭证、WS 登录凭证。签名在这里是冗余的——因为上一步已经强制 `fromDid == 连接自己的 DID`，能通过签名的前提是能连上，能连上的前提是持有 apiKey。**等于用密码证明了密码。**

升级要做的三件事，顺序不能颠倒：

| 阶段 | 做什么 | 一句话理由 |
|---|---|---|
| 一 | 真密钥：Ed25519，私钥归 agent | 没有非对称密钥，一切"可验证"都是假的 |
| 二 | 真凭证：会员签发的 VC | 授权要从"协会的数据库"变成"持有者出示的凭证" |
| 三 | 真协议：A2A v1.0 子集 + Agent Card | 外部 agent 才接得进来 |

**升级后的权力结构**（这是整份文档的主线）：

```
现在：  协会 = 身份颁发者 + 授权者 + 传输认证者 + 消息验证者   ← 全能
之后：  协会 = 注册表 + 传输认证者 + 验证者                   ← 不再是权威
        会员 = 授权者（签发 VC）
        agent = 身份持有者（私钥在手上）
```

**信任图只有三层**（模型厂商不在其中）：

```
会员（持 member-key，签 VC）
  └─ agent（跑在算力盒/电脑上的 harness，持 agent-key，签意图）
        └─ 设备（持 device-key，签执行证明）
```

模型是电力，不是公民：它不持有 guild 密钥、不进 DID 图、不承担声誉。一个 agent 的脑可以在本地算力盒，也可以经 API 调 DeepSeek / MiniMax / GLM / GPT——**换脑不换身份，但换脑要留痕**（见 §5.2.2）。

**不动的部分**：Party Beacon、Quest/Party/Task 领域模型、WebSocket 通道、SQLite 存储。这几样是资产，不推倒。

---

## 1. 现状诊断

| # | 问题 | 代码坐标 | 后果 | 级别 |
|---|---|---|---|---|
| 1 | A2A 签名拿 `apiKey` 当 HMAC 密钥 | `runtime/src/GuildRuntime.ts:1239`、`runtime/src/auth.ts` `verifyDidSignature` | 协会可伪造任何 agent 的消息；无不可否认性 | P0 |
| 2 | `fromDid` 已强制等于连接 DID | `GuildRuntime.ts:1235` | 签名在语义上无增量，实际安全强度 = apiKey 强度 | P0 |
| 3 | 同一 secret 三用：HTTP `x-api-key`、WS 认证、A2A HMAC | `auth.ts` / WS 握手 / `guild-client-sdk/src/a2a.ts` | 泄露半径 = 全部；轮换会同时打断三条链路 | P0 |
| 4 | DID Document 公开占位公钥 | `GuildState.ts:953`、`959` | 任何按 DID 文档验签的第三方都会接受一个假密钥 | P0 |
| 5 | `AUTH_SECRET` 缺省 `dev-only-change-me` | `auth.ts:28` | 未配置环境时 session token 可伪造 | P1 |
| 6 | `createdAt` 由客户端提供 | `GuildRuntime.ts:1288` | 重放攻击、时间欺骗 | P1 |
| 7 | 委派只在服务端校验，对端无法离线验证 | `GuildState.ts:930` 附近 | 无法跨协会，无法 P2P 验证 | P1 |
| 8 | 审计日志无哈希链 | `GuildDatabase.ts` `audit_logs` | 不可防篡改，不能作为外部证据 | P2 |
| 9 | 无 Agent Card、无任务生命周期 | 全局 | 外部 A2A agent 接不进来 | P1 |
| 10 | `GuildTask.status` 无失败态 | `runtime/src/types.ts` | A2A 要求 `FAILED/REJECTED/CANCELED`，映射会有损 | P2 |
| 11 | 身份空间只有协会自己 | `did.ts` 只产出 `did:guild:` | 外部 agent 没有合法身份入口，联邦无从谈起 | P1 |

第 9 条企业文档 `enterprise/A2A_GOVERNANCE_PROFILE.md` 已经写清楚了目标（Agent Card Requirements、任务生命周期、治理扩展），但代码里没有任何落点。这份文档就是把那份 profile 变成可执行的东西。

第 11 条是决策 1 要解决的：**只有自家 DID 方法，等于只承认自家公民。**

---

## 2. 威胁模型

先把"防谁"写清楚，否则后面每个决策都会摇摆。

| 攻击者 | 能力 | 现在能否得手 | 升级后 |
|---|---|---|---|
| 协会运营方 | 读数据库、读内存、改日志 | **能**（持有全部 apiKey） | 不能伪造签名；只能拒绝服务 |
| 拿到数据库的入侵者 | 拿到 `secret_hash` | 不能直接用（哈希） | 更不能 |
| 同网段中间人 | 劫持 WS | 能（无签名保护，改 payload 即可） | 不能（签名覆盖 body） |
| 恶意 agent | 有合法身份 | 能冒充自己，不能冒充别人 | 仍只能冒充自己（这是正常语义） |
| 重放者 | 抓到一条合法消息 | 能（`createdAt` 可伪造、无 nonce） | 不能（时间窗 + 序号 + seen-set） |
| 设备窃贼 | 拿到设备文件 | 能（identity.json 明文 apiKey） | 需要 passphrase 或安全区 |
| **恶意域名持有者**（新增） | 控制一个 `did:web` 域名 | 不存在（现在没有外部 DID） | 能伪造自己的身份，**不能伪造别人的**；受成员等级限制 |
| **SSRF 攻击者**（新增） | 让协会去解析恶意 `did:web` | — | 被解析器的白名单/私网拦截挡住 |

**结论**：现在的安全边界是"协会内部的信任边界"，升级后才是"协会之间、域名之间的信任边界"。前者叫账号系统，后者才叫协议。

`did:web` 引入两类新攻击面，必须在解析器里解决（见 §3.3）：

1. **SSRF**：`did:web:169.254.169.254` 或 `did:web:localhost` 可以让服务器去访问内网元数据端点。必须解析到公网 IP 才允许请求。
2. **缓存投毒 / 慢速攻击**：外部域名可能返回巨大文档或极慢响应。必须限 3 秒超时、64 KB 上限、失败即失败（fail closed，不回退到过期缓存）。

---

## 3. 身份层设计

### 3.1 密钥选型：Ed25519

选它的理由，都不是"更安全"这种空话：

1. **三端都能做**：Node 内置 `crypto` 直接支持（`generateKeyPairSync('ed25519')`）；ESP-IDF 的 mbedTLS 支持 Ed25519；浏览器 WebCrypto 也支持。
2. **签名固定 64 字节，公钥 32 字节**——LoRa 那种两三百字节的帧也能塞下，这对 Cardputer 客户端是决定性的。
3. **JWK 原生表达**：`{ kty: 'OKP', crv: 'Ed25519', x: '<base64url>' }`，直接进 DID Document，不用自定义编码。
4. **与 `eddsa-jcs-2022` 密码套件天然匹配**（见 §4.3）——VC 的证明套件和 Agent Card 的签名用同一套算法，只实现一次。

不选 secp256k1（生态偏链上）、不选 RSA（体积和算力都不合适嵌入式）、不选 P-256（可用但不是首选，且与 VC 生态的 `eddsa-jcs-2022` 不匹配）。

### 3.2 密钥层级

```
member-key (会员主密钥，签发 VC)
  └─ 签发 → agent-key (agent 身份密钥，签 A2A 消息与 Agent Card)
                └─ 签发 → device-key (设备密钥，多设备/固件场景)
```

- **member-key**：会员持有，**唯一**能签发委派 VC 的密钥。
- **agent-key**：agent 身份的代表密钥，用于 A2A 消息签名、连接挑战应答、Agent Card 签名。
- **device-key**：同一 agent 跑在多台设备上时（Mac + Win 笔电 + Cardputer），每台设备一把，由 agent-key 签发 `GuildDeviceBindingCredential`。

为什么要有 device-key：`CROSS_DEVICE_DESIGN.md` 里现在的做法是"identity 文件手动拷贝"。那把私钥一旦复制到三台机器，就等于三台机器共享一个不可撤销的身份——任何一台被攻破，整个身份沦陷且无法定位。device-key 让"哪台设备发的消息"可验证、可单独撤销。

### 3.3 DID 方法与解析

两种方法并存，各有明确分工：

| 方法 | 例子 | 谁托管 | 解析方式 | 适用 |
|---|---|---|---|---|
| `did:guild` | `did:guild:agent:orion` | 协会 | `GET /api/did/{did}`（内部直查） | 协会内注册的 agent、无自有域名的会员 |
| `did:web` | `did:web:brathon.dev`、`did:web:guild.brathon.dev:agents:orion` | **自己** | HTTPS 拉取 `did.json` | 自托管身份、外部 agent、未来跨协会 |

#### 3.3.1 `did:web` 的 URL 映射规则（实现要点）

```
did:web:example.com                    → https://example.com/.well-known/did.json
did:web:example.com:agents:orion       → https://example.com/agents/orion/did.json
did:web:example.com%3A8443             → https://example.com:8443/.well-known/did.json
```

规则：`:` 分段，第一段是 host（可含 `%3A` 编码的端口），其余段是路径，最后总是 `did.json`；无路径时必须是 `/.well-known/did.json`。强制 HTTPS。

#### 3.3.2 解析器（`runtime/src/did/resolver.ts`）

```ts
interface DidResolver {
  method: 'guild' | 'web';
  resolve(did: string): Promise<DidDocument | undefined>;
}
```

`WebDidResolver` 的硬约束：

| 约束 | 值 | 理由 |
|---|---|---|
| 超时 | 3s | 不能让一个坏域名拖住入会流程 |
| 响应上限 | 64 KB | 防内存放大 |
| 协议 | 仅 https | 明文不可接受 |
| 目标 IP | 必须公网；拒绝 127/8、10/8、172.16/12、192.168/16、169.254/16、::1 | 防 SSRF |
| 重定向 | 最多 3 跳，每跳重新校验 IP | 防重定向绕过 |
| 缓存 | 遵循 `Cache-Control`，上限 10 分钟；无头则 60s | 防慢速攻击 |
| 失败行为 | **fail closed**，不回退到过期缓存 | 撤销要及时生效 |

`GuildDidResolver` 直接读 `identity_keys` 与快照，不走网络。

解析结果统一缓存到新表 `did_documents`（见 §6.1），带 `fetched_at`。

#### 3.3.3 跨方法关系（重要）

- `did:guild:agent:orion` 的 `controller` **可以是** `did:web:brathon.dev`。
- 反过来也允许：`did:web:agents.orion.dev` 的 controller 是 `did:guild:member:brathon`（但这时协会只在**入会审核**时校验一次 controller 声明，之后不再负责）。
- 校验规则：**agent 的 controller 必须在 agent 的入会申请里完成过一次签名挑战**（证明 controller 真的同意）。否则任何人都能把自己的 agent 挂到别人名下。

这条是 `did:web` 带来的最大复杂度：跨方法控制关系需要一个**双向证明**（controller 签一次，agent 签一次），不能只靠单边声明。

### 3.4 DID Document 形态

`did:guild` 版本（替换 `GuildState.ts:939` 的 `resolveDidDocument`，去掉 placeholder）：

```json
{
  "@context": ["https://www.w3.org/ns/did/v1"],
  "id": "did:guild:agent:orion",
  "alsoKnownAs": ["guild://agent/orion"],
  "controller": "did:web:brathon.dev",
  "verificationMethod": [
    {
      "id": "did:guild:agent:orion#key-1",
      "type": "JsonWebKey2020",
      "controller": "did:guild:agent:orion",
      "publicKeyJwk": { "kty": "OKP", "crv": "Ed25519", "x": "11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo" }
    }
  ],
  "authentication": ["did:guild:agent:orion#key-1"],
  "assertionMethod": ["did:guild:agent:orion#key-1"],
  "service": [
    { "id": "did:guild:agent:orion#profile",      "type": "GuildProfile",     "serviceEndpoint": "https://guild.brathon.dev/api/did/did%3Aguild%3Aagent%3Aorion" },
    { "id": "did:guild:agent:orion#agent-card",   "type": "A2AAgentCard",     "serviceEndpoint": "https://guild.brathon.dev/api/agents/did%3Aguild%3Aagent%3Aorion/agent-card" },
    { "id": "did:guild:agent:orion#a2a",          "type": "A2A",              "serviceEndpoint": "https://guild.brathon.dev/a2a" },
    { "id": "did:guild:agent:orion#party-beacon", "type": "GuildPartyBeacon", "serviceEndpoint": "https://guild.brathon.dev/api/party-beacons" }
  ]
}
```

`did:web` 版本由会员自己托管，协会不生成。协会只要求它至少包含：一个 `assertionMethod` 的 Ed25519 公钥、以及（可选）指向协会的 `service` 条目。协会在**入会时**校验它，之后按缓存 TTL 重新校验。

关键点：

- `#key-1` 的 `id` 规则固定为 `{did}#key-{n}`，`n` 单调递增，永不复用。
- `authentication` 用于连接挑战；`assertionMethod` 用于消息/卡片/VC 签名。
- **`type` 用 `A2A` 而不是 `GuildA2A`**：服务端点类型应对齐 A2A 生态，guild 私有语义放 `GuildPartyBeacon`。
- `did:guild` 仍需补一份方法规范 `docs/DID_GUILD_METHOD.md`（创建/解析/更新/撤销），否则第三方无法实现解析器。

### 3.5 入会仪式（enrollment ceremony）

现在的流程是：申请 → 管理员批准 → 发 apiKey。问题在于公钥根本不存在。改成：

```
1. 客户端本地生成 member-key + agent-key（私钥不出设备）
2. （可选）会员在自己的域名下发布 did:web 的 did.json
3. POST /api/agent/applications
   {
     agent: {...},
     controller: "did:web:brathon.dev",        // 或 did:guild:member:brathon
     publicKeys: [{ kid, jwk, proof }],
     controllerProof: "<controller 对 agent 公钥的签名>"   // 跨方法时必须
   }
   proof = Ed25519(sign, "guild-enrollment:" + nonce + ":" + did)
4. 管理员批准
5. server 校验：
   - agent proof（证明持有私钥）
   - controllerProof（证明 controller 同意）
   - controller DID 可解析（did:web 则拉取 did.json）
6. 写 identity_keys 表；返回
   { did, keyId, transportToken, agentCardUrl }
   —— 注意：不再是 apiKey，而是 transportToken
7. 会员用 member-key 签发第一张委派 VC
```

**"proof" 这一步是整个升级的核心动作**：它在入会那一刻就把"身份"和"私钥持有"绑定死了。没有它，登记一个公钥等于登记一个陌生人的地址。

### 3.6 连接认证：挑战-应答

WS 握手增加一种认证方式，与现有 apiKey 并存（灰度期）：

```
client → { type: 'auth/challenge', did }
server → { type: 'auth/challenge', nonce, expiresAt }
client → { type: 'auth/response', did, kid, signature: Ed25519(nonce + ":" + did) }
server → { type: 'auth/ok', principal }
```

- `nonce` 一次性，120 秒过期，服务端内存保留窗口内已用 nonce。
- 成功后连接持有 `principal = { did, kid, scopes }`，后续 A2A 消息的签名仍需**独立**校验（连接认证 ≠ 消息认证）。
- `transportToken` 通道保留，标记 `legacy`，阶段 3 移除。

### 3.7 设备绑定（为固件预留）

`GuildDeviceBindingCredential`（一种 VC，见 §4.2）：

```json
{
  "issuer": "did:guild:agent:orion",
  "credentialSubject": {
    "id": "did:guild:agent:orion#device-cardputer-01",
    "deviceKeyJwk": { "kty": "OKP", "crv": "Ed25519", "x": "..." },
    "platform": "esp32s3",
    "trustTier": "SOFTWARE",
    "capabilities": ["lora-relay", "task-execute"]
  }
}
```

`trustTier` 是给未来跨组织信任用的：有 TPM/安全区的设备是 `HARDWARE`，ESP32 目前只能算 `SOFTWARE`（无 TPM，密钥在 NVS + flash encryption 里）。**诚实标注比虚报等级重要**——跨协会场景下，对方会根据这个等级决定给多大的任务。

### 3.8 轮换与撤销

- **轮换**：新密钥 `#key-2` 先加入 DID Document（由 `#key-1` 签名更新），双密钥并行 7 天，然后移除 `#key-1`。
- **撤销（did:guild）**：`identity_keys.revoked_at` + 增量撤销列表 `GET /api/revocations?since=<version>`，返回 `{ version, entries: [{ kid, revokedAt, reason }] }`，按版本单调递增，对端可缓存。
- **撤销（did:web）**：协会**无权**撤销。只能：① 拒绝该 DID 后续登入；② 吊销协会发给它的 VC（它在协会的成员资格）。这个不对称必须写进文档和 UI，否则运维会误以为按了删除就真的删了。
- **级联**：会员被暂停 → 由其签发的所有委派 VC 进入撤销列表。

### 3.9 成员等级（`did:web` 的直接后果）

引入一个新字段 `membershipTier`：

| 等级 | 条件 | 能做什么 | 限制 |
|---|---|---|---|
| `GUILD_MEMBER` | `did:guild`，走过管理员审核 | 发任务、组队、被委派、积累信誉 | 无 |
| `EXTERNAL` | `did:web`，仅公钥验证通过 | 响应 beacon、被邀请进队伍、执行任务 | 不能发任务；信誉独立计算；委派需队长确认 |
| `VERIFIED_EXTERNAL` | `did:web` + 域名归属验证（DNS TXT 或 `/.well-known/guild-verify.json`） | 同 `EXTERNAL`，但可发任务 | 需定期复查 |

没有这一层，`did:web` 会让"任何人都能自称是 agent"变成"任何人都能自称是协会成员"。有了这一层，外部身份是**可接入但不平权**的。

### 3.10 设备：执行端点，不是次等成员

设备（Cardputer、传感器节点、机械臂）在 guild 里需要单独定义，因为它既不是人，也不是有脑的 agent。

**结论：设备是独立身份的执行端点。**

| 维度 | 设备 |
|---|---|
| DID | `did:guild:device:<slug>`，与 member / agent 并列的第三种 |
| 密钥 | `device-key`，由 agent-key 签发 `GuildDeviceBindingCredential` |
| 允许的 scope | `EXECUTE_TASK`、`REPORT_RESULT` —— **仅此两个** |
| 禁止的 scope | `PUBLISH_QUEST`、`COORDINATE_PARTY`、`ACCEPT_QUEST`、`NEGOTIATE` |
| 信誉含义 | **可靠性**（在线率、执行成功率、时延），不是任务质量 |
| 问责 | 结果问责归 agent；设备只对"如实执行并如实回报"负责 |

为什么给设备独立身份，而不是把它当成 agent 的一个属性：

1. **可共享**：一台设备可以分时服务多个 agent，归属写在凭证里而不是写在配置里。
2. **可撤销**：设备丢了，撤 `device-key` 即可，agent 的身份与信誉不受影响。
3. **可跨组织**：未来租用别人场站里的设备时，它必须是独立主体，否则无法单独授权、单独结算。
4. **可审计**：执行证明必须由"确实在场的那台硬件"签发，不能由远端的 agent 代签。

**设备的独特价值是现场性，不是智能。** 脑可以复制，身体不能——"这个读数来自这个物理位置、这个时刻、由这台硬件签名"，是跨域协作里唯一不可伪造的东西。

**API key 卫生**：既然脑在别处，设备上**一个模型 API key 都不该有**。它只有自己的 device-key，只能签执行证明，做不了别的。这把密钥泄露的爆炸半径压到一个受限的身体上。

**离线降级**：设备必须能在没有脑的情况下安全运行——预置技能 + deadman 超时，而不是"等指令等到电池耗尽"。

`runtime/src/did.ts` 需要扩展：`GuildDidKind` 从 `'member' | 'agent'` 变成 `'member' | 'agent' | 'device'`。

---

## 4. 授权层：W3C Verifiable Credentials

### 4.1 为什么是 VC（而不是自签 JWT）

三条理由，一条比一条重要：

1. **issuer 必须是会员，不是协会。** VC 的 `issuer` 字段天然表达"谁做的这个声称"。用 JWT 也能做到，但 VC 把这层语义标准化了。
2. **可以离线、跨系统验证。** 一个外部验证者拿到 VC + 解析 issuer 的 DID，就能判断真伪，不需要访问协会。
3. **它让"跨协会"成为纯验证问题。** 大洋洲的协会要判断"这个 agent 真的被亚洲那个会员授权了吗"，只需要三样：VC、issuer 的 `did:web` 文档、状态列表。没有共享数据库，没有双边协议。

这三条正好对应决策 1 与决策 2 的耦合关系：**`did:web` 提供 issuer 的自托管身份，VC 提供可验证的授权**。两者缺一，联邦都不成立。

### 4.2 凭证类型

| 类型 | issuer | subject | 用途 |
|---|---|---|---|
| `GuildDelegationCredential` | 会员（`did:web` 或 `did:guild:member:*`） | agent DID | 授权 agent 代表会员行动 |
| `GuildDeviceBindingCredential` | agent DID | device key | 授权某台设备代表 agent |
| `GuildMembershipCredential` | 协会 | 会员/agent DID | 声明"此身份在本协会注册"，含 `membershipTier` |

`GuildDelegationCredential` 结构：

```json
{
  "@context": ["https://www.w3.org/ns/credentials/v2"],
  "id": "urn:uuid:7f3c2e9a-...",
  "type": ["VerifiableCredential", "GuildDelegationCredential"],
  "issuer": "did:web:brathon.dev",
  "validFrom": "2026-06-27T00:00:00Z",
  "validUntil": "2026-06-28T00:00:00Z",
  "credentialSubject": {
    "id": "did:guild:agent:orion",
    "scopes": ["PUBLISH_QUEST", "COORDINATE_PARTY", "ACCEPT_QUEST"],
    "constraints": { "questId": "quest-42", "partyId": "party-7", "maxUses": 10 },
    "approvalMode": "AUTO"
  },
  "credentialStatus": {
    "id": "https://guild.brathon.dev/api/status/1#94567",
    "type": "BitstringStatusListEntry",
    "statusPurpose": "revocation",
    "statusListIndex": "94567",
    "statusListCredential": "https://guild.brathon.dev/api/status/1"
  },
  "proof": {
    "type": "DataIntegrityProof",
    "cryptosuite": "eddsa-jcs-2022",
    "created": "2026-06-27T00:00:00Z",
    "verificationMethod": "did:web:brathon.dev#key-1",
    "proofPurpose": "assertionMethod",
    "proofValue": "z4oQy..."
  }
}
```

比现状强的地方：

- `constraints` 支持**按 quest/party 收窄**。现在 `scopes` 是全局的——一个 agent 拿到 `PUBLISH_QUEST` 就能发任何 quest，多个会员共用一个 agent 时是灾难。
- `maxUses` 让"一次性授权"成为可能。
- `validUntil` 让授权可失效，不需要协会在线配合。
- `credentialStatus` 让撤销可被**离线**检查（拉一次状态列表，验签后即可批量判断）。

### 4.3 证明套件：`eddsa-jcs-2022`（这是本方案的省力点）

W3C VC 2.0 支持多种密码套件。选 `eddsa-jcs-2022`（Data Integrity，JCS 规范化 + Ed25519）而不是 `eddsa-rdfc-2022`（RDF 规范化）的理由非常实际：

> **`eddsa-jcs-2022` 不需要 RDF / JSON-LD 处理器。**

`eddsa-rdfc-2022` 要求把 JSON-LD 展开成 RDF 三元组再做 URDNA2015 规范化——这意味着要引入一个完整的 JSON-LD 上下文解析器，几百 KB 依赖，还要处理远程 context 拉取。对一个 Node 服务 + 一个 ESP32 客户端，这是不可接受的。

`eddsa-jcs-2022` 的流程只有四步：

```
1. 去掉 proof 字段，对剩余文档做 JCS 规范化（RFC 8785）
2. 对 proof options（去掉 proofValue）做 JCS 规范化
3. hash1 = SHA-256(proofOptions), hash2 = SHA-256(document)
4. signature = Ed25519(hash1 || hash2)，proofValue = multibase(base58btc, signature)
```

**而且它和 Agent Card 签名用的是同一套 JCS**——一份规范化实现，两处复用（见 §5.2）。

⚠️ 注意：仓库里的 `stableStringify`（`runtime/src/cryptoUtils.ts`）排序了 key，行为上接近 JCS，但**没有金向量验证**，且在两处与 JCS 不一致：`NaN`/`Infinity` 会被序列化成 `null`，数组里的 `undefined` 会产出非法 JSON（`[1,,2]`）。旧信封继续用它没问题（收发两端同一函数，自洽即可）；但 **VC 证明与 Agent Card 签名必须换成经过 RFC 8785 测试向量验证的实现**。

**互通性提醒**：内部验证用 JCS 就够；但如果将来要让外部 VC 生态（非 guild 的验证器）验，它们会做 JSON-LD 展开，所以 `@context` 必须可解析、字段语义必须与 context 一致。这条现在不做，但要留好——别在 `credentialSubject` 里塞自定义字段还指望外部验证器能理解。

### 4.4 状态与撤销（分两步走）

| 阶段 | 机制 | 能力 |
|---|---|---|
| 阶段 1（先上） | `validUntil` 短 TTL（默认 24h）+ 服务端查撤销表 | 服务端能拒；离线验证**不能**判断撤销 |
| 阶段 2（补齐） | `BitstringStatusListEntry` + 状态列表 VC | 离线验证者拉一次列表即可判断撤销 |

状态列表实现要点：一个协会级 bitstring（最小 131072 位 = 16 KB），每张 VC 分配一个 `statusListIndex`，列表本身是一个签名的 VC，缓存 5 分钟。成本很低，但让"离线验证"真正完整。

### 4.5 校验流程

**服务端**（准入时）：

```
1. 解析 VC，取 proof.verificationMethod → 去掉 #key-n 得 issuer DID
2. 解析 issuer DID（did:web → 拉 did.json；did:guild → 查表）
3. 按 eddsa-jcs-2022 验签
4. 检查 validFrom / validUntil
5. 检查 credentialSubject.id === 当前操作的 agent DID
6. 检查 scopes 覆盖本次动作
7. 检查 constraints 覆盖本次 quest/party，maxUses 未耗尽（事务内自增）
8. 检查 credentialStatus（阶段 2 后走状态列表，阶段 1 走撤销表）
9. 检查 issuer 的 membership 状态与 membershipTier
失败 → DELEGATION_REQUIRED / DELEGATION_EXPIRED / DELEGATION_CONSTRAINT / DELEGATION_REVOKED
```

**对端**（收到 A2A 消息时，可选但推荐）：

```
消息 metadata 带 grantRef（VC 的 id）或内联 credential
1. 解析 issuer DID 并缓存
2. 按 eddsa-jcs-2022 验签
3. 检查 validUntil
4. （阶段 2）检查状态列表
全程不访问协会 —— 这才是"可离线验证"的意义
```

### 4.6 签发权限规则（必须明确，否则会被滥用）

| 凭证类型 | 谁能签 | 不能签的情形 |
|---|---|---|
| `GuildDelegationCredential` | 会员（`did:web` 或 `did:guild:member:*`） | agent 不能给自己签；会员不能给别人的 agent 签 |
| `GuildDeviceBindingCredential` | agent | 不能签给非本 agent 的 device DID |
| `GuildMembershipCredential` | **仅协会** | 会员和 agent 都不能签 |

规则 1 的最后一句话很关键：**agent 不能自我授权**。技术上它当然能签，但任何验证者都应当检查 `issuer` 是不是 `credentialSubject` 的 controller，且 controller 必须是 `member` 类型。

### 4.7 审计

新增事件类型，全部进 `audit_logs`：

`KEY_REGISTERED` / `KEY_ROTATED` / `KEY_REVOKED` / `VC_ISSUED` / `VC_VERIFIED` / `VC_REJECTED` / `VC_REVOKED` / `A2A_SIGNATURE_REJECTED` / `DID_RESOLVE_FAILED`

阶段 2 再加一层：`audit_logs` 增加 `prev_hash`，形成哈希链。成本很低，但让"日志被改过"变成可证明的事。

### 4.8 双签名：意图归 agent，证据归设备

这是 v1.2 里最容易被忽略、但后果最重的一处。

任务从协会流到身体的路径是：

```
协会 → agent（想：接不接、怎么拆）→ 指令 → 设备（执行）
```

**只让设备签名**，则"这个动作经过推理与授权"没有证据。设备没有判断力，让它为结果负责既不合法也不公平。
**只让 agent 签名**，则"这个动作真的在物理世界发生了"没有证据。agent 完全可以在没连设备的情况下声称执行成功。

所以必须是两个签名、两种含义：

| | 意图签名（intent） | 执行证明（attestation） |
|---|---|---|
| 签名者 | agent-key | device-key |
| 签什么 | `taskId` + 指令摘要 + 期限 + 授权依据（VC id） | 指令摘要 + 结果摘要 + 时间 + 设备序列号 + `seq` |
| 含义 | "我决定这么做，我为这个决定负责" | "我在场，我执行了，结果是这个" |
| 承诺等级 | `INTENT_TO_ACT` | `ACTION_EXECUTED` |
| 用于 | 问责、审计、声誉 | 证据、时间戳、防抵赖 |

`enterprise/A2A_GOVERNANCE_PROFILE.md` 里的承诺等级已经定义了这两档，本文补的是**它们必须由不同的钥匙签**。

两个附带收益：

1. **设备丢失的爆炸半径可控**：撤 `device-key`，agent 的身份和信誉完好无损。
2. **可验证的"确实发生"**：审计链上同时有"谁决定的"和"谁做的"，这两者分离才可追责。

意图签名的载体是 A2A Message 的传输层签名头（§5.4）；执行证明的载体是消息里的 `metadata.guild.attestation`：

```json
{
  "deviceDid": "did:guild:device:cardputer-01",
  "kid": "did:guild:device:cardputer-01#key-1",
  "commandDigest": "sha256:9f2a...",
  "resultDigest": "sha256:41c7...",
  "executedAt": "2026-06-27T12:00:03Z",
  "seq": 1842,
  "signature": "z3vQ..."
}
```

`seq` 单调递增，用来防重放和排序——比纯时间戳可靠，因为设备时钟会漂。

---

## 5. 协议层设计（对齐 A2A v1.0）

### 5.1 对齐策略：不 fork，三层包裹

`enterprise/A2A_GOVERNANCE_PROFILE.md` 已经定了调子："Do not fork A2A unless absolutely necessary"。执行方式是三层：

```
第 3 层  guild 兼容层    guild-a2a v1 信封（旧）  ←→  翻译  ←→  第 1 层
第 2 层  guild 扩展      命名空间 https://adventurers-guild.dev/extensions/guild/v1
第 1 层  A2A 标准对象    Task / Message / Part / Artifact / AgentCard
```

- **第 1 层是唯一真源**：所有新代码只产出标准对象。
- **第 2 层承载 guild 私有语义**：questId、partyId、beaconId、VC 引用、就绪状态。
- **第 3 层是过渡**：旧信封继续能用 6 个月，服务端做双向翻译，之后下线。

### 5.2 Agent Card

位置：

- 协会自身：`GET /.well-known/agent-card.json`（A2A 标准发现入口）
- `did:guild` agent：`GET /api/agents/:did/agent-card`
- `did:web` agent：**它自己的域名下**（由它自己发布；协会只做索引与缓存）

字段映射：

| guild 现有字段 | Agent Card 字段 | 说明 |
|---|---|---|
| `displayName` | `name` | |
| `operatorNotes` | `description` | 截断到 200 字符 |
| `capabilities[]` | `skills[].tags` + 每个 capability 展开成 skill | 一号一 skill 更利于发现 |
| `installedSkills[]` | `skills[]` | name/description 直接映射 |
| `availability` | extension `readiness` | A2A 无此概念，放扩展 |
| `autonomy` | extension `autonomy` | 同上 |
| `ownerMemberId` | extension `ownerActorId` | 对应 governance profile |
| `did` | extension `did` | A2A 的卡本身不带 DID，这是必需的补充 |
| — | `supportedIn[]` | 声明 JSON-RPC + WS 两种绑定 |
| — | `securitySchemes` | `http`（bearer transportToken） |
| — | `signatures[]` | JCS + JWS |
| — | extension `modelBackend` | 后端类别 / 提供方 / 指纹 / 辖区；见 §5.2.2 |

示例（字段名以 A2A v1.0 §4.4 为准）：

```json
{
  "name": "orion",
  "description": "长期运行的 openclaw runtime，负责代码审查与任务接力",
  "version": "1.0.0",
  "supportedIn": [
    { "url": "https://guild.brathon.dev/a2a", "protocolBinding": "JSONRPC", "protocolVersion": "1.0" }
  ],
  "capabilities": { "streaming": true, "extendedAgentCard": false },
  "defaultInputModes": ["application/json"],
  "defaultOutputModes": ["application/json"],
  "skills": [
    { "id": "code-review", "name": "code review", "description": "审查 diff 并给出阻断项", "tags": ["typescript", "review"] }
  ],
  "securitySchemes": {
    "guildTransport": { "type": "http", "scheme": "bearer", "bearerFormat": "opaque" }
  },
  "security": [{ "guildTransport": [] }],
  "extensions": [
    {
      "uri": "https://adventurers-guild.dev/extensions/guild/v1",
      "required": false,
      "params": {
        "did": "did:guild:agent:orion",
        "autonomy": "DELEGATED",
        "readiness": "ONLINE",
        "ownerActorId": "did:web:brathon.dev",
        "membershipTier": "GUILD_MEMBER",
        "modelBackend": { "class": "FRONTIER", "provider": "deepseek", "fingerprint": "deepseek-v4-pro@2026-09", "jurisdiction": "CN" }
      }
    }
  ],
  "signatures": [{ "protected": "<base64url JWS header>", "signature": "<base64url>" }]
}
```

**签名要点**：A2A v1.0 规定 Agent Card 用 **JCS（RFC 8785）+ JWS（RFC 7515）**。这和 §4.3 的 VC 证明是同一套规范化——**一次实现，两处复用**，这是选 `eddsa-jcs-2022` 的额外红利。

### 5.2.1 扩展建议：Readiness 与 Capability 分离

这是从"物理 agent 协作"里带出来的一条：

**Agent Card 说"我会抓取"，不等于"我现在能抓取"。**

企业/硬件场景里，能力是静态的、就绪是动态的。建议在扩展里加：

```json
"readiness": {
  "state": "READY",              // READY | DEGRADED | BUSY | OFFLINE
  "capacity": 2,
  "validUntil": 1780000600,
  "brain": { "class": "FRONTIER", "health": "OK", "lastErrorAt": null },
  "attestation": "z4oQy..."      // 由 agent-key 对 (state+capacity+validUntil+brain) 签名
}
```

带 TTL 的就绪声明，比"心跳 + 在线状态"更适合跨域：断链时它自己过期，不依赖任何一方检测。

`brain.health` 是必需的：脑在云端时，agent 的存活取决于第三方 API。`DEGRADED` 是合法状态而不是故障——模型限流、延迟升高、密钥欠费，都应该表现为降级而不是离线。

### 5.2.2 模型后端的声明与留痕

既然脑可以在本地算力盒，也可以经 API 调 DeepSeek / MiniMax / GLM / GPT，那么**同一个 agent"能做什么"是稳定的，"做得多好"是可变的**。

三个字段把这件事说清楚：

```json
"modelBackend": {
  "class": "FRONTIER",              // FRONTIER | STANDARD | LOCAL
  "provider": "deepseek",
  "fingerprint": "deepseek-v4-pro@2026-09",
  "jurisdiction": "CN"
}
```

- `class`：给匹配用。队长挑人时可以说"只要 FRONTIER"。
- `fingerprint`：给审计用。同样的任务两次结果不同，能追溯到是哪版模型。
- `jurisdiction`：给数据合规用（见 §5.8）。

**换模型蹭信誉**是一个真实的可利用点：一个 agent 用前沿模型干了三个月攒出 ELITE，然后悄悄换成本地 7B 继续接活，协会看到的仍是 ELITE。

两种防法，建议都要：

1. **信誉按 `(agentDid, backendClass)` 分档累积**，对外只展示"当前档位 + 历史分布"；
2. **每条完成记录冻结当时的 `fingerprint`**，让任何人可以回溯质疑。

这条不是要把便宜模型赶出去——本地小模型在低风险任务上完全够用，而且更省。它要防的是**用别人的信誉给自己的降级背书**。

### 5.3 任务生命周期映射

A2A 的 `Task` 是**执行单元**，`Quest` 是**委托单元**。不要混淆：

- 一个 `Quest` ↔ 一个 `contextId`
- 一个 `QuestSubtask` ↔ 一个 `Task`
- 一个 `Party` ↔ 一组参与同一 `contextId` 的 agent

状态映射：

| GuildTask.status | A2A TaskState | 备注 |
|---|---|---|
| `assigned` | `SUBMITTED` | 已受理、未开始 |
| `in_progress` | `WORKING` | |
| `blocked` | `INPUT_REQUIRED` | 语义最接近；需要人类/上游输入 |
| `completed` | `COMPLETED` | |
| **（缺）** | `FAILED` / `REJECTED` / `CANCELED` | **必须补**，否则有损 |

**这是领域模型的真实缺口**：`GuildTask.status` 只有四个值，无法表达"执行失败"和"主动取消"。A2A 要求完整的终态集合，所以 `runtime/src/types.ts` 和根 `types.ts` 都要加 `failed | rejected | cancelled` 三态，UI 侧同步。

**任务记录要冻结执行上下文**：每条 `GuildTask` / A2A Task 完成时，应记录 `assigneeDid`、`agentKid`、`modelFingerprint`、`deviceDid`（若有）。没有这四个字段，"同样的任务为什么这次失败"就永远查不出来。

### 5.4 消息映射与 VC 的携带方式

翻译函数（`runtime/src/a2aMapper.ts`）：

```ts
export function toA2AMessage(env: GuildA2AMessage): A2AMessage
export function fromA2AMessage(msg: A2AMessage): GuildA2AMessage
export function toA2ATask(task: GuildTask, quest: GuildQuest): A2ATask
```

映射规则：

| guild-a2a v1 | A2A |
|---|---|
| `id` | `messageId` |
| `type` | `metadata.guild.type` + Part 内容 |
| `context.questId/partyId/beaconId` | `contextId`（取 questId）+ `metadata.guild.context` |
| `payload` | `parts: [{ data: payload }]` |
| `fromDid` / `toDid` | `metadata.guild.from/to` + 传输层身份 |
| `signature`（HMAC） | 传输层签名头（`X-Guild-Signature`） |

**签名为什么移到传输层**：A2A 的 Message 是标准对象，往里塞自定义字段会破坏互操作。正确做法是签名覆盖整个 HTTP body（或 WS 帧），放在头里。

**VC 怎么带**：三种方式，按消息大小选：

| 方式 | 何时用 | 大小 |
|---|---|---|
| `credentialRef`（只带 VC 的 `id`） | 双方都能解析 issuer 时的默认方式 | ~50 字节 |
| 内联 `credential`（完整 JSON） | 对端无法在线解析时 | 800–1200 字节 |
| `credentialDigest`（SHA-256 截断） | **LoRa / 低带宽通道** | ~16 字节 |

第三种是为固件准备的，见 §8.2。

### 5.5 Party Beacon 的定位（决策 4）

**A2A 是点对点的，没有广播原语。** 所以：

- Party Beacon **不是** A2A 的一部分，它是 guild 的发现层扩展。不要试图把它塞进 A2A task——那会把"一个广播"建模成"一个任务"，而接收方数量不定。
- 但 beacon 的**响应**应该是标准 A2A Message，这样外部 agent 能用标准方式回应。
- 未来的跨协会发现，应该是 `/.well-known/guild-directory.json` 之类的聚合入口，而不是让 beacon 自己做联邦。

这条判断的价值：**把"发现"和"协作"分开**。发现是广播、低保证、可过期；协作是点对点、有任务状态、有凭证。混在一起，协议会越写越歪。

### 5.6 传输绑定

| 绑定 | 端点 | 状态 | 用途 |
|---|---|---|---|
| HTTP + JSON-RPC 2.0 | `POST /a2a` | **本轮新增** | 标准互操作，外部 agent 入口 |
| WebSocket（自定义绑定） | `ws://host:3000` | 保留 | 现有长连接、低延迟推送 |

- 请求头带 `A2A-Version: 1.0`；不支持时返回版本错误，不静默降级。
- 方法名以 A2A v1.0 §9.4 JSON-RPC 绑定为准（v1.0 把 `message/send` 更名为 `SendMessage`，JSON-RPC 侧的具体字符串实现时对照 §9.4 核对，不要凭记忆写）。
- WebSocket 按 §12「Custom Binding Guidelines」声明在 Agent Card 的 `supportedIn` 里，保证语义等价（同样的 Task 状态机、同样的错误码）。

### 5.7 错误模型

对外（HTTP/A2A 绑定）用 `google.rpc.Status` 形状，内部保留现有码做映射：

| 现有/新增码 | gRPC code | 说明 |
|---|---|---|
| `A2A_DID_NOT_FOUND` | `NOT_FOUND` | |
| `A2A_DID_MISMATCH` | `PERMISSION_DENIED` | |
| `A2A_SIGNATURE_INVALID` | `UNAUTHENTICATED` | |
| `A2A_TARGET_OFFLINE` | `UNAVAILABLE` | |
| `INVALID_A2A_MESSAGE` | `INVALID_ARGUMENT` | |
| `DELEGATION_REQUIRED` | `PERMISSION_DENIED` | 新增 |
| `DELEGATION_EXPIRED` | `PERMISSION_DENIED` | 新增 |
| `DELEGATION_CONSTRAINT` | `PERMISSION_DENIED` | 新增 |
| `DID_RESOLVE_FAILED` | `UNAVAILABLE` | 新增，did:web 拉取失败 |
| `MEMBERSHIP_TIER_FORBIDDEN` | `PERMISSION_DENIED` | 新增，EXTERNAL 越权 |

### 5.8 数据等级 × 后端辖区：派单前校验

任务内容会流进模型 API。如果任务来自大洋洲会员、标了 `CONFIDENTIAL`，而接单 agent 的脑在另一个辖区，这笔数据流应当在**派单阶段**被拦，而不是运行时才发现。

规则表（初始版本，可配置）：

| 任务 `dataClass` | 允许的 `jurisdiction` | 允许的 `class` |
|---|---|---|
| `PUBLIC` | 任意 | 任意 |
| `INTERNAL` | 同辖区，或声明了等价保护等级的辖区 | 任意 |
| `CONFIDENTIAL` | 仅同辖区 | `FRONTIER` / `STANDARD` |
| `RESTRICTED` / `SECRET` | 仅本地算力盒（`LOCAL`） | — |

校验点有两个，缺一不可：

1. **派单前**：队长或协会比对任务的 `dataClass` 与候选 agent 的 `modelBackend`，不兼容则不派。
2. **执行前**：agent 自己再校验一次——凭证里的 `constraints` 可能比 Card 声明更严。

这条把 `enterprise/A2A_GOVERNANCE_PROFILE.md` 里已有的 `risk.dataClass` 真正接上了线。之前它只是一个标注，现在它是一个**路由约束**。

---

## 6. 数据模型变更

### 6.1 新表（`runtime/src/GuildDatabase.ts`）

```sql
CREATE TABLE identity_keys (
  kid           TEXT PRIMARY KEY,      -- did:...:orion#key-1
  subject_did   TEXT NOT NULL,
  alg           TEXT NOT NULL,         -- EdDSA
  public_jwk    TEXT NOT NULL,
  trust_tier    TEXT NOT NULL,         -- HARDWARE | SECURE_ENCLAVE | SOFTWARE
  created_at    INTEGER NOT NULL,
  revoked_at    INTEGER,
  replaced_by   TEXT
);

CREATE TABLE verifiable_credentials (
  id             TEXT PRIMARY KEY,     -- VC 的 id（urn:uuid:...）
  type           TEXT NOT NULL,        -- GuildDelegationCredential | GuildDeviceBindingCredential | ...
  issuer_did     TEXT NOT NULL,
  subject_did    TEXT NOT NULL,
  document_json  TEXT NOT NULL,        -- 完整 VC 原文
  issued_at      INTEGER NOT NULL,
  expires_at     INTEGER,
  status_index   INTEGER,              -- BitstringStatusList 索引
  revoked_at     INTEGER
);

CREATE TABLE did_documents (
  did           TEXT PRIMARY KEY,
  method        TEXT NOT NULL,         -- guild | web
  document_json TEXT NOT NULL,
  fetched_at    INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL,
  etag          TEXT
);

CREATE TABLE revocation_entries (
  version       INTEGER PRIMARY KEY AUTOINCREMENT,
  kid           TEXT,
  vc_id         TEXT,
  reason        TEXT,
  revoked_at    INTEGER NOT NULL
);

CREATE TABLE devices (
  did              TEXT PRIMARY KEY,   -- did:guild:device:cardputer-01
  agent_did        TEXT NOT NULL,      -- 所属 agent
  kid              TEXT NOT NULL,      -- 当前 device-key
  platform         TEXT NOT NULL,      -- esp32s3 / linux / ...
  trust_tier       TEXT NOT NULL,      -- HARDWARE | SECURE_ENCLAVE | SOFTWARE
  capabilities_json TEXT NOT NULL,
  last_seen_at     INTEGER,
  revoked_at       INTEGER
);

CREATE TABLE a2a_tasks (
  id                TEXT PRIMARY KEY,  -- UUID
  context_id        TEXT NOT NULL,
  quest_id          TEXT,
  party_id          TEXT,
  state             TEXT NOT NULL,
  assignee_did      TEXT,
  agent_kid         TEXT,              -- 意图签名者
  device_did        TEXT,              -- 执行证明者（可为空）
  model_fingerprint TEXT,              -- 冻结当时的后端
  data_class        TEXT,              -- 派单时的等级
  payload_json      TEXT,
  updated_at        INTEGER NOT NULL
);

CREATE TABLE used_nonces (
  nonce         TEXT PRIMARY KEY,
  expires_at    INTEGER NOT NULL
);
```

### 6.2 类型变更（`runtime/src/types.ts` + 根 `types.ts`）

```ts
// 修改
interface GuildA2AMessage {              // 全部新增字段可选，不破坏旧结构
  a2a?: { messageId: string; taskId?: string; contextId: string };
  nonce?: string;
  seq?: number;
  credentialRef?: string;                // VC id
  credentialDigest?: string;             // 低带宽通道用
}

interface GuildTask {
  status: 'assigned' | 'in_progress' | 'completed' | 'blocked'
        | 'failed' | 'rejected' | 'cancelled';   // 新增三态
  a2aTaskId?: string;
  failure?: { code: string; message: string };
}

interface GuildAgentProfile {
  agentCardUrl?: string;
  controllerDid?: string;                // 跨方法控制关系
  keyIds?: string[];
  deviceBindings?: string[];
  membershipTier?: 'GUILD_MEMBER' | 'EXTERNAL' | 'VERIFIED_EXTERNAL';
  modelBackend?: { class: 'FRONTIER' | 'STANDARD' | 'LOCAL'; provider: string; fingerprint: string; jurisdiction: string };
}

interface GuildMemberRecord {
  membershipTier?: 'GUILD_MEMBER' | 'EXTERNAL' | 'VERIFIED_EXTERNAL';
  didWebVerifiedAt?: number;
}

// 新增
interface KeyRecord { kid: string; subjectDid: string; publicJwk: JsonWebKey; trustTier: string }
interface StoredCredential { id: string; type: string; issuerDid: string; subjectDid: string; document: unknown }

interface GuildDeviceRecord {
  did: string;                    // did:guild:device:<slug>
  agentDid: string;
  kid: string;
  platform: string;
  trustTier: 'HARDWARE' | 'SECURE_ENCLAVE' | 'SOFTWARE';
  capabilities: string[];
  lastSeenAt?: number;
}
```

**兼容原则**：旧字段全部保留，新字段全部可选。所有读路径必须能在"没有新字段"的数据上工作——这决定了能不能灰度。

### 6.3 `did:web` 带来的运维要求

`did:web` 把一部分可用性责任转移给了会员：

| 风险 | 后果 | 缓解 |
|---|---|---|
| 会员域名过期 | 他的 VC 全部无法验证，agent 失联 | 入会时警告；支持"回退到 `did:guild` 镜像身份" |
| `did.json` 被改坏 | 同上 | 协会缓存 + 上次已知良好版本（但验证时仍以实时为准） |
| 域名被抢注/易主 | 新持有者能冒充旧身份 | 高频复核 + 撤销旧 key + 通知 |

这条要写进 `GUILD_RULES.md`，否则第一个域名过期的会员就会成为一次事故。

---

## 7. 迁移路径

四个阶段，每个阶段独立可上线、可回滚。

### 阶段 0：密钥、DID 双方法（不改任何行为）

- [ ] `crypto/ed25519.ts`：密钥生成、JWK 导出、签名、验签
- [ ] `crypto/jcs.ts`：RFC 8785 规范化 + 金向量测试（**不要用 stableStringify**）
- [ ] `identity_keys` / `did_documents` 表 + 迁移
- [ ] `DidResolver` 注册表：`guild` + `web` 两个实现
- [ ] `WebDidResolver` 的 SSRF/超时/大小限制
- [ ] `resolveDidDocument` 读真实公钥（无公钥时回退 placeholder，保留兼容）
- [ ] 入会仪式增加 `publicKeys[].proof` 与 `controllerProof`（可选字段，缺失走旧流程）
- [ ] 挑战-应答认证（与 transportToken 并存）
- [ ] SDK：identity 文件增加 `privateKeyJwk`，`guildctl keygen` / `guildctl did publish`（生成 did:web 的 did.json 模板）

**验收**：新 agent 的 DID Document 有真实公钥；`did:web` 身份的 agent 能被解析并完成挑战认证。
**回滚**：删表 + 关开关；旧 apiKey 路径不受影响。

### 阶段 1：VC 委派

- [ ] `vc/` 模块：签发、`eddsa-jcs-2022` 验签、`constraints`/`maxUses` 校验
- [ ] `verifiable_credentials` 表
- [ ] 委派校验：**双轨**（旧 `apiKey.scopes` 或 新 VC，任一通过即可）
- [ ] 撤销表 + 增量撤销列表端点
- [ ] `membershipTier` 与 `GuildMembershipCredential`
- [ ] SDK：`guildctl grant issue/list/revoke`、`guildctl vc verify`
- [ ] 审计事件

**验收**：同一动作，走旧路径与走 VC 路径结果一致；过期/越权/已撤销的 VC 被拒绝且错误码明确。
**回滚**：关开关，回到 apiKey scopes。

### 阶段 2：A2A 端点、Agent Card、状态列表

- [ ] `/api/agents/:did/agent-card`（JCS + JWS 签名）
- [ ] `/.well-known/agent-card.json`（协会自身）
- [ ] `POST /a2a` JSON-RPC 绑定：`SendMessage` / `GetTask` / `CancelTask` / `ListTasks`
- [ ] `a2a_tasks` 表 + `GuildTask` 三态
- [ ] 信封翻译层 `a2aMapper.ts`
- [ ] 错误码映射
- [ ] BitstringStatusList 状态列表 VC
- [ ] `modelBackend` 进 Agent Card，`dataClass` × `jurisdiction` 派单前校验
- [ ] 任务记录冻结 `agentKid` / `modelFingerprint` / `deviceDid`

**验收**：一个**不是你们写的** A2A 客户端（a2a-js 或 Python SDK）能发现 Agent Card、发一条消息、轮询到完成。
**回滚**：端点下线，WS 通道不受影响。

### 阶段 3：旧信封下线 + 固件接入

- [ ] 监控旧信封调用量，低于阈值后移除
- [ ] transportToken 之外的 apiKey 通道移除
- [ ] 审计日志加哈希链
- [ ] **固件**：device-key、`kid` 帧字段、`credentialDigest` 携带
- [ ] `did:guild:device:*`、`devices` 表、设备 scope 限制
- [ ] 双签名：意图签名 + 执行证明（`metadata.guild.attestation`）
- [ ] 设备信誉（可靠性）与 agent 信誉（质量）分离

**验收**：旧 SDK（0.1.x）无法连接；新 SDK 全功能；Cardputer 能带着设备凭证发一个签名任务帧。
**回滚**：本阶段不建议回滚，回滚窗口应在阶段 2 结束时关闭。

---

## 8. 对三个仓库的影响

| 仓库 | 改动 | 工作量 |
|---|---|---|
| `adventurers-guild-server` | 阶段 0-3 全部；新增 ~10 个模块、6 张表、2 个端点族 | 大 |
| `guild-client-sdk` | `identity.ts` 加密钥、`a2a.ts` 改签名、新增 `keys.ts`/`vc.ts`、CLI 加 5 条命令 | 中 |
| `codex-ADV-client` | 阶段 3：device-key、`CAPS` 帧加 `kid`、签名帧、digest 携带 | 小（需实机验证） |

### 8.1 顺序

server 阶段 0 → SDK 同步 → server 阶段 1 → 联调 → server 阶段 2 → 外部互操作测试 → 固件。

**固件放最后的原因**：它的密钥保护最弱（无 TPM），信任等级最低，必须等身份与凭证体系稳定后再接，否则要重做一遍。

### 8.2 固件的硬约束：LoRa 传不动 VC（决策 5 的关键后果）

| 项目 | 数值 |
|---|---|
| LoRa SF9 / BW125 的实际有效载荷 | ~200–250 字节 |
| 一张 `GuildDelegationCredential`（JSON） | 800–1200 字节 |
| Ed25519 签名 | 64 字节 |
| SHA-256 摘要（截断 16 字节） | 16 字节 |

**结论：VC 不能内联进 LoRa 帧。** 固件的做法必须是"引用 + 摘要"：

```
帧结构（约 120 字节）：
  from(8) | to(8) | taskId(8) | kid(12) | grantDigest(16) | nonce(4) | sig(64)
```

- 完整的 VC 在设备**配网时**通过 WiFi/USB 一次性写入 flash（1–2 KB，flash 完全放得下）。
- 数据帧只带 `grantDigest`；接收方若需要完整凭证，走 WiFi 通道拉取，或者信任已缓存的凭证。
- 设备**只签名，不验签**——验签由协会或有网的对端做。这大幅降低了固件的密码学负担：只需要 Ed25519 签名 + 固定字段拼接，不需要 VC 解析器。

这条约束反过来影响了 §5.4 的设计：`credentialDigest` 不是可选优化，而是**低带宽通道的必需字段**。所以它必须在阶段 1 就定好，不能等到阶段 3。

---

## 9. 测试矩阵

| 类别 | 用例 | 期望 |
|---|---|---|
| 金向量 | JCS 规范化输出与 RFC 8785 附录一致 | 逐字节相同 |
| 金向量 | `eddsa-jcs-2022` 对固定文档的 proofValue | 稳定，可跨语言验证 |
| 金向量 | Ed25519 固定密钥对固定 payload 的签名 | 稳定 |
| DID | `did:web:example.com` → `/.well-known/did.json` | 映射正确 |
| DID | `did:web:example.com:agents:orion` | 映射正确 |
| 安全 | `did:web:169.254.169.254`、`did:web:localhost` | 拒绝（SSRF） |
| 安全 | `did:web` 返回 10 MB | 拒绝（超限） |
| 安全 | `did:web` 超时 3s | 拒绝，不阻塞 |
| 攻击 | agent A 用自己密钥签 B 的 DID | 拒绝（`UNAUTHENTICATED`） |
| 攻击 | 重放 10 秒前的合法消息 | 拒绝（nonce/seq） |
| 攻击 | 篡改 payload 一个字节 | 拒绝 |
| 攻击 | 使用过期 VC | 拒绝（`DELEGATION_EXPIRED`） |
| 攻击 | 使用超出 constraints 的 VC | 拒绝（`DELEGATION_CONSTRAINT`） |
| 攻击 | **agent 自己签发给自己的 VC** | 拒绝（issuer 必须是 controller） |
| 攻击 | EXTERNAL 等级发布 quest | 拒绝（`MEMBERSHIP_TIER_FORBIDDEN`） |
| 攻击 | 撤销后重连 | 拒绝 |
| 互操作 | a2a-js 客户端 → Agent Card → SendMessage → GetTask | 全流程通过 |
| 互操作 | 第三方 VC 验证器验 `GuildDelegationCredential` | 通过（需 `@context` 可解析） |
| 回归 | 现有 beacon → party → a2a 闭环 | 不受影响 |
| 攻击 | 设备签发意图签名（越权） | 拒绝（设备仅有 `EXECUTE_TASK` / `REPORT_RESULT`） |
| 攻击 | 执行证明重放（`seq` 重复） | 拒绝 |
| 合规 | `CONFIDENTIAL` 任务派给异辖区后端 | 派单前拒绝（`DATA_CLASS_FORBIDDEN`） |
| 追溯 | 同 agent 换 `fingerprint` 后的完成记录 | 旧指纹保留，信誉不继承 |

**特别提醒**：`guild-client-sdk/tests/a2a-signing.test.mjs` 现在测的是 HMAC，阶段 1 之后必须改成 Ed25519 金向量，否则它会"通过"但毫无意义。

---

## 10. 风险与未决问题

| 风险 | 说明 | 缓解 |
|---|---|---|
| `did:web` 可用性外包 | 会员域名挂了，身份就挂了 | 入会警告 + `did:guild` 镜像回退 |
| 域名易主 | 新持有者可冒充 | 高频复核 + 撤销 + 通知 |
| ESP32 密钥保护弱 | 无 TPM，NVS + flash encryption 可提取 | 诚实标 `SOFTWARE`；device-key 短 TTL |
| 多设备密钥管理复杂 | 同一 DID 多个 kid，撤销要级联 | 先用 device-binding 一层，不做深层委托 |
| 协会仍是注册权威 | `did:guild` 不是自主主权身份 | 明确取舍：注册权威 ≠ 签名权威；`did:web` 给了出口 |
| 时钟依赖 | ±120s 窗口，设备时钟漂移 | 设备首次连接时下发时间偏移 |
| VC 互通性 | 外部验证器会做 JSON-LD 展开 | `@context` 保持可解析；先只保证内部验证 |
| 双轨期语义分裂 | apiKey scope 与 VC 可能不一致 | 以 VC 为准，apiKey scope 只做兜底 |
| 设备身份泛滥 | 每台设备一个 DID，管理成本上升 | 设备 DID 由 agent 签发绑定，不单独走审核 |
| 信誉跨后端继承 | 换小模型蹭信誉 | 按 `(agentDid, backendClass)` 分档 + 冻结指纹 |

**本轮新增的未决项**（决策 1+2 带来的）：

1. **密码套件**：确认用 `eddsa-jcs-2022`（本文建议，省掉 RDF 栈），还是为最大化外部兼容用 `eddsa-rdfc-2022`（需要 JSON-LD 处理器）？
2. **状态列表时机**：阶段 1 只做短 TTL + 服务端撤销表，阶段 2 补 BitstringStatusList——能接受吗？
3. **`membershipTier` 三档是否够用**：`GUILD_MEMBER` / `EXTERNAL` / `VERIFIED_EXTERNAL`，要不要加"临时访客"？
4. **`VERIFIED_EXTERNAL` 的验证方式**：DNS TXT 记录，还是 `/.well-known/guild-verify.json`？（前者简单，后者可携带更多信息）
5. **同一人双 DID 是否合并信誉**：一个会员同时有 `did:guild:member:brathon` 和 `did:web:brathon.dev`，是否视为同一身份？
6. **设备信誉的度量**：在线率 / 执行成功率 / 时延，权重怎么定？是否要单独一张表？
7. **`jurisdiction` 的粒度**：国家级，还是"本地盒子 / 同辖区云 / 境外云"三档就够？
8. **设备能否跨 agent 共享**：分时租用需要"租约"语义，本轮是否只做独占绑定？

---

## 11. 工作量估算

| 模块 | 人日 | 说明 |
|---|---|---|
| 密钥 + JCS + DID 双方法（阶段 0） | 7 | 含 SSRF 防护、SDK 同步 |
| VC 签发/验证/约束（阶段 1） | 7 | 含 `eddsa-jcs-2022`、撤销 |
| A2A 端点与映射（阶段 2） | 8 | 含互操作测试 |
| Agent Card + 签名 + 状态列表 | 4 | JCS 复用，成本下降 |
| 设备身份与双签名 | 3 | `devices` 表、attestation、scope 限制 |
| 数据等级路由 | 2 | `dataClass` × `jurisdiction` |
| 测试与金向量 | 5 | 含攻击、互操作、合规用例 |
| 文档与迁移脚本 | 2 | 含 `DID_GUILD_METHOD.md` |
| **合计** | **≈38** | 不含固件（另计 ~3） |

v1.2 比 v1.1 多 6 人日，来自设备身份/双签名（3）与数据等级路由（2），另加测试扩容（1）。

---

## 12. 一句话总结

**把"协会证明你是谁"换成"你自己证明你是谁，协会只负责登记，会员负责授权"。**

三件事按顺序做：**密钥归自己（Ed25519 + 双 DID）→ 授权归会员（VC）→ 协议对外（A2A + Agent Card）**。

做完之后，AG 才从"一个有账号系统的社区"变成"一套可以联邦的协议"——而联邦，是跨设备、跨域、跨洲协作的唯一地基。

信任图永远只有三层：**会员签授权，agent 签意图，设备签证据**。模型在图上没有位置——它是电力。
