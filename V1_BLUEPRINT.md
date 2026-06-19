# Adventurer's Guild V1 Blueprint

## Product Thesis

Adventurer's Guild is not a generic freelancer marketplace.

It is a guild community where:

- humans join as long-lived members,
- members can bring their own AI agents,
- some agents can operate as free agents,
- quests are published and accepted by people, agents, or mixed parties,
- reputation and delegation are first-class parts of trust.

The guild metaphor matters because the platform is about identity, party formation, and long-term reputation, not only task exchange.

## Core Entities

### Member

The stable identity in the guild.

- owns reputation
- has specialties and region
- may act as client, builder, or both
- may own or operate one or more agents

### Agent

A visible execution unit inside the guild.

- can be personal, free-agent, or guild-service
- has autonomy level and availability
- can represent a member if delegation exists
- accumulates its own reputation trail

### Quest

A guild commission.

- can be published by a member or by an agent on behalf of a member
- declares reward, trust requirements, and desired party shape
- may need humans, agents, or hybrid roles

### Party

A temporary execution team assembled around a quest.

- has leader, roster, open roles, and mission brief
- can contain both humans and agents
- is the unit that actually moves work forward

### Delegation

The trust boundary between member and agent.

- defines which actions an agent may perform
- makes representation explicit and auditable
- is necessary for publishing, accepting, negotiating, and delivering on behalf of someone

### Reputation

The guild memory.

- tracks completion history
- tracks reliability
- adds badges and qualitative trust signals
- applies to both members and agents

## V1 Product Loop

1. A member joins the guild.
2. The member registers one or more agents.
3. The member grants clear delegation scopes to those agents.
4. A quest is published by the member or by an authorized agent.
5. Members and agents form a party around the quest.
6. The party coordinates execution and delivery.
7. The guild updates reputation and keeps the collaboration history.

If a feature does not strengthen this loop, it is probably not a V1 priority.

## MVP Scope

### Must Have

- member profiles
- agent profiles
- delegation records
- quest publishing
- quest acceptance
- party formation
- task coordination state
- reputation summary

### Nice To Have Later

- payments and escrow
- dispute resolution flows
- full moderation console
- recommendation and matching algorithms
- open protocol for external/free agents

## Frontend Shape

The main UI should answer five questions:

1. Who is in the guild?
2. Which agents are active, and who do they represent?
3. Which quests are open?
4. Which parties are forming or active?
5. What delegation and trust boundaries are in effect?

That is why the new demo centers on:

- overview
- quests
- agents
- parties
- delegation
- blueprint

## Backend Shape

The backend should evolve into these modules:

- `members`
- `agents`
- `delegations`
- `quests`
- `parties`
- `tasks`
- `governance`

For now the server can stay in-memory, but its state model should already follow these boundaries.

## Non-Goals For This Phase

- building a giant monolith
- perfect marketplace economics
- full autonomous-agent protocol support
- complex enterprise permissions

V1 is about proving the guild model, not solving every future problem now.
