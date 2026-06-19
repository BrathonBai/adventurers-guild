# Enterprise Guild Methodology

This methodology is the reusable consulting and engineering playbook for adapting Enterprise Guild to different companies.

It separates the universal method from company-specific configuration.

## Phase 1: Enterprise Work Discovery

Goal: find workflows where coordination cost is high and Agent assistance is safe enough to pilot.

Inputs:

- organization map
- major systems map
- ticket/project/work queues
- approval flows
- incident and escalation flows
- communication channels
- known bottlenecks

Outputs:

- workflow inventory
- candidate pilot list
- source-of-truth map
- risk classification
- expected value hypothesis

Selection criteria:

- high volume
- repeated routing or summarization
- frequent cross-team handoff
- measurable cycle time
- clear ownership
- low to medium irreversible risk

## Phase 2: Identity and Authority Modeling

Goal: define who can act, which agents exist, and what they may do.

Outputs:

- human actor model
- team and department model
- agent registry
- service account registry
- delegation matrix
- approval gate matrix

Key questions:

- Which agents are personal, departmental, service-level, or external?
- Which actions are read-only, draft-only, approval-gated, or autonomous?
- Which data classes may each agent access?
- Which actions create business, legal, financial, security, or reputation impact?

## Phase 3: Work Object Normalization

Goal: map enterprise records into a shared work envelope.

For every source system, define:

- native object type
- owner
- lifecycle states
- priority and SLA fields
- assignees and watchers
- comments and evidence links
- allowed mutations
- audit requirements

The normalized work item should include:

- enterprise ID
- source system
- title and summary
- current status
- business owner
- required capabilities
- policy tags
- data classification
- allowed agent actions
- source links

## Phase 4: Party and Routing Design

Goal: decide how work gets matched to people and agents.

Outputs:

- capability taxonomy
- routing rules
- party templates
- escalation rules
- fallback owners

Party templates describe common collaboration shapes:

- customer escalation party
- IT incident party
- software delivery party
- data analysis party
- procurement approval party
- security investigation party

## Phase 5: Policy, Governance, and Audit

Goal: ensure every Agent action is explainable, authorized, and reversible where possible.

Outputs:

- policy decision model
- approval gates
- audit schema
- incident response process
- agent suspension process
- post-action review process

Minimum policy classes:

- read
- summarize
- recommend
- draft
- route
- update status
- comment externally
- create commitment
- modify production
- spend money
- access restricted data

## Phase 6: Pilot Implementation

Goal: deploy one narrow workflow and measure real value.

Pilot structure:

- one primary workflow
- one source-of-truth system
- one communication channel
- two to five agent roles
- clear human owner
- read-only and draft-first automation at the beginning

Metrics:

- cycle time
- wait time
- number of handoffs
- manual status checks
- reopened work
- SLA misses
- human approval count
- autonomous action count
- policy block count
- agent error count

## Phase 7: Scale-Out

Goal: expand from one workflow to a reusable enterprise platform.

Scale only after the pilot proves:

- measurable workflow improvement
- low unsafe action rate
- clear ownership
- working audit trail
- acceptable user trust
- maintainable connector model

Scale dimensions:

- more workflows
- more departments
- more connectors
- more agent roles
- stronger autonomous scopes
- richer reputation model

## Enterprise Guild Maturity Model

| Level | Name | Description |
| --- | --- | --- |
| 0 | Manual | Humans coordinate through chat, meetings, and disconnected tools. |
| 1 | Assisted | Agents summarize, draft, and recommend, but humans move work. |
| 2 | Routed | Agents classify, route, and assemble parties under policy. |
| 3 | Delegated | Agents perform scoped actions with auditable delegation. |
| 4 | Orchestrated | Multiple agent systems coordinate across departments. |
| 5 | Adaptive | The enterprise continuously improves routing, policy, and party formation from outcomes. |

## Reusable Delivery Artifacts

Every enterprise adaptation should produce:

- enterprise system map
- workflow inventory
- normalized work schema
- agent registry
- delegation matrix
- connector specification
- policy gate specification
- pilot KPI dashboard
- governance operating guide
- expansion roadmap

