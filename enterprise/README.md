# Enterprise Guild Branch

> 企业级多 Agent 协作控制层。目标是把 Adventurer's Guild 从社区/任务原型升级为可嵌入复杂企业体系的通用方法论与工程骨架。

## Why This Branch Exists

现有 Adventurer's Guild 已经证明了一个核心模型：人类、个人 Agent、自由 Agent 和服务 Agent 可以围绕 `Member / Agent / Quest / Party / Delegation / Reputation` 协作。

企业版分支要解决的是另一个层级的问题：

- 企业已有大量系统，不能被简单替换。
- 企业已有复杂权限、组织、审计、合规和数据边界。
- 不同部门会有不同 Agent 体系，它们需要共同协议，而不是共享同一个运行时。
- 企业提效来自端到端流程压缩，不只是单个 Agent 生成内容更快。

因此，企业版不是一个“更大的任务看板”，而是一个多 Agent 协作控制层：

```txt
Enterprise Systems + Human Teams + Agent Runtimes
                 |
                 v
        Enterprise Guild Control Plane
                 |
  identity, delegation, work routing, party formation,
  agent-to-agent coordination, audit, reputation, governance
```

## Core Positioning

Enterprise Guild should become the coordination layer between human organizations and agent organizations.

It should not own every enterprise record. It should coordinate records owned by existing systems:

- Jira, Linear, GitHub, GitLab
- ServiceNow, Zendesk, Freshservice
- Salesforce, HubSpot
- SAP, Oracle, NetSuite
- Slack, Teams, DingTalk, Feishu
- Confluence, Notion, SharePoint, Google Drive
- internal data platforms and approval systems

## Enterprise Mapping

| Guild concept | Enterprise concept |
| --- | --- |
| Member | employee, team, vendor, client representative |
| Agent | personal agent, department agent, system agent, external service agent |
| Quest | work item, ticket, project, approval, incident, deal, request |
| Party | temporary cross-functional execution group |
| Delegation | scoped authority granted to an agent |
| Reputation | reliability, quality, SLA, audit, policy compliance |
| Party Beacon | dynamic request for help or capability matching |
| Guild A2A | standard envelope for agent-to-agent coordination |

## Branch Structure

```txt
enterprise/
  README.md
  ARCHITECTURE.md
  METHODOLOGY.md
  ADAPTATION_PLAYBOOK.md
  A2A_GOVERNANCE_PROFILE.md
  PROBLEM_LAB.md
  ROADMAP.md
  examples/
    support-incident-flow.md
  src/
    domain.ts
    kernel.ts
```

## Design Principles

1. Integrate, do not replace.
2. Treat identity and delegation as first-class objects.
3. Keep enterprise source-of-truth systems authoritative.
4. Make every autonomous action explainable and auditable.
5. Build around work lifecycle, not chat.
6. Use agents as participants in governed workflows, not hidden scripts.
7. Support multiple companies by separating method, policy, connector, and runtime.

## Expected Enterprise Impact

The realistic target is not universal “10x employees”. The target is measurable compression in coordination-heavy workflows.

Typical early targets:

- 20%-40% shorter cross-department cycle time.
- 30%-70% less repetitive status collection, routing, reporting, and handoff work.
- 1.5x-3x local throughput in support, IT operations, data operations, delivery operations, and software delivery workflows.
- Better auditability and lower operational risk for Agent-assisted work.

## Next Development Direction

The enterprise branch should evolve in this order:

1. Enterprise domain model.
2. Connector contract and source-of-truth policy.
3. Delegation and governance engine.
4. Work routing and party formation kernel.
5. A2A-compatible enterprise governance profile.
6. Enterprise admin console and observability.
7. Reference connectors for one pilot workflow.
