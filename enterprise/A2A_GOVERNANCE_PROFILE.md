# Enterprise A2A Governance Profile

> Enterprise Guild uses the public A2A protocol as the interoperability base, then adds an enterprise governance profile for authorization, workflow context, audit, reputation, and human approval.

## Position

Google's Agent2Agent protocol is a strong wire-level and interaction-level foundation:

- agent discovery through Agent Cards
- capability and skill description
- task lifecycle
- message exchange
- artifacts and structured data parts
- streaming updates
- push notifications
- standard web security schemes
- extension points

But enterprise multi-agent systems need more than interoperability. They need governed interaction.

When many enterprise nodes are agents, the protocol must answer:

- Who is this agent acting for?
- Which enterprise actor delegated this action?
- Which work item or business record is this action bound to?
- Which source-of-truth system owns the record?
- Which data class is involved?
- Which policy allowed or denied the action?
- Is human approval required before execution?
- What evidence did the agent use?
- What commitment did the agent make?
- How is failure, rollback, or escalation handled?
- How does this action affect reputation and reliability?

A2A should carry the conversation. Enterprise Guild should govern the consequences.

## Design Rule

Do not fork A2A unless absolutely necessary.

Use A2A-compatible messages, tasks, artifacts, Agent Cards, and extensions. Put Enterprise Guild governance metadata in a stable extension namespace.

Suggested extension URI:

```txt
https://adventurers-guild.dev/extensions/enterprise-governance/v1
```

## Missing Enterprise Layers

### 1. Delegation Binding

Every meaningful action must be bound to a delegation grant.

Required fields:

- `delegationGrantId`
- `grantorActorId`
- `granteeAgentId`
- `scopes`
- `approvalMode`
- `expiresAt`

### 2. Work Context Binding

Every work-related message should be bound to an enterprise work item.

Required fields:

- `workItemId`
- `sourceSystem`
- `sourceType`
- `sourceId`
- `sourceUrl`
- `sourceOfTruth`

### 3. Policy Decision Binding

Every requested action should carry or produce a policy decision.

Required fields:

- `policyDecisionId`
- `requestedScope`
- `decision`
- `reasons`
- `evaluatedAt`

### 4. Human Approval Binding

For approval-gated actions, the protocol must represent pending approval and approval results.

Required fields:

- `approvalRequestId`
- `requiredApproverActorIds`
- `approvalStatus`
- `approvedByActorId`
- `approvedAt`

### 5. Audit Binding

Every message that changes enterprise state must map to an audit event.

Required fields:

- `auditEventId`
- `actorId`
- `agentId`
- `action`
- `target`
- `timestamp`
- `evidenceRefs`

### 6. Commitment Semantics

Agents need to distinguish weak suggestions from actual commitments.

Commitment levels:

- `OBSERVATION`
- `RECOMMENDATION`
- `DRAFT`
- `INTENT_TO_ACT`
- `APPROVAL_REQUESTED`
- `ACTION_EXECUTED`
- `COMMITMENT_MADE`

### 7. Failure And Escalation Semantics

Enterprise A2A should standardize failure shape.

Failure classes:

- `POLICY_DENIED`
- `APPROVAL_REQUIRED`
- `AUTHENTICATION_FAILED`
- `DELEGATION_EXPIRED`
- `DATA_CLASS_FORBIDDEN`
- `SOURCE_SYSTEM_ERROR`
- `AGENT_UNAVAILABLE`
- `UNSAFE_ACTION`
- `HUMAN_ESCALATION_REQUIRED`

## Enterprise A2A Metadata Shape

This is the minimum governance payload to attach through A2A extension metadata or structured data parts.

```ts
export interface EnterpriseA2AGovernanceMetadata {
  enterprise: {
    tenantId: string;
    workItemId?: string;
    partyId?: string;
    source?: {
      system: string;
      type: string;
      id: string;
      url?: string;
      sourceOfTruth: 'EXTERNAL_SYSTEM' | 'ENTERPRISE_GUILD';
    };
    delegation?: {
      delegationGrantId: string;
      grantorActorId: string;
      granteeAgentId: string;
      scopes: string[];
      approvalMode: string;
    };
    policy?: {
      policyDecisionId?: string;
      requestedScope: string;
      decision?: 'ALLOW' | 'ALLOW_WITH_APPROVAL' | 'DENY';
      reasons?: string[];
    };
    approval?: {
      approvalRequestId?: string;
      status?: 'NOT_REQUIRED' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
      requiredApproverActorIds?: string[];
      approvedByActorId?: string;
    };
    audit?: {
      auditEventId?: string;
      correlationId: string;
      causationId?: string;
      evidenceRefs?: string[];
    };
    risk?: {
      dataClass: 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED' | 'SECRET';
      policyTags: string[];
      commitmentLevel: string;
    };
  };
}
```

## Interaction Types

Enterprise Guild should standardize these A2A task/message types:

| Type | Purpose |
| --- | --- |
| `enterprise.work.inspect` | Ask an agent to inspect a work item. |
| `enterprise.work.summarize` | Ask for a summary with evidence. |
| `enterprise.work.route` | Ask for routing or party recommendation. |
| `enterprise.party.invite` | Invite an actor or agent into a work party. |
| `enterprise.party.accept` | Accept a party role. |
| `enterprise.action.draft` | Draft an action without executing it. |
| `enterprise.action.requestApproval` | Ask a human to approve an action. |
| `enterprise.action.execute` | Execute a delegated action. |
| `enterprise.action.result` | Report execution result. |
| `enterprise.escalate` | Escalate to a human owner. |
| `enterprise.audit.append` | Append or reference an audit event. |

## Agent Card Requirements

Every enterprise Agent Card should declare:

- enterprise owner
- runtime provider
- supported skills
- supported enterprise extension URI
- supported data classes
- allowed source systems
- autonomy level
- human escalation contact
- policy endpoint or governance endpoint

Example enterprise extension section:

```json
{
  "extensions": [
    {
      "uri": "https://adventurers-guild.dev/extensions/enterprise-governance/v1",
      "required": true,
      "params": {
        "ownerActorId": "actor-it-ops-lead",
        "autonomy": "APPROVAL_GATED",
        "allowedDataClasses": ["INTERNAL", "CONFIDENTIAL"],
        "allowedSystems": ["servicenow", "slack"],
        "governanceEndpoint": "https://guild.example.com/api/governance/evaluate"
      }
    }
  ]
}
```

## Enterprise Message Flow

```txt
1. Agent A discovers Agent B through Agent Card.
2. Agent A opens or continues an A2A task.
3. Agent A attaches Enterprise Governance metadata.
4. Enterprise Guild evaluates delegation and policy.
5. If allowed, Agent B performs the requested work.
6. If approval is required, Enterprise Guild creates approval request.
7. Agent B returns artifacts, evidence, and action result.
8. Enterprise Guild appends audit events and updates reputation.
9. Source connector mutates external system only after policy allows it.
```

## Protocol Completeness Target

A2A alone is sufficient for:

- discovering agents
- exchanging messages
- managing agent tasks
- returning artifacts
- streaming progress
- interop between agent runtimes

Enterprise A2A Governance Profile is required for:

- enterprise authorization
- delegation proof
- source system mutation safety
- human approval
- auditability
- cross-agent accountability
- incident response
- reputation and reliability scoring

## Implementation Plan

1. Keep A2A compatibility as a hard requirement.
2. Add `EnterpriseA2AGovernanceMetadata` to the domain model.
3. Map current `EnterpriseA2AEnvelope` to A2A task/message metadata.
4. Add policy evaluation before every `enterprise.action.execute`.
5. Add audit correlation IDs to every message.
6. Add approval request state for gated actions.
7. Add test fixtures for A2A-compatible enterprise messages.
8. Later, expose a real A2A Agent Card for Enterprise Guild itself.

