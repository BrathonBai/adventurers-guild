import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import WebSocket = require('ws');
import { GuildServer } from '../GuildServer';
import { GuildState } from '../GuildState';
import { sha256Hmac, stableStringify } from '../cryptoUtils';

function makeState() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guild-state-'));
  return {
    dir,
    file: path.join(dir, 'guild-state.json'),
    state: new GuildState(path.join(dir, 'guild-state.json')),
  };
}

describe('GuildState product flows', () => {
  it('reuses member and agent identity by handle when joining again', () => {
    const { state } = makeState();

    const first = state.joinGuild({
      member: {
        displayName: 'Test Member',
        handle: '@test-member',
      },
      agent: {
        displayName: 'Test Agent',
        handle: '@test-agent',
        capabilities: ['testing'],
      },
    });

    const second = state.joinGuild({
      member: {
        displayName: 'Updated Member',
        handle: '@test-member',
      },
      agent: {
        displayName: 'Updated Agent',
        handle: '@test-agent',
        capabilities: ['testing', 'coordination'],
      },
    });

    expect(second.member?.id).toBe(first.member?.id);
    expect(second.agent.id).toBe(first.agent.id);
    expect(second.member?.did).toBe('did:guild:member:test-member');
    expect(second.agent.did).toBe('did:guild:agent:test-agent');
  });

  it('requires a registered DID to publish a party beacon', () => {
    const { state } = makeState();

    expect(() =>
      state.createPartyBeacon({
        publisherDid: 'did:guild:agent:not-real',
        title: 'Need help',
        intent: 'Find party members',
      }),
    ).toThrow('publisherDid is not a registered guild DID');
  });

  it('creates a party when a beacon response is accepted', () => {
    const { state } = makeState();
    const join = state.joinGuild({
      member: {
        displayName: 'Responder Member',
        handle: '@responder-member',
      },
      agent: {
        displayName: 'Responder Agent',
        handle: '@responder-agent',
        capabilities: ['react'],
      },
    });

    const beacon = state.createPartyBeacon({
      publisherDid: 'did:guild:agent:guild-guide',
      questId: 'QUEST-2026-001',
      title: 'Need UI builder',
      intent: 'Form the v1 UI party',
      lookingFor: ['UI builder'],
      requiredSkills: ['React'],
    });

    const response = state.respondToPartyBeacon(beacon.id, {
      responderDid: join.agent.did,
      message: 'I can help build UI.',
      offeredSkills: ['React'],
    });

    expect(response).toBeDefined();

    state.reviewPartyBeaconResponse(beacon.id, response!.id, 'ACCEPTED', beacon.publisherDid);

    const updatedBeacon = state.listPartyBeacons().find((item) => item.id === beacon.id);
    expect(updatedBeacon?.partyId).toBeDefined();

    const party = Array.from(state.parties.values()).find((item) => item.id === updatedBeacon?.partyId);
    expect(party?.members.some((member) => member.userId === join.agent.id)).toBe(true);
    expect(state.quests.get('QUEST-2026-001')?.partyId).toBe(updatedBeacon?.partyId);
  });

  it('persists and reloads guild state from disk', () => {
    const { file, state } = makeState();
    const beacon = state.createPartyBeacon({
      publisherDid: 'did:guild:agent:guild-guide',
      title: 'Persistent beacon',
      intent: 'Persist across restart',
    });

    expect(fs.existsSync(file.replace(/\.json$/, '.sqlite'))).toBe(true);

    const restored = new GuildState(file);
    expect(restored.listPartyBeacons().some((item) => item.id === beacon.id)).toBe(true);
  });

  it('resolves a guild connection URI to service endpoints', () => {
    const { state } = makeState();

    const resolution = state.resolveConnectionUri('guild://agent/guild-guide', 'http://localhost:3001');

    expect(resolution?.did).toBe('did:guild:agent:guild-guide');
    expect(resolution?.unitType).toBe('AGENT');
    expect(resolution?.profileEndpoint).toContain('/api/did/');
    expect(resolution?.partyBeaconsEndpoint).toBe('http://localhost:3001/api/party-beacons');
    expect(resolution?.a2aEndpoint).toBe('ws://localhost:3000');
  });

  it('resolves a DID document with guild profile, party beacon, and A2A services', () => {
    const { state } = makeState();

    const document = state.resolveDidDocument('did:guild:agent:guild-guide', 'http://localhost:3001');

    expect(document?.id).toBe('did:guild:agent:guild-guide');
    expect(document?.alsoKnownAs).toContain('guild://agent/guild-guide');
    expect(document?.service).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'GuildProfile', serviceEndpoint: expect.stringContaining('/api/did/') }),
        expect.objectContaining({ type: 'GuildPartyBeacon', serviceEndpoint: 'http://localhost:3001/api/party-beacons' }),
        expect.objectContaining({ type: 'GuildA2A', serviceEndpoint: 'ws://localhost:3000' }),
      ]),
    );
  });

  it('allows a delegated agent to review party beacon responses for its owner', () => {
    const { state } = makeState();
    const join = state.joinGuild({
      agent: {
        displayName: 'Free Responder',
        handle: '@free-responder',
        capabilities: ['research'],
      },
    });

    const beacon = state.createPartyBeacon({
      publisherDid: 'did:guild:member:founder',
      title: 'Founder needs a researcher',
      intent: 'Find an agent who can research protocol options',
    });
    const response = state.respondToPartyBeacon(beacon.id, {
      responderDid: join.agent.did,
      message: 'I can research this.',
    });

    const reviewed = state.reviewPartyBeaconResponse(
      beacon.id,
      response!.id,
      'ACCEPTED',
      'did:guild:agent:guild-guide',
    );

    expect(reviewed?.status).toBe('ACCEPTED');
  });
});

describe('GuildServer WebSocket protocol flows', () => {
  let server: GuildServer | undefined;
  const sockets: WebSocket[] = [];

  afterEach(() => {
    sockets.forEach((socket) => socket.close());
    sockets.length = 0;
    server?.close();
    server = undefined;
  });

  it('relays A2A messages to an online target DID', async () => {
    const port = 39100;
    server = new GuildServer(port, '127.0.0.1', 'localhost');
    const targetKey = server.getDatabase().createApiKey({
      subjectDid: 'did:guild:agent:ember',
      subjectType: 'AGENT',
      role: 'AGENT',
      scopes: ['ACCEPT_QUEST'],
    });
    const senderKey = server.getDatabase().createApiKey({
      subjectDid: 'did:guild:agent:guild-guide',
      subjectType: 'AGENT',
      role: 'AGENT',
      scopes: ['COORDINATE_PARTY'],
    });
    const target = await connectSocket(port);
    const sender = await connectSocket(port);

    target.send(JSON.stringify({ type: 'register', apiKey: targetKey.secret, name: 'Ember Buildsmith' }));
    await waitForMessage(target, (message) => message.type === 'registered');

    sender.send(JSON.stringify({ type: 'register', apiKey: senderKey.secret, name: 'Guild Guide' }));
    await waitForMessage(sender, (message) => message.type === 'registered');

    const envelope = {
      protocol: 'guild-a2a',
      version: 'v1',
      id: 'message-test-1',
      type: 'party.beacon.followup',
      fromDid: 'did:guild:agent:guild-guide',
      toDid: 'did:guild:agent:ember',
      context: { beaconId: 'beacon-test' },
      payload: { text: 'Want to join this quest party?' },
      createdAt: Date.now(),
    };

    sender.send(
      JSON.stringify({
        type: 'a2a_message',
        message: { ...envelope, signature: sha256Hmac(senderKey.secret, stableStringify(envelope)) },
      }),
    );

    const relayed = await waitForMessage(target, (message) => message.type === 'a2a_message');
    const ack = await waitForMessage(sender, (message) => message.type === 'a2a_message_relayed');

    expect(relayed.message.fromDid).toBe('did:guild:agent:guild-guide');
    expect(relayed.message.toDid).toBe('did:guild:agent:ember');
    expect(relayed.message.payload.text).toBe('Want to join this quest party?');
    expect(ack.messageId).toBe(relayed.message.id);
  });

  it('rejects A2A messages from unregistered DIDs', async () => {
    const port = 39101;
    server = new GuildServer(port, '127.0.0.1', 'localhost');
    const socket = await connectSocket(port);

    socket.send(
      JSON.stringify({
        type: 'a2a_message',
        message: {
          fromDid: 'did:guild:agent:not-real',
          payload: { text: 'hello' },
        },
      }),
    );

    const error = await waitForMessage(socket, (message) => message.type === 'error');

    expect(error.code).toBe('NOT_REGISTERED');
  });

  function connectSocket(port: number): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(`ws://127.0.0.1:${port}`);
      sockets.push(socket);
      socket.once('open', () => resolve(socket));
      socket.once('error', reject);
    });
  }

  function waitForMessage(
    socket: WebSocket,
    predicate: (message: Record<string, any>) => boolean,
  ): Promise<Record<string, any>> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        socket.off('message', handleMessage);
        reject(new Error('Timed out waiting for WebSocket message'));
      }, 2000);

      const handleMessage = (data: WebSocket.RawData) => {
        const message = JSON.parse(data.toString()) as Record<string, any>;
        if (!predicate(message)) {
          return;
        }

        clearTimeout(timeout);
        socket.off('message', handleMessage);
        resolve(message);
      };

      socket.on('message', handleMessage);
    });
  }
});
