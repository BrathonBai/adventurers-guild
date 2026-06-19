# Migration Strategy From Guild Prototype To Enterprise Guild

This file defines how the current Adventurer's Guild prototype can evolve into the enterprise branch without forcing a risky big-bang rewrite.

## Starting Point

Current prototype strengths:

- stable conceptual model for members, agents, quests, parties, delegations, and reputation
- onboarding flow for agents
- guild snapshot API
- Party Beacon discovery model
- DID-shaped identity references
- A2A message envelope
- audit and local persistence foundations

Current prototype limitations for enterprise use:

- prototype authentication and authorization
- local-first runtime assumptions
- limited connector model
- no enterprise source-of-truth boundary
- no signed A2A messages
- no multi-tenant or data classification model
- no production policy engine

## Migration Principle

Do not migrate screens first. Migrate the domain boundary first.

The enterprise branch should first become a clean coordination kernel. UI, connectors, and automation can then attach to that kernel.

## Concept Mapping

| Current prototype | Enterprise branch | Migration note |
| --- | --- | --- |
| `GuildMemberRecord` | `EnterpriseActor` | Expand from guild member to human/team/service/external actor. |
| `GuildAgentProfile` | `EnterpriseAgent` | Add runtime, owner, allowed systems, allowed data classes. |
| `GuildQuest` | `EnterpriseWorkItem` | Convert quest into source-linked enterprise work envelope. |
| `Party` | `EnterpriseWorkParty` | Keep temporary execution team concept. |
| `GuildDelegationRecord` | `DelegationGrant` | Add systems, data classes, approval mode, expiration. |
| `GuildA2AMessage` | `EnterpriseA2AEnvelope` | Add policy tags, delegation binding, nonce/signature fields. |
| `GuildSnapshotRecord` | `EnterpriseRuntimeSnapshot` | Expand snapshot for governance and policy decisions. |
| `GuildState` | `EnterpriseGuildKernel` implementation | Split state, policies, connectors, and audit. |

## Recommended Refactor Sequence

### Step 1: Keep The Old Prototype Running

The original app should remain intact while enterprise work evolves under `/enterprise`.

Reason:

- the current prototype is useful as a product metaphor and demo
- enterprise concepts need room to change
- premature coupling will slow exploration

### Step 2: Build An In-Memory Enterprise Kernel

Implement `EnterpriseGuildKernel` in a new file such as:

```txt
enterprise/src/InMemoryEnterpriseGuildKernel.ts
```

The first implementation should support:

- actor registration
- agent registration
- delegation grants
- work item ingestion
- party template registration
- simple party formation
- policy evaluation
- audit append
- snapshot generation

### Step 3: Add Policy Evaluation Before Connectors

Before any real source system connector can mutate enterprise systems, policy checks must exist.

Minimum policy checks:

- agent exists and is active
- delegation exists and is active
- requested scope is granted
- source system is allowed
- data classification is allowed
- approval mode is respected

### Step 4: Add Mock Connectors

Create mock connectors before real enterprise connectors.

Useful mock connector shapes:

- ticket connector
- CRM connector
- code issue connector
- approval connector
- communication connector

Mock connectors let the kernel mature without requiring enterprise credentials.

### Step 5: Add One Real Pilot Connector

Only after the kernel, policy, and audit path are stable should a real connector be added.

Best first connector candidates:

- Jira issue ingestion
- GitHub issue ingestion
- ServiceNow incident ingestion
- Slack/Teams notification

Avoid first:

- ERP writeback
- payment systems
- production infrastructure mutation
- external customer messaging without approval

### Step 6: Build Enterprise Admin Views

The admin console should expose:

- actor directory
- agent registry
- delegation matrix
- work graph
- party formation state
- policy decisions
- audit events
- pilot KPI dashboard

### Step 7: Retire Or Merge Prototype Concepts Gradually

When enterprise kernel proves stable:

- keep guild metaphor in product language where useful
- use enterprise domain model in code
- keep current demo as a sandbox or community mode
- avoid making enterprise code depend on demo seed data

## Boundaries To Preserve

### Source Systems Own Business Records

Enterprise Guild may cache summaries and references, but source systems own the canonical business state.

### Enterprise Guild Owns Coordination State

It should own:

- party formation
- delegation grants
- policy decisions
- agent coordination
- audit overlay
- routing recommendations

### Humans Own High-Risk Decisions

Human approval must remain required for:

- external commitments
- legal/financial actions
- production changes
- security incident decisions
- restricted data expansion
- reputation-impacting sanctions

## First Engineering Milestone

The next code milestone should be:

```txt
enterprise/src/InMemoryEnterpriseGuildKernel.ts
enterprise/src/__tests__/kernel.test.ts
```

Test cases:

- register actor and agent
- grant delegation
- ingest work item
- deny action without delegation
- allow action with matching delegation
- create party from template
- append audit events
- create snapshot

