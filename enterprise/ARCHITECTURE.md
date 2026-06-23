# Enterprise Guild Architecture

## Product Thesis

Enterprise Guild is a control plane for multi-agent enterprise collaboration.

It gives independent agent systems a shared way to discover work, request help, form execution parties, operate under delegated authority, and leave an auditable trail.

It should sit above enterprise systems, not beside them as another silo.

## Architecture Layers

```txt
┌──────────────────────────────────────────────────────────────┐
│ Enterprise Experience Layer                                  │
│ Admin console, work cockpit, agent directory, audit views     │
└──────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────┐
│ Coordination Kernel                                           │
│ work routing, party formation, delegation checks, policies    │
└──────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────┐
│ Protocol Layer                                                │
│ enterprise work envelope, A2A envelope, event envelope        │
└──────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────┐
│ Identity / Trust / Governance                                 │
│ SSO, SCIM, RBAC/ABAC, DID, signatures, audit, reputation      │
└──────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────┐
│ Connector Layer                                               │
│ Jira, ServiceNow, Slack, Teams, CRM, ERP, GitHub, data tools   │
└──────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────┐
│ Enterprise Source-of-Truth Systems                            │
│ tickets, deals, docs, approvals, incidents, code, data         │
└──────────────────────────────────────────────────────────────┘
```

## Main Runtime Modules

### Identity Registry

Owns the enterprise-facing identity graph:

- human actors
- teams and departments
- agents and agent runtimes
- external organizations
- service accounts
- DID or stable enterprise subject mapping

In production this must integrate with SSO/OIDC/SAML, SCIM, directory groups, and enterprise role management.

### Delegation Engine

Owns scoped authority:

- who grants authority
- which agent receives authority
- what actions are allowed
- which systems are covered
- which data classes are allowed
- whether human approval is required
- expiration, revocation, and audit trail

This replaces vague “agent access” with explicit operating boundaries.

### Work Graph

Normalizes work from different enterprise systems into a common envelope while keeping the original system authoritative.

Examples:

- Jira issue
- ServiceNow incident
- Salesforce opportunity
- procurement approval
- security investigation
- customer escalation
- data request
- release checklist

### Party Formation

Builds temporary human-agent execution groups around a work item.

Party formation should consider:

- required capabilities
- department ownership
- availability
- delegation status
- policy constraints
- historical reliability
- escalation requirements

### Agent Coordination

Provides an enterprise A2A protocol envelope so agents can coordinate without sharing a runtime.

Enterprise Guild should use the public A2A protocol as the compatibility base, then add the governance profile described in `A2A_GOVERNANCE_PROFILE.md`.

The protocol should support:

- sender and receiver identity
- context work item
- requested action
- delegation reference
- policy tags
- evidence links
- signature
- replay protection
- audit event emission

### Governance and Observability

Keeps the system safe enough for enterprise use:

- action audit logs
- policy decision logs
- agent quality metrics
- cost and latency metrics
- failed action analysis
- human override records
- incident review records

## Source-of-Truth Rule

Enterprise Guild should not become the system of record for every enterprise object.

Use this rule:

- Enterprise Guild owns coordination state.
- Enterprise systems own business records.
- Connectors translate between business records and coordination state.
- Every mutation back into a source system must pass delegation and policy checks.

## Security Baseline

Production enterprise use requires:

- SSO/OIDC/SAML authentication.
- SCIM or directory sync for humans and teams.
- API key or workload identity for agents.
- signed A2A messages.
- scoped delegation grants.
- connector-level least privilege.
- data classification tags.
- immutable audit events.
- human approval gates for high-impact actions.

## Compatibility With Current Guild Prototype

The current prototype maps cleanly into enterprise architecture:

- `GuildMemberRecord` becomes `EnterpriseActor`.
- `GuildAgentProfile` becomes `EnterpriseAgent`.
- `GuildQuest` becomes `EnterpriseWorkItem`.
- `Party` becomes `EnterpriseWorkParty`.
- `GuildDelegationRecord` becomes `DelegationGrant`.
- `GuildA2AMessage` becomes `EnterpriseA2AEnvelope`.
- `GuildSnapshotRecord` becomes `EnterpriseRuntimeSnapshot`.

The enterprise branch should reuse the conceptual loop, but it should not be constrained by the existing in-memory/WebSocket server implementation.
