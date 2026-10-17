# 决策记录（ADR Log）

> **状态**：已确认，作为 v2 升级的开工依据
> **最后更新**：2026-10-17
> **取代**：`docs/IDENTITY_A2A_V2.md` 中被本文标注为"过时"的部分（v2.1 设计稿尚未重写）

---

## 0. 最终架构速览

### 0.1 一句话

**域名是身份证，签名是手印，透明日志保证没人能偷偷改。**

### 0.2 信任链

```
DNS + TLS（域名控制权）
   └─ did:web 文档（公钥）
         └─ 会员私钥签名 → 委派 VC
               └─ agent 私钥签名 → 意图
                     └─ 设备私钥签名 → 执行证明
```

### 0.3 身份分配（入会即发证）

```
新成员申请
  → 协会分配子域：did:web:guild.example.com:alice
                     ↓
             https://guild.example.com/alice/did.json
  → 成员在本地生成密钥（协会永远拿不到私钥）
  → 成员用自己的密钥签一条日志记录：(did, keyHash, version, seq)
  → 日志追加；Merkle root 定期锚定（当前阶段：先不锚，留接口）
```

**关键约束**：日志条目由**会员自己签名**。协会可以运营日志、可以拒绝写入（可被发现的审查），但**不能伪造一条别人的记录**——它没有那个私钥。

### 0.4 诚实的边界

这套模型**不是**"自主主权身份"。域和文件由协会托管，所以准确的说法是：

> **协会不能悄悄改你的身份；改了会被日志和签名发现。**

这是 "tamper-evident"（可发现篡改），不是 "tamper-proof"（不可篡改）。要升级成后者，得等成员自己托管域，或把锚定真的做起来。

---

## 1. 架构分叉（6 条）

### D-01 持久化模型：核心实体关系表 + 投影 blob

- **决策**：`member` / `agent` / `device` / `identity_keys` / `verifiable_credentials` / `a2a_tasks` 走关系表；`guild snapshot` 仍整体存 blob。
- **理由**：新表要按 `did`、`kid` 查询和唯一约束，blob 做不到；但 snapshot 是派生视图，存 blob 最省。
- **代价**：`GuildState`（1601 行）要抽出一层 repository。约 +3–4 人日。
- **影响**：`runtime/src/GuildState.ts`、新增 `runtime/src/repo/`、`runtime/src/GuildDatabase.ts`。

### D-02 WS 帧格式：与 JSON-RPC 同构

- **决策**：

  ```jsonc
  { "type": "a2a", "id": "<rpcId>", "method": "SendMessage", "params": { } }
  { "type": "a2a_result", "id": "<rpcId>", "result": { } }   // 或 "error"
  ```

- **理由**：HTTP 绑定与 WS 绑定共用一套编解码与错误模型，SDK 只写一次。
- **代价**：现有 `{type:'a2a_message', message}` 需要兼容层。
- **影响**：`runtime/src/GuildRuntime.ts`、`guild-client-sdk/src/a2a.ts`、`guild-client-sdk/src/ws.ts`。

### D-03 会员客户端：CLI 先行

- **决策**：`guildctl` 承担密钥生成、入会、签 VC、验 VC；私钥留本地文件。浏览器客户端后置。
- **理由**：阶段 0/1 的全部验收都能用 CLI 完成；WebCrypto + IndexedDB 的方案会多 5 天且不改变协议。
- **代价**：早期体验偏开发者。
- **影响**：`guild-client-sdk/bin/`、`guild-client-sdk/src/cli.ts`。

### D-04 A2A 实现：HTTP 用官方 SDK，WS 自写薄层

- **决策**：`POST /a2a` 基于 a2a-js（需先验证对 v1.0 的支持度）；WebSocket 绑定自己实现，复用同一套对象模型。
- **理由**：互操作交给官方库，长连接语义自己控。
- **代价**：两条路径要保持语义等价，需要共享一套 codec 测试。
- **影响**：新增 `runtime/src/a2a/`。

### D-05 部署形态：v2 单实例

- **决策**：明确单实例部署；水平扩展留到 v3。
- **理由**：多实例需要粘性会话、状态外置、跨进程租约，而现在连身份都还没有。
- **代价**：水平扩展能力延后。
- **影响**：`docs/DEPLOYMENT.md`、`Dockerfile`。

### D-06 迁移机制：正式 migration runner

- **决策**：补齐版本化迁移（`schema_migrations` 已存在但只到 v1）；每次 schema 变更一个可重放脚本。
- **理由**：现在改 schema 靠手工 `.bak`，不可重放、不可回滚。
- **代价**：约 1 人日。
- **影响**：`runtime/src/GuildDatabase.ts`、新增 `runtime/src/migrations/`。

---

## 2. 身份模型（8 条）

### D-07 DID 方法：只保留 `did:web`

- **决策**：删除 `did:guild` 完全退出；所有身份都是 `did:web`。
- **理由**：一种方法、一个解析器、一套信任根（DNS + TLS），没有双轨期。
- **代价**：必须有域名；旧数据要重注册（D-10）。
- **影响**：`runtime/src/did.ts` 删除；新增 `runtime/src/did/resolver.ts`；`runtime/src/types.ts` 的 `GuildDidDocument` 改造。

### D-08 身份分配：入会自动注册子域

- **决策**：协会持有主域，为每个新身份分配路径式子域：

  ```
  did:web:guild.example.com:alice          → https://guild.example.com/alice/did.json
  did:web:guild.example.com:orion          → https://guild.example.com/orion/did.json
  did:web:guild.example.com:orion:cardputer-01 → https://guild.example.com/orion/cardputer-01/did.json
  ```

  用路径形式而非多级子域，原因：一张通配证书 + 一条 DNS 记录即可覆盖全部。

- **理由**：成员不需要自己买域名、建证书、跑静态托管；入会即完成。
- **代价**：**域和文件由协会托管**，因此主权被削弱（见 §0.4 的诚实边界）。
- **影响**：新增 `runtime/src/did/issuer.ts`（生成 did.json）、`runtime/src/routes/did.ts`。

### D-09 设备身份：独立 `did:web`，不是 agent 下的 key

- **决策**：每台设备注册自己的 did:web 路径，拥有独立密钥与独立 DID。
- **理由**：与"入会即发证"一致；独立 DID 让撤销、审计、多设备区分都变简单。
- **代价**：设备数增长意味着 DID 数增长，需要配额与清理策略。
- **影响**：`runtime/src/types.ts` 的 `GuildDeviceRecord`、`devices` 表、固件注册流程。

### D-10 旧身份数据：重注册，旧 DID 作废

- **决策**：不写 `did:guild` → `did:web` 的映射；已有记录重新走一遍入会。
- **理由**：数据量小（几个成员、几个 agent），重注册最干净；映射会让每次验证多一跳。
- **代价**：历史 audit log 的时间线会断一次，需在日志里留一条"身份体系迁移"标记。
- **影响**：`data/guild-state.sqlite` 迁移脚本。

### D-11 会员密钥恢复：助记词

- **决策**：注册时生成 12 词助记词，用于派生/恢复密钥；恢复时新 key 入日志，旧 key 标记撤销。
- **理由**：无需信任第三方，标准做法。
- **代价**：用户必须保管助记词；丢失即失去身份。
- **影响**：`guild-client-sdk/src/keys.ts`、`runtime/src/routes/keys.ts`（恢复流程）。

### D-12 撤销分发：拉模式 + 短缓存

- **决策**：对端按需拉 `/api/revocations?since=<version>`，缓存 5 分钟；不做推送。
- **理由**：离线与在线统一，实现最简单；撤销生效最多晚 5 分钟可接受。
- **代价**：紧急撤销有最长 5 分钟窗口。
- **影响**：新增 `runtime/src/routes/revocations.ts`、`runtime/src/revocation.ts`。

### D-13 设备时钟：不信任设备时间，只签 seq

- **决策**：执行证明里不包含设备侧绝对时间；设备只签单调递增 `seq`，接收方打戳。
- **理由**：ESP32 没有可靠 RTC；信任一个会漂的时钟比不信任更危险。
- **代价**：无法从证明本身判断"执行时刻"，只能靠接收时间。
- **影响**：`docs/IDENTITY_A2A_V2.md` §4.8 的 attestation 结构（去掉 `executedAt`，保留 `seq`）。

### D-14 Agent Card 可见性：公开基础卡 + 成员可见扩展

- **决策**：基础卡（name / skills / supportedIn）公开可读；`ownerActorId`、`modelBackend`、`readiness` 仅成员可见（走 `extendedAgentCard`）。
- **理由**：外部发现需要公开卡；敏感信息不该暴露给所有人。
- **代价**：两套读路径 + 鉴权。
- **影响**：新增 `runtime/src/routes/agent-card.ts`。

---

## 3. 凭证与信任（6 条）

### D-15 密码套件：`eddsa-rdfc-2022`

- **决策**：VC 使用 RDF 规范化（URDNA2015）+ Ed25519，而非 JCS。
- **理由**：W3C VC 生态兼容性更好，外部验证器默认更可能支持。
- **代价**：需要 JSON-LD 处理器（`jsonld` + `rdf-canonize`）。
  **必须本地固化 `@context`**，禁止运行时远程拉取——否则验证结果依赖网络且可变。
- **影响**：新增 `runtime/src/vc/rdfc.ts`、`runtime/src/vc/contexts/`。
- **注**：设备只签名不验签，因此嵌入式端不受此依赖影响。

### D-16 状态列表：阶段 1 就做

- **决策**：阶段 1 即实现 BitstringStatusList，不等阶段 2。
- **理由**：离线一方需要能独立判断撤销；短 TTL 只能保证"最多 24h 后失效"。
- **代价**：+2 人日。
- **影响**：新增 `runtime/src/vc/status-list.ts`、`runtime/src/routes/status.ts`。

### D-17 成员等级：正式成员 / 访客

- **决策**：两档。

  | 等级 | 进入方式 | 能做什么 |
  |---|---|---|
  | `MEMBER` | 被邀请 → 注册 | 组队、接活、发任务、积累信誉 |
  | `GUEST` | 自助或邀请 | **只能看 `visibility: PUBLIC` 的内容**，不能接活、不能进秘密项目 |

- **理由**：不做"外包型外部成员"——要干活必须先注册；访客只是公开内容的只读视角。
- **代价**：无。访客权限直接复用现有 `visibility` 字段。
- **影响**：`runtime/src/types.ts` 的 `membershipTier`、`GuildQuest` 增加 `visibility`。

### D-18 域名归属验证（原 `guild-verify.json`）：废弃

- **决策**：不做。
- **理由**：模型变更后失去意义——did.json 由协会托管，而 `did:web` 的解析本身就证明域名控制权；再放一个 `guild-verify.json` 是重复。
- **影响**：从设计中删除该节。

### D-19 双 DID 信誉合并：不适用

- **决策**：删除该议题。
- **理由**：`did:guild` 已取消（D-07），不存在两份身份。
- **影响**：无。

### D-20 数据出境：简化为两档

- **决策**：`dataClass` 保留，规则简化为 `LOCAL` / `CLOUD` 两档；不做 jurisdiction 判断。
- **理由**：暂不做跨国合作。
- **代价**：将来真要做跨境，需要补辖区维度（字段可无损升级）。
- **影响**：`docs/IDENTITY_A2A_V2.md` §5.8 待重写为两行规则。

---

## 4. 链与防篡改（4 条）

### D-21 链的角色：透明日志 + 定期锚定

- **决策**：本地 append-only 透明日志记录身份变更；Merkle root 定期锚定到公链（当前未实现，只留接口）。
- **理由**：每次注册都发交易的成本和延迟对一个社区项目不划算；锚定同样能提供"历史不可悄悄改写"。
- **代价**：锚定周期内（如一天）存在篡改窗口。
- **影响**：新增 `runtime/src/log/merkle.ts`、`runtime/src/log/store.ts`。

### D-22 日志写入权：会员自己签

- **决策**：日志条目由身份持有者用私钥签名后提交；协会只负责排序、入 Merkle 树、对外提供 proof。
- **理由**：这是"协会不能伪造你"的唯一实现方式——它没有你的私钥。
- **代价**：注册流程多一步签名；客户端必须能签名（CLI 已满足）。
- **影响**：`guild-client-sdk/src/log.ts`、`runtime/src/log/verify.ts`。

### D-23 链上内容：只存哈希

- **决策**：锚定只写 Merkle root（32 字节）；身份明细留在日志与 did.json。
- **理由**：隐私友好、成本最低、可扩展。
- **代价**：链上无法直接解析身份，需配合日志服务。
- **影响**：`runtime/src/log/anchor.ts`。

### D-24 上链时机：先不上链，留接口

- **决策**：阶段 0–2 不接真链；只实现日志、Merkle、proof，锚定留 `AnchorProvider` 接口。
- **理由**：身份格式定型前上链是不可逆的负担。
- **代价**：当前阶段"第三方可独立验证"不成立，只有本地完整性。
- **影响**：`runtime/src/log/anchor.ts` 留空实现。

---

## 5. 设备与协作（5 条）

### D-25 设备信誉：五维

- **决策**：可用性、执行保真度、回执时延、在场证明、数据质量。
- **理由**：设备既可能是执行器也可能是传感器，五个维度覆盖两种角色。
- **代价**：指标多，需要定义各自的采集与计算方式。
- **影响**：`runtime/src/types.ts` 的 `DeviceReputation`、`devices` 表增加计数字段。

### D-26 设备跨 agent 共享：不做

- **决策**：设备归属单一 agent，无租约、无分时。
- **理由**：个人设备不是公用设施，不存在"租用"语义。
- **影响**：删除设计中所有"可共享 / 租约 / fencing"相关表述。

### D-27 contextId：quest 级

- **决策**：一个 quest 分配一个 `contextId`，其下所有 party 共享。
- **理由**：语义最接近"一次委托"；A2A 的 history 才有意义。
- **代价**：一个 quest 多队竞标时历史会混在一起（本期不支持多队竞标）。
- **影响**：`GuildQuest` 增加 `contextId` 字段。

### D-28 双签名：意图归 agent，证据归设备

- **决策**：agent 签意图（`INTENT_TO_ACT`），设备签执行证明（`ACTION_EXECUTED`），两者分离。
- **理由**：只签一边都会缺证据——要么"没经过授权"，要么"没真的发生"。
- **影响**：`metadata.guild.attestation` 结构、`runtime/src/a2a/sign.ts`。

### D-29 设备度量与身份的关系

- **决策**：设备有独立 DID（D-09），但**信誉记在设备自己名下**，不回灌 agent 的信誉。
- **理由**：设备的可靠性是设备的属性，agent 的质量是模型的属性，混在一起两个都失真。
- **影响**：`DeviceReputation` 独立表。

---

## 6. 待办与风险

### 待办

| # | 事项 | 阻塞什么 | 备注 |
|---|---|---|---|
| T-01 | 买主域名（如 `guild.example.com`） | **生产环境**，不阻塞开发 | 开发期用 `did:web:localhost%3A3001` |
| T-02 | 选定锚定链（Base / Solana / 其他低费链） | D-24 的后续 | 现在只留接口 |
| T-03 | 旧信封兼容期时长 | 阶段 3 排期 | 建议 6 个月 |
| T-04 | 设备注册的配额与清理 | D-09 | 防止 DID 数量无限增长 |
| T-05 | 审计日志保留期 | 合规 | 建议 ≥ 1 年 |

### 风险

| # | 风险 | 影响 | 缓解 |
|---|---|---|---|
| R-01 | 协会托管域名与 did.json | 主权削弱，理论上可分裂视图（对不同验证者返回不同文档） | 会员签名日志 + 对外提供 proof；后续可加第三方见证 |
| R-02 | 日志运营方可以拒绝写入 | 审查，但可被发现 | 对外公布"未写入申请"计数；后续支持多日志镜像 |
| R-03 | 助记词丢失 | 身份永久失效 | 注册时强制确认；提供"密钥托管"作为可选项（默认关闭） |
| R-04 | `eddsa-rdfc-2022` 的 JSON-LD 依赖 | 构建体积、context 变更风险 | 固化 context、锁版本、不远程拉取 |
| R-05 | 单实例部署 | 无高可用 | v3 再解决 |

---

## 7. 阶段 0 任务清单（由以上决策直接推出）

1. **基础设施**
   - [ ] migration runner（D-06）
   - [ ] repository 层骨架（D-01）
2. **身份**
   - [ ] Ed25519 密钥生成与 JWK 导入导出（D-11 基础）
   - [ ] 子域分配 + did.json 生成（D-08）
   - [ ] `did:web` 解析器（含本地开发模式）（D-07）
   - [ ] 会员挑战-应答认证
   - [ ] 助记词生成与恢复（D-11）
3. **日志**
   - [ ] append-only 日志存储（D-21）
   - [ ] 会员签名校验（D-22）
   - [ ] Merkle 树 + inclusion proof（D-21）
   - [ ] `AnchorProvider` 空实现（D-24）
4. **客户端**
   - [ ] `guildctl keygen / join / status`（D-03）
5. **工程**
   - [ ] 修 CI（当前 `deploy.yml` 引用不存在的 `server/`）
   - [ ] 三仓基线 commit
   - [ ] 金向量测试：Ed25519、Merkle proof、did:web 解析

**验收标准**：`guildctl join` 能完成「生成密钥 → 提交公钥 → 协会分配子域并发布 did.json → 日志追加一条会员签名记录 → 客户端拉取 proof 并本地验证通过」的完整闭环。

---

## 附：被本文取代的旧表述

`docs/IDENTITY_A2A_V2.md` 中以下内容已过时，重写 v2.1 时删除或改写：

| 旧表述 | 现状 |
|---|---|
| `did:guild` 为默认方法，双方法并存 | 只保留 `did:web`（D-07） |
| 成员自托管 did.json | 协会分配子域（D-08） |
| 设备是 agent DID 下的 key | 设备有独立 DID（D-09） |
| `guild-verify.json` 验证域名归属 | 废弃（D-18） |
| jurisdiction 三档 | 两档（D-20） |
| 设备可跨 agent 分时共享 | 不做（D-26） |
| `eddsa-jcs-2022` | 改为 `eddsa-rdfc-2022`（D-15） |
| 状态列表阶段 2 再补 | 阶段 1 就做（D-16） |
| 成员三档（含 EXTERNAL） | 两档：成员 / 访客（D-17） |
| 执行证明含 `executedAt` | 改为只签 `seq`（D-13） |
