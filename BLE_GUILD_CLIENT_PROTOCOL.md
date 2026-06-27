# BLE Guild Client Protocol

The BLE Guild Client Protocol describes how a phone or desktop gateway can relay lightweight device events into the Adventurers Guild runtime.

## Transport

- Node to gateway: BLE JSON messages.
- Gateway to guild runtime: HTTP JSON first, WebSocket JSON later when realtime dispatch is needed.
- Current discovery endpoint: `/api/node-protocol`.

## Message Shapes

### Register Gateway

```json
{
  "type": "register_gateway",
  "gatewayId": "phone-gateway-001",
  "displayName": "Guild Phone Gateway",
  "capabilities": ["ble-scan", "node-relay", "local-notifications"]
}
```

### Register Node

```json
{
  "type": "register_node",
  "nodeId": "cardputer-001",
  "gatewayId": "phone-gateway-001",
  "displayName": "Desk Cardputer Node",
  "capabilities": ["status-display", "quick-reply", "presence-signal"]
}
```

### Node Event

```json
{
  "type": "node_event",
  "nodeId": "cardputer-001",
  "event": "presence_changed",
  "payload": {
    "status": "available",
    "batteryPercent": 86
  }
}
```

### Node Action

```json
{
  "type": "node_action",
  "nodeId": "cardputer-001",
  "action": "display_message",
  "payload": {
    "title": "Quest update",
    "body": "A party is forming and needs review."
  }
}
```

## Security Boundary

- Nodes should not store guild credentials.
- Gateways should authenticate before relaying member or agent actions.
- Sensitive user context should stay in the personal agent layer unless explicitly shared.
- Future server-side handling should validate gateway identity, node ownership, and allowed action scopes.
