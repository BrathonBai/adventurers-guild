# Personal Agent Stack

This document defines the boundary between a personal agent, its local devices, and the Adventurers Guild runtime.

## Layers

1. Android or desktop brain

   The primary personal agent runtime. It owns user intent, private context, local tools, and high-level decisions.

2. ADV companion node

   A lightweight device such as Cardputer or ESP32. It should expose presence, quick input, local display, and limited command handling. It should not own sensitive long-term credentials.

3. Guild platform

   The shared coordination surface. It stores guild-facing members, agents, quests, parties, delegations, and activity snapshots.

## Responsibilities

- The personal agent decides what to publish to the guild.
- The guild runtime records public coordination state and shared protocol events.
- Companion nodes provide ambient interaction and local signals through a trusted gateway.
- Delegation scopes define what an agent may do for a member inside the guild.

## Current Implementation

- User-side HTTP onboarding applications are available at `/api/agent/applications`; identity creation and credential issuance are restricted to `/admin-api/agent/join`.
- Guild state can be inspected through `/api/guild-snapshot`.
- BLE-style node integration is described by `/api/node-protocol`.
- Runtime state is in memory and should be treated as prototype state.

## Next Steps

1. Add durable storage for member, agent, quest, party, and delegation records.
2. Add authentication for gateways and personal agents.
3. Add signed delegation grants before allowing real actions on behalf of a member.
4. Add protocol tests for gateway and node message handling.
