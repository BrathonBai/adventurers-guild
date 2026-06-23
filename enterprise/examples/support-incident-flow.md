# Example: Support Incident Enterprise Guild Flow

## Scenario

A strategic customer reports a serious product issue. The current enterprise process requires support, account management, product, engineering, and operations to coordinate across several tools.

Enterprise Guild turns the incident into a governed work party.

## Source Systems

- Zendesk or ServiceNow: incident source of truth.
- Salesforce: customer and account context.
- Slack or Teams: human coordination.
- GitHub or Jira: engineering follow-up.
- Knowledge base: previous fixes and runbooks.

## Work Item

```json
{
  "sourceSystem": "servicenow",
  "sourceType": "incident",
  "sourceId": "INC-10428",
  "title": "Strategic customer cannot complete checkout",
  "priority": "P1",
  "dataClass": "CONFIDENTIAL",
  "requiredCapabilities": ["support_triage", "account_context", "backend_debugging", "customer_comms"],
  "policyTags": ["customer_impact", "external_comms_approval_required"]
}
```

## Party Template

- human support owner
- account owner
- engineering owner
- support triage agent
- knowledge retrieval agent
- engineering investigation agent
- customer response drafting agent

## Delegation Rules

- support triage agent may summarize and route without approval.
- knowledge retrieval agent may read approved knowledge sources.
- customer response drafting agent may draft external replies but cannot send them.
- engineering investigation agent may create a Jira issue but cannot change production.
- any customer-facing message requires human approval.

## Flow

1. Connector ingests the P1 incident.
2. Work routing classifies required capabilities.
3. Party formation creates a customer escalation party.
4. Agents collect account context, previous incidents, and likely failure areas.
5. Human owners receive a concise situation brief.
6. Engineering agent drafts a linked Jira issue.
7. Customer response agent drafts an update.
8. Human support owner approves the external update.
9. Audit log records every agent action and approval.
10. Outcome updates reliability and workflow metrics.

## Pilot KPIs

- time to first useful summary
- time to correct owner assignment
- time to first customer update
- handoff count
- reopened incident count
- policy violations
- human trust score

