# Enterprise Adaptation Playbook

This playbook describes how to adapt Enterprise Guild to a specific company without rewriting the core method each time.

## Step 1: Define The Enterprise Boundary

Capture:

- company or business unit
- departments included in the pilot
- systems included in scope
- data classes allowed
- excluded high-risk domains
- executive owner
- operational owner
- security owner

Do not start with all systems. Start with one workflow and one or two source systems.

## Step 2: Build The Source-of-Truth Map

For each system:

| Field | Example |
| --- | --- |
| System | ServiceNow |
| Native object | Incident |
| Owner | IT Operations |
| Mutations allowed | status update, internal comment |
| Mutations gated | external customer comment, closure |
| Source link | incident URL |
| Audit source | ServiceNow audit log plus Enterprise Guild audit |

Enterprise Guild should store coordination metadata and references, not silently duplicate the business record.

## Step 3: Create The Agent Registry

Classify agents:

- personal agent
- department agent
- workflow service agent
- connector agent
- external vendor agent
- guild steward agent

For each agent define:

- owner
- runtime
- capabilities
- allowed systems
- data access class
- autonomy level
- escalation owner
- kill switch owner

## Step 4: Create The Delegation Matrix

Use a matrix like this:

| Grantor | Agent | Scope | Systems | Approval | Expiration |
| --- | --- | --- | --- | --- | --- |
| IT Ops Lead | Incident Triage Agent | route, summarize, draft internal comment | ServiceNow, Slack | no approval for drafts | 90 days |
| Support Manager | Customer Escalation Agent | draft external reply | Zendesk, Salesforce | human approval required | 30 days |

No production enterprise version should rely on implicit trust.

## Step 5: Normalize Work

Each connector converts native objects into an `EnterpriseWorkItem`.

Keep:

- source system ID
- source URL
- native status
- source owner
- current assignees
- required capabilities
- data classification
- policy tags
- synchronization timestamp

## Step 6: Define Party Templates

Examples:

### Customer Escalation Party

- support owner
- account owner
- product expert
- support agent
- knowledge retrieval agent
- reply drafting agent

### IT Incident Party

- incident commander
- service owner
- on-call engineer
- observability agent
- runbook agent
- communications agent

### Software Delivery Party

- product owner
- engineer
- reviewer
- CI agent
- documentation agent
- release coordinator agent

## Step 7: Start With Draft-First Autonomy

The safest enterprise rollout order:

1. read
2. summarize
3. recommend
4. draft
5. route
6. update internal state
7. trigger low-risk actions
8. perform approval-gated external actions
9. perform scoped autonomous actions

## Step 8: Measure The Pilot

Baseline before automation:

- average cycle time
- waiting time
- handoff count
- comments per item
- meetings per item
- SLA misses
- reopened items
- manual report hours

Compare after Enterprise Guild pilot:

- cycle time reduction
- manual coordination reduction
- SLA improvement
- quality score
- user trust score
- policy block count
- incident count

## Step 9: Generalize

After one successful pilot, extract:

- connector patterns
- work schema extensions
- delegation templates
- party templates
- policy gates
- dashboards

Then adapt to the next workflow without changing the kernel unless a new universal concept is discovered.

