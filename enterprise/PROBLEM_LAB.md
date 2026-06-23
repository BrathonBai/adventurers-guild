# Enterprise A2A Problem Lab

This file records concrete failure cases that Enterprise Guild must handle before it can claim enterprise readiness.

The point is to stop discussing Agent coordination only at the architecture level. Each case should become an executable test.

## Problem 1: A Plain A2A Message Cannot Prove Authority

Scenario:

An incident-triage agent asks a customer-response agent to post an external customer update.

Plain A2A can carry the message and task. It does not, by itself, prove:

- which human or team delegated this action
- whether external customer communication is allowed
- whether human approval has happened
- which enterprise work item this message belongs to
- where the audit event should be recorded

Enterprise Guild must block the action until governance metadata is present.

## Problem 2: Agent-To-Agent Convenience Can Become Unauthorized Commitment

Scenario:

An account agent tells a customer agent: "Tell the customer we will ship the fix by Friday."

This is not just communication. It is a business commitment.

Enterprise Guild must distinguish:

- recommendation
- draft
- intent to act
- executed action
- business commitment

Business commitments require explicit policy and approval.

## Problem 3: Source Systems Need Different Mutation Rules

Scenario:

The same agent may be allowed to add an internal ServiceNow comment, but not close the incident or send an external customer reply.

Enterprise Guild must bind every action to:

- source system
- source record
- requested scope
- delegation grant
- policy decision

## Problem 4: Data Class Changes The Meaning Of The Same Action

Scenario:

Summarizing a public FAQ is low-risk. Summarizing a restricted security incident is high-risk.

The protocol must carry data classification and policy tags, not just the text.

## Problem 5: Failure Must Be Machine-Actionable

Scenario:

An agent cannot act because delegation expired.

It is not enough to return "failed". The receiving agent and the human operator need to know:

- whether retry is useful
- who can resolve it
- whether escalation is required
- whether the failure should affect reputation

## Executable Lab

The executable checks live in:

```txt
enterprise/src/problemLab.ts
enterprise/src/__tests__/problemLab.test.ts
```

The lab currently answers one question:

> Can this A2A-like message safely trigger enterprise action?

If the answer is no, the lab returns concrete governance gaps instead of vague warnings.

