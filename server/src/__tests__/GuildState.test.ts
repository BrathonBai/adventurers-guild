import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import WebSocket = require('ws');
import { GuildServer } from '../GuildServer';
import { GuildState, QuestAcceptanceError } from '../GuildState';
import { sha256Hmac, stableStringify } from '../cryptoUtils';
import { GuildQuest } from '../types';

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

  it('redacts sensitive identifiers, addresses, and operator notes from the public snapshot', () => {
    const { state } = makeState();
    const beacon = state.createPartyBeacon({
      publisherDid: 'did:guild:agent:guild-guide',
      title: 'Public beacon',
      intent: 'Find a visible but privacy-safe collaborator.',
      visibility: 'PUBLIC',
    });
    state.respondToPartyBeacon(beacon.id, {
      responderDid: 'did:guild:agent:scout',
      message: 'I can help.',
    });

    const snapshot = state.createPublicSnapshot();
    const serialized = JSON.stringify(snapshot);

    expect(snapshot.members?.every((member) => member.did === '')).toBe(true);
    expect(snapshot.members?.every((member) => member.connectionUri === '')).toBe(true);
    expect(snapshot.members?.every((member) => member.agentIds.length === 0)).toBe(true);
    expect(snapshot.agents?.every((agent) => agent.did === '')).toBe(true);
    expect(snapshot.agents?.every((agent) => agent.connectionUri === '')).toBe(true);
    expect(snapshot.agents?.every((agent) => agent.operatorNotes === '')).toBe(true);
    expect(snapshot.quests?.every((quest) => quest.publisherMemberId === undefined)).toBe(true);
    expect(snapshot.quests?.every((quest) => quest.publisherAgentId === undefined)).toBe(true);
    expect(snapshot.delegations ?? []).toEqual([]);
    expect(snapshot.partyBeacons?.[0]?.publisherDid).toBe('');
    expect(snapshot.partyBeacons?.[0]?.publisherLabel).toBe('Guild Guide');
    expect(snapshot.partyBeacons?.[0]?.responses[0]?.responderDid).toBe('');
    expect(snapshot.partyBeacons?.[0]?.responses[0]?.responderLabel).toBe('Scout-17');
    expect(snapshot.activity?.some((entry) => entry.title.includes('did:guild'))).toBe(false);
    expect(snapshot.activity?.some((entry) => entry.title.includes('代表'))).toBe(false);
    expect(serialized).not.toContain('ownerMemberId');
    expect(serialized).not.toContain('publisherMemberId');
    expect(serialized).not.toContain('publisherAgentId');
  });

  it('omits administrator-grade platform agents from public projections', () => {
    const { state } = makeState();
    state.agentProfiles.set('agent-guild-registrar', {
      id: 'agent-guild-registrar',
      did: 'did:guild:agent:guild-registrar',
      connectionUri: 'guild://agent/guild-registrar',
      handle: '@guild-registrar',
      displayName: 'Guild Registrar',
      classification: 'GUILD_SERVICE',
      autonomy: 'SUPERVISED',
      availability: 'IDLE',
      operatorNotes: 'Internal registrar administrator agent.',
      capabilities: ['credential issuance coordination', 'human escalation'],
      reputation: {
        score: 700,
        tier: 'ELITE',
        badges: ['registrar'],
        completedQuests: 0,
        reliability: 95,
      },
    });
    state.quests.set('QUEST-PRIVATE-OPS', {
      id: 'QUEST-PRIVATE-OPS',
      title: 'Internal registrar runbook',
      description: 'Keep the registrar operational without exposing its identity.',
      publisherId: 'agent-guild-registrar',
      publisherAgentId: 'agent-guild-registrar',
      requiredMembers: [],
      subtasks: [{ title: 'Rotate checklist', estimatedHours: 1, description: 'Internal', assignedTo: 'agent-guild-registrar' }],
      status: 'OPEN',
      teamMembers: ['agent-guild-registrar', 'agent-guide'],
      createdAt: Date.now(),
    });
    state.parties.set('party-private-ops', {
      id: 'party-private-ops',
      questId: 'QUEST-PRIVATE-OPS',
      name: 'Internal registrar party',
      leaderId: 'agent-guild-registrar',
      leaderType: 'AGENT',
      members: [
        {
          userId: 'agent-guild-registrar',
          role: 'Registrar',
          skills: ['credential issuance coordination'],
          status: 'ACTIVE',
          joinedAt: Date.now(),
          unitType: 'AGENT',
        },
        {
          userId: 'agent-guide',
          role: 'Visible collaborator',
          skills: ['quest planning'],
          status: 'ACTIVE',
          joinedAt: Date.now(),
          unitType: 'AGENT',
        },
      ],
      maxSize: 2,
      status: 'ACTIVE',
      lookingFor: [],
      requiredSkills: [],
      createdAt: Date.now(),
    });
    state.delegations.set('delegation-founder-steward', {
      id: 'delegation-founder-steward',
      memberId: 'member-founder',
      agentId: 'agent-guild-steward',
      scopes: ['COORDINATE_PARTY'],
      status: 'ACTIVE',
      operatingNote: 'Internal steward mandate',
    });
    state.activityFeed.unshift({
      id: 'activity-private-agent',
      kind: 'AGENT_JOINED',
      title: 'Guild Registrar completed administrator setup',
      detail: '@guild-registrar is ready at did:guild:agent:guild-registrar.',
      timestampLabel: 'just now',
    });
    state.partyBeacons.set('beacon-private-publisher', {
      id: 'beacon-private-publisher',
      publisherDid: 'did:guild:agent:guild-registrar',
      publisherLabel: 'Guild Registrar',
      title: 'Internal call',
      intent: 'Internal only',
      lookingFor: [],
      requiredSkills: [],
      visibility: 'PUBLIC',
      status: 'OPEN',
      expiresAt: Date.now() + 60_000,
      createdAt: Date.now(),
      responses: [],
    });
    state.partyBeacons.set('beacon-public-with-private-response', {
      id: 'beacon-public-with-private-response',
      publisherDid: 'did:guild:agent:guild-guide',
      title: 'Visible call',
      intent: 'Find a collaborator',
      lookingFor: [],
      requiredSkills: [],
      visibility: 'PUBLIC',
      status: 'OPEN',
      expiresAt: Date.now() + 60_000,
      createdAt: Date.now(),
      responses: [
        {
          id: 'response-private-agent',
          beaconId: 'beacon-public-with-private-response',
          responderDid: 'did:guild:agent:guild-registrar',
          responderLabel: 'Guild Registrar',
          message: 'Internal follow-up',
          offeredSkills: ['credential issuance coordination'],
          contactPolicy: 'AGENT_RELAY',
          status: 'PENDING',
          createdAt: Date.now(),
        },
      ],
    });

    const snapshot = state.createPublicSnapshot();
    const serialized = JSON.stringify(snapshot);

    expect(snapshot.agents?.map((agent) => agent.id)).not.toEqual(
      expect.arrayContaining(['agent-guild-steward', 'agent-guild-registrar']),
    );
    expect(snapshot.members?.every((member) => member.agentIds.length === 0)).toBe(true);
    expect(snapshot.delegations ?? []).toEqual([]);
    expect(snapshot.quests?.find((quest) => quest.id === 'QUEST-PRIVATE-OPS')?.publisherAgentId).toBeUndefined();
    expect(snapshot.quests?.find((quest) => quest.id === 'QUEST-PRIVATE-OPS')?.publisherMemberId).toBeUndefined();
    expect(snapshot.quests?.find((quest) => quest.id === 'QUEST-PRIVATE-OPS')?.teamMembers).toEqual(['agent-guide']);
    expect(snapshot.quests?.find((quest) => quest.id === 'QUEST-PRIVATE-OPS')?.subtasks[0].assignedTo).toBeUndefined();
    expect(snapshot.parties?.find((party) => party.id === 'party-private-ops')?.leaderId).toBe('agent-guide');
    expect(snapshot.parties?.find((party) => party.id === 'party-private-ops')?.members).toEqual([
      expect.objectContaining({ userId: 'agent-guide' }),
    ]);
    expect(snapshot.partyBeacons?.some((beacon) => beacon.id === 'beacon-private-publisher')).toBe(false);
    expect(
      snapshot.partyBeacons?.find((beacon) => beacon.id === 'beacon-public-with-private-response')?.responses,
    ).toEqual([]);
    expect(snapshot.activity?.some((entry) => entry.id === 'activity-private-agent')).toBe(false);
    expect(serialized).not.toContain('Guild Registrar');
    expect(serialized).not.toContain('Guild Steward');
    expect(serialized).not.toContain('@guild-registrar');
    expect(serialized).not.toContain('agent-guild-registrar');
    expect(serialized).not.toContain('agent-guild-steward');
    expect(serialized).not.toContain('ownerMemberId');
    expect(serialized).not.toContain('publisherMemberId');
    expect(serialized).not.toContain('publisherAgentId');
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

  it('creates a forming party for every quest that is missing one', () => {
    const { state } = makeState();
    const quest: GuildQuest = {
      id: 'QUEST-TEST-PARTY',
      title: 'Design a better guild workspace',
      description: 'Make every quest visibly gather its execution unit.',
      publisherId: 'agent-guide',
      publisherAgentId: 'agent-guide',
      requiredMembers: [
        {
          role: 'UX designer',
          count: 1,
          filled: 0,
          skills: ['information architecture'],
        },
        {
          role: 'Frontend implementation agent',
          count: 1,
          filled: 0,
          skills: ['React'],
        },
      ],
      subtasks: [],
      status: 'FORMING_PARTY' as const,
      teamMembers: ['agent-guide'],
      createdAt: Date.now(),
    };

    state.quests.set(quest.id, quest);
    const party = state.ensurePartyForQuest(quest);

    expect(quest.partyId).toBe(party.id);
    expect(party.questId).toBe(quest.id);
    expect(party.status).toBe('RECRUITING');
    expect(party.members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: 'agent-guide', role: 'Quest coordinator', unitType: 'AGENT' }),
      ]),
    );
    expect(party.lookingFor).toEqual(['UX designer', 'Frontend implementation agent']);
    expect(party.name).toContain(quest.title);
  });

  it('accepts a quest role by DID and mirrors the accepted unit into the party', () => {
    const { state } = makeState();
    const join = state.joinGuild({
      agent: {
        displayName: 'Quest Taker',
        handle: '@quest-taker',
        capabilities: ['React', 'visual QA'],
      },
    });
    const partyId = 'party-acceptance-test';

    state.parties.set(partyId, {
      id: partyId,
      questId: 'QUEST-TEST-ACCEPT',
      name: 'Acceptance Test Party',
      leaderId: 'agent-guide',
      leaderType: 'AGENT',
      members: [],
      maxSize: 4,
      status: 'RECRUITING',
      lookingFor: ['Frontend implementation agent'],
      requiredSkills: ['React'],
      createdAt: Date.now(),
    });
    state.quests.set('QUEST-TEST-ACCEPT', {
      id: 'QUEST-TEST-ACCEPT',
      title: 'Build a better guild frontend',
      description: 'Ship a better web UI for the guild.',
      publisherId: 'agent-guide',
      requiredMembers: [
        {
          role: 'Frontend implementation agent',
          count: 2,
          filled: 0,
          skills: ['React'],
        },
      ],
      subtasks: [],
      status: 'OPEN',
      teamMembers: [],
      createdAt: Date.now(),
      partyId,
    });

    const accepted = state.acceptQuest('QUEST-TEST-ACCEPT', join.agent.did, 'Frontend implementation agent', 'AGENT');

    expect(accepted?.acceptedUnit.id).toBe(join.agent.id);
    expect(accepted?.quest.status).toBe('FORMING_PARTY');
    expect(accepted?.quest.requiredMembers[0].filled).toBe(1);
    expect(accepted?.quest.teamMembers).toContain(join.agent.id);
    expect(accepted?.party?.members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: join.agent.id,
          role: 'Frontend implementation agent',
          unitType: 'AGENT',
        }),
      ]),
    );
    expect(() => state.acceptQuest('QUEST-TEST-ACCEPT', join.agent.did, 'Frontend implementation agent', 'AGENT')).toThrow(
      QuestAcceptanceError,
    );
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

  afterEach(async () => {
    await Promise.all(sockets.map((socket) => closeSocket(socket)));
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

  it('relays A2A through the guild broker without disclosing endpoint details', async () => {
    const port = 39102;
    server = new GuildServer(port, '127.0.0.1', 'localhost');
    const senderKey = server.getDatabase().createApiKey({
      subjectDid: 'did:guild:agent:guild-guide',
      subjectType: 'AGENT',
      role: 'AGENT',
      scopes: ['COORDINATE_PARTY'],
    });
    const targetKey = server.getDatabase().createApiKey({
      subjectDid: 'did:guild:agent:ember',
      subjectType: 'AGENT',
      role: 'AGENT',
      scopes: ['ACCEPT_QUEST'],
    });
    const target = await connectSocket(port);
    const sender = await connectSocket(port);

    target.send(JSON.stringify({ type: 'register', apiKey: targetKey.secret, name: 'Ember Buildsmith' }));
    await waitForMessage(target, (message) => message.type === 'registered');

    sender.send(JSON.stringify({ type: 'register', apiKey: senderKey.secret, name: 'Guild Guide' }));
    await waitForMessage(sender, (message) => message.type === 'registered');

    const result = server.relayA2AMessage('did:guild:agent:guild-guide', {
      toAgentId: 'agent-ember',
      type: 'guild.message',
      payload: { text: 'Hello through the broker.' },
    });
    const relayed = await waitForMessage(target, (message) => message.type === 'a2a_message');

    expect(result.status).toBe('DELIVERED');
    expect(JSON.stringify(result)).not.toContain('did:guild');
    expect(JSON.stringify(result)).not.toContain('guild://');
    expect(relayed.relay).toEqual(expect.objectContaining({ directEndpointDisclosed: false }));
    expect(relayed.message.toDid).toBe('did:guild:agent:ember');
  });

  it('keeps administrator-grade agents out of public WebSocket discovery and snapshots', async () => {
    const port = 39103;
    server = new GuildServer(port, '127.0.0.1', 'localhost');
    const registrar = server.joinGuildFromApi({
      agent: {
        displayName: 'Guild Registrar',
        handle: '@guild-registrar',
        classification: 'GUILD_SERVICE',
        autonomy: 'SUPERVISED',
        capabilities: ['credential issuance coordination', 'human escalation'],
      },
    });
    const adminKey = server.getDatabase().createApiKey({
      subjectDid: registrar.agent.did,
      subjectType: 'ADMIN',
      role: 'ADMIN',
      scopes: ['ADMIN'],
    });
    const socket = await connectSocket(port);

    socket.send(JSON.stringify({ type: 'find_agents' }));
    const found = await waitForMessage(socket, (message) => message.type === 'agents_found');

    socket.send(JSON.stringify({ type: 'get_guild_snapshot' }));
    const publicSnapshot = await waitForMessage(socket, (message) => message.type === 'guild_snapshot');

    socket.send(JSON.stringify({ type: 'get_guild_snapshot', apiKey: adminKey.secret }));
    const adminSnapshot = await waitForMessage(socket, (message) => message.type === 'guild_snapshot');

    expect(JSON.stringify(found)).not.toContain('Guild Registrar');
    expect(JSON.stringify(publicSnapshot.snapshot)).not.toContain('Guild Registrar');
    expect(JSON.stringify(publicSnapshot.snapshot)).not.toContain('@guild-registrar');
    expect(JSON.stringify(publicSnapshot.snapshot)).not.toContain(registrar.agent.id);
    expect(JSON.stringify(adminSnapshot.snapshot)).toContain('Guild Registrar');
    expect(JSON.stringify(adminSnapshot.snapshot)).toContain(registrar.agent.id);
  });

  function connectSocket(port: number): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(`ws://127.0.0.1:${port}`);
      sockets.push(socket);
      socket.once('open', () => resolve(socket));
      socket.once('error', reject);
    });
  }

  function closeSocket(socket: WebSocket): Promise<void> {
    if (socket.readyState === WebSocket.CLOSED) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      socket.once('close', () => resolve());
      socket.close();
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
