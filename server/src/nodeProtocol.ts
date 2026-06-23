import { GuildNodeProtocolPacket } from './types';

export function buildGuildNodeProtocolPacket(): GuildNodeProtocolPacket {
  return {
    name: 'Adventurer\'s Guild Node Protocol',
    version: 'v1',
    thesis:
      'A BLE-first path for lightweight devices to report local context and receive guild actions through a phone or desktop gateway.',
    transport: {
      gatewayToServer: 'HTTP_JSON',
      nodeToGateway: 'BLE_JSON',
    },
    endpoints: {
      protocol: '/api/node-protocol',
      guildSnapshot: '/api/guild-snapshot',
      agentJoin: '/api/agent/applications',
      a2aRelay: '/api/a2a/relay',
    },
    messages: {
      registerGateway: {
        type: 'register_gateway',
        gatewayId: 'phone-gateway-001',
        displayName: 'Guild Phone Gateway',
        capabilities: ['ble-scan', 'node-relay', 'local-notifications'],
      },
      registerNode: {
        type: 'register_node',
        nodeId: 'cardputer-001',
        gatewayId: 'phone-gateway-001',
        displayName: 'Desk Cardputer Node',
        capabilities: ['status-display', 'quick-reply', 'presence-signal'],
      },
      nodeEvent: {
        type: 'node_event',
        nodeId: 'cardputer-001',
        event: 'presence_changed',
        payload: {
          status: 'available',
          batteryPercent: 86,
        },
      },
      nodeAction: {
        type: 'node_action',
        nodeId: 'cardputer-001',
        action: 'display_message',
        payload: {
          title: 'Quest update',
          body: 'A party is forming and needs review.',
        },
      },
    },
  };
}
