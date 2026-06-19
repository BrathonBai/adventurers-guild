import { createBootstrapState } from './seedState';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {
  ActivityFeedItem,
  AgentConnection,
  GuildJoinResult,
  GuildAgentProfile,
  CreatePartyBeaconPayload,
  GuildDidDocument,
  GuildConnectionResolution,
  GuildPermissionCheck,
  GuildDelegationRecord,
  GuildMemberRecord,
  GuildQuest,
  GuildSnapshotRecord,
  GuildTask,
  PartyBeacon,
  PartyBeaconResponse,
  RespondToPartyBeaconPayload,
  IncomingMessage,
  JoinGuildPayload,
  Party,
} from './types';
import {
  readOptionalAutonomy,
  readOptionalClassification,
  readOptionalString,
} from './messageUtils';
import { createGuildConnectionUri, createGuildDid } from './did';
import { GuildDatabase, AuditLogInput } from './GuildDatabase';

export type Application = {
  applicantId: string;
  name: string;
  skills: string[];
  reputation: string;
};

type PersistedGuildState = GuildSnapshotRecord & {
  tasks?: GuildTask[];
  questCounter?: number;
};

export class GuildState {
  readonly liveAgents = new Map<string, AgentConnection>();
  readonly members = new Map<string, GuildMemberRecord>();
  readonly agentProfiles = new Map<string, GuildAgentProfile>();
  readonly parties = new Map<string, Party>();
  readonly quests = new Map<string, GuildQuest>();
  readonly delegations = new Map<string, GuildDelegationRecord>();
  readonly partyBeacons = new Map<string, PartyBeacon>();
  readonly activityFeed: ActivityFeedItem[] = [];
  readonly tasks = new Map<string, GuildTask>();
  readonly applications = new Map<string, Application[]>();
  private readonly persistencePath?: string;
  private readonly db: GuildDatabase;
  private questCounter = 0;

  constructor(persistencePath = path.join(__dirname, '../../data/guild-state.json')) {
    this.persistencePath = persistencePath;
    const dbPath = persistencePath.endsWith('.sqlite') ? persistencePath : persistencePath.replace(/\.json$/, '.sqlite');
    this.db = new GuildDatabase(dbPath);
    this.bootstrap();
  }

  private bootstrap(): void {
    const state = this.loadPersistedState() || createBootstrapState();
    const persistedState = state as Partial<PersistedGuildState>;

    state.members.forEach((member) => {
      member.connectionUri ||= createGuildConnectionUri('member', member.handle || member.id);
      this.members.set(member.id, member);
    });

    state.agents.forEach((agent) => {
      agent.connectionUri ||= createGuildConnectionUri('agent', agent.handle || agent.id);
      this.agentProfiles.set(agent.id, agent);
    });

    state.quests.forEach((quest) => {
      this.quests.set(quest.id, quest);
    });
    this.questCounter = state.quests.length;

    state.parties.forEach((party) => {
      this.parties.set(party.id, party);
    });

    state.delegations.forEach((delegation) => {
      this.delegations.set(delegation.id, delegation);
    });

    persistedState.partyBeacons?.forEach((beacon) => {
      this.partyBeacons.set(beacon.id, beacon);
    });

    persistedState.tasks?.forEach((task) => {
      this.tasks.set(task.id, task);
    });

    this.activityFeed.push(...state.activity);
    this.questCounter = persistedState.questCounter ?? state.quests.length;
  }

  private loadPersistedState(): PersistedGuildState | undefined {
    const sqliteState = this.db.readDocument<PersistedGuildState>('guild_state');
    if (sqliteState) {
      return sqliteState;
    }

    if (!this.persistencePath || !fs.existsSync(this.persistencePath)) {
      return undefined;
    }

    try {
      const legacy = JSON.parse(fs.readFileSync(this.persistencePath, 'utf8')) as PersistedGuildState;
      this.db.writeDocument('guild_state', legacy);
      this.db.backup();
      return legacy;
    } catch (error) {
      console.warn('Failed to load persisted guild state, falling back to bootstrap state:', error);
      return undefined;
    }
  }

  save(): void {
    const state: PersistedGuildState = {
      ...this.createSnapshot(),
      tasks: Array.from(this.tasks.values()),
      questCounter: this.questCounter,
    };

    this.db.transaction(() => {
      this.db.writeDocument('guild_state', state);
    });
  }

  audit(input: AuditLogInput): void {
    this.db.audit(input);
  }

  getDatabase(): GuildDatabase {
    return this.db;
  }

  nextQuestId(): string {
    this.questCounter += 1;
    const year = new Date().getFullYear();
    return `QUEST-${year}-${String(this.questCounter).padStart(3, '0')}`;
  }

  createSnapshot(): GuildSnapshotRecord {
    return {
      members: Array.from(this.members.values()),
      agents: Array.from(this.agentProfiles.values()),
      quests: Array.from(this.quests.values()),
      parties: Array.from(this.parties.values()),
      delegations: Array.from(this.delegations.values()),
      partyBeacons: this.listPartyBeacons(),
      activity: this.activityFeed,
    };
  }

  createPublicSnapshot(): Partial<GuildSnapshotRecord> {
    return {
      members: Array.from(this.members.values()).map((member) => ({
        ...member,
        agentIds: member.agentIds,
      })),
      agents: Array.from(this.agentProfiles.values()).map((agent) => ({
        ...agent,
        operatorNotes: '',
      })),
      quests: Array.from(this.quests.values()),
      parties: Array.from(this.parties.values()),
      delegations: [],
      partyBeacons: this.listPartyBeacons().filter((beacon) => beacon.visibility === 'PUBLIC'),
      activity: this.activityFeed.slice(0, 50),
    };
  }

  listPartyBeacons(): PartyBeacon[] {
    const now = Date.now();
    return Array.from(this.partyBeacons.values()).map((beacon) => ({
      ...beacon,
      status: beacon.status === 'OPEN' && beacon.expiresAt <= now ? 'EXPIRED' : beacon.status,
    }));
  }

  createPartyBeacon(payload: CreatePartyBeaconPayload): PartyBeacon {
    const permission = this.canPublishPartyBeacon(payload.publisherDid);
    if (!permission.ok) {
      throw new Error(permission.message);
    }

    const beacon: PartyBeacon = {
      id: `beacon-${randomUUID()}`,
      questId: payload.questId,
      partyId: payload.partyId,
      publisherDid: payload.publisherDid,
      title: payload.title,
      intent: payload.intent,
      lookingFor: payload.lookingFor ?? [],
      requiredSkills: payload.requiredSkills ?? [],
      visibility: payload.visibility || 'GUILD_ONLY',
      status: 'OPEN',
      expiresAt: Date.now() + Math.max(1, payload.ttlHours ?? 24) * 60 * 60 * 1000,
      createdAt: Date.now(),
      responses: [],
    };

    this.partyBeacons.set(beacon.id, beacon);
    this.activityFeed.unshift({
      id: `activity-${Date.now()}`,
      kind: 'PARTY_BEACON_PUBLISHED',
      title: `${payload.publisherDid} 发布了组队广播`,
      detail: beacon.intent,
      timestampLabel: 'just now',
    });

    this.save();
    this.audit({ actorDid: payload.publisherDid, action: 'CREATE_PARTY_BEACON', targetType: 'beacon', targetId: beacon.id });

    return beacon;
  }

  canPublishPartyBeacon(publisherDid: string): GuildPermissionCheck {
    const unit = this.resolveUnitByDid(publisherDid);
    if (!unit) {
      return { ok: false, code: 'DID_NOT_FOUND', message: 'publisherDid is not a registered guild DID' };
    }

    if (unit.unitType === 'MEMBER') {
      return { ok: true };
    }

    const agent = this.agentProfiles.get(unit.id);
    if (!agent?.ownerMemberId) {
      return { ok: true };
    }

    const hasDelegation = Array.from(this.delegations.values()).some(
      (delegation) =>
        delegation.memberId === agent.ownerMemberId &&
        delegation.agentId === agent.id &&
        delegation.status === 'ACTIVE' &&
        (delegation.scopes.includes('COORDINATE_PARTY') || delegation.scopes.includes('PUBLISH_QUEST')),
    );

    return hasDelegation
      ? { ok: true }
      : {
          ok: false,
          code: 'DELEGATION_REQUIRED',
          message: 'Agent requires active COORDINATE_PARTY or PUBLISH_QUEST delegation to publish a party beacon',
        };
  }

  isRegisteredDid(did: string): boolean {
    return Boolean(this.resolveUnitByDid(did));
  }

  getUnitByDid(did: string):
    | { id: string; did: string; connectionUri: string; displayName: string; unitType: 'MEMBER' | 'AGENT' }
    | undefined {
    return this.resolveUnitByDid(did);
  }

  respondToPartyBeacon(beaconId: string, payload: RespondToPartyBeaconPayload): PartyBeaconResponse | undefined {
    const beacon = this.partyBeacons.get(beaconId);
    if (!beacon || beacon.status !== 'OPEN' || beacon.expiresAt <= Date.now()) {
      return undefined;
    }

    if (!this.isRegisteredDid(payload.responderDid)) {
      throw new Error('responderDid is not a registered guild DID');
    }

    const response: PartyBeaconResponse = {
      id: `beacon-response-${randomUUID()}`,
      beaconId,
      responderDid: payload.responderDid,
      message: payload.message,
      offeredSkills: payload.offeredSkills ?? [],
      contactPolicy: payload.contactPolicy || 'AGENT_RELAY',
      status: 'PENDING',
      createdAt: Date.now(),
    };

    beacon.responses.push(response);
    this.activityFeed.unshift({
      id: `activity-${Date.now()}`,
      kind: 'PARTY_BEACON_RESPONDED',
      title: `${payload.responderDid} 响应了组队广播`,
      detail: beacon.title,
      timestampLabel: 'just now',
    });

    this.save();
    this.audit({ actorDid: payload.responderDid, action: 'CREATE_BEACON_RESPONSE', targetType: 'beacon', targetId: beacon.id, metadata: { responseId: response.id } });

    return response;
  }

  reviewPartyBeaconResponse(
    beaconId: string,
    responseId: string,
    status: PartyBeaconResponse['status'],
    reviewerDid: string,
  ): PartyBeaconResponse | undefined {
    const beacon = this.partyBeacons.get(beaconId);
    const response = beacon?.responses.find((item) => item.id === responseId);
    if (!response) {
      return undefined;
    }

    const permission = beacon ? this.canReviewPartyBeacon(beacon, reviewerDid) : undefined;
    if (!permission?.ok) {
      throw new Error(permission?.message || 'Reviewer is not allowed to review this party beacon response');
    }

    response.status = status;
    if (status === 'ACCEPTED' && beacon) {
      this.addBeaconResponderToParty(beacon, response);
    }

    this.save();
    this.audit({ actorDid: reviewerDid, action: 'REVIEW_BEACON_RESPONSE', targetType: 'beacon', targetId: beaconId, metadata: { responseId, status } });

    return response;
  }

  private canReviewPartyBeacon(beacon: PartyBeacon, reviewerDid: string): GuildPermissionCheck {
    const reviewer = this.resolveUnitByDid(reviewerDid);
    if (!reviewer) {
      return { ok: false, code: 'DID_NOT_FOUND', message: 'reviewerDid is not a registered guild DID' };
    }

    if (reviewerDid === beacon.publisherDid) {
      return { ok: true };
    }

    const publisher = this.resolveUnitByDid(beacon.publisherDid);
    if (!publisher) {
      return { ok: false, code: 'DID_NOT_FOUND', message: 'Beacon publisher DID is not registered' };
    }

    const reviewerAgent = reviewer.unitType === 'AGENT' ? this.agentProfiles.get(reviewer.id) : undefined;
    const publisherAgent = publisher.unitType === 'AGENT' ? this.agentProfiles.get(publisher.id) : undefined;
    const publisherMemberId = publisher.unitType === 'MEMBER' ? publisher.id : publisherAgent?.ownerMemberId;

    if (!publisherMemberId || !reviewerAgent) {
      return { ok: false, code: 'REVIEW_FORBIDDEN', message: 'Only the publisher or a delegated agent can review this response' };
    }

    const hasDelegation = Array.from(this.delegations.values()).some(
      (delegation) =>
        delegation.memberId === publisherMemberId &&
        delegation.agentId === reviewerAgent.id &&
        delegation.status === 'ACTIVE' &&
        delegation.scopes.includes('COORDINATE_PARTY'),
    );

    return hasDelegation
      ? { ok: true }
      : { ok: false, code: 'REVIEW_FORBIDDEN', message: 'Reviewer requires active COORDINATE_PARTY delegation' };
  }

  resolveDidDocument(did: string, publicBaseUrl: string): GuildDidDocument | undefined {
    const unit = this.resolveUnitByDid(did);
    if (!unit) {
      return undefined;
    }

    const encodedDid = encodeURIComponent(did);
    return {
      '@context': ['https://www.w3.org/ns/did/v1'],
      id: did,
      alsoKnownAs: [unit.connectionUri],
      controller: did,
      verificationMethod: [
        {
          id: `${did}#guild-placeholder-key`,
          type: 'JsonWebKey2020',
          controller: did,
          publicKeyJwk: {
            kty: 'OKP',
            crv: 'Ed25519',
            x: 'placeholder-public-key-until-agent-key-binding-is-enabled',
          },
        },
      ],
      authentication: [`${did}#guild-placeholder-key`],
      assertionMethod: [`${did}#guild-placeholder-key`],
      service: [
        {
          id: `${did}#profile`,
          type: 'GuildProfile',
          serviceEndpoint: `${publicBaseUrl}/api/did/${encodedDid}`,
        },
        {
          id: `${did}#party-beacons`,
          type: 'GuildPartyBeacon',
          serviceEndpoint: `${publicBaseUrl}/api/party-beacons`,
        },
        {
          id: `${did}#a2a`,
          type: 'GuildA2A',
          serviceEndpoint: publicBaseUrl.replace(/^http/, 'ws').replace(/:\d+$/, ':3000'),
        },
      ],
    };
  }

  resolveConnectionUri(connectionUri: string, publicBaseUrl: string): GuildConnectionResolution | undefined {
    const unit = this.resolveUnitByConnectionUri(connectionUri);
    if (!unit) {
      return undefined;
    }

    return {
      connectionUri: unit.connectionUri,
      did: unit.did,
      id: unit.id,
      unitType: unit.unitType,
      displayName: unit.displayName,
      profileEndpoint: `${publicBaseUrl}/api/did/${encodeURIComponent(unit.did)}`,
      partyBeaconsEndpoint: `${publicBaseUrl}/api/party-beacons`,
      a2aEndpoint: publicBaseUrl.replace(/^http/, 'ws').replace(/:\d+$/, ':3000'),
    };
  }

  private addBeaconResponderToParty(beacon: PartyBeacon, response: PartyBeaconResponse): void {
    const responder = this.resolveUnitByDid(response.responderDid);
    if (!responder) {
      return;
    }

    const party = this.resolveOrCreateBeaconParty(beacon);
    if (party.members.some((member) => member.userId === responder.id)) {
      return;
    }

    party.members.push({
      userId: responder.id,
      role: beacon.lookingFor[0] || 'Contributor',
      skills: response.offeredSkills,
      status: 'ACTIVE',
      joinedAt: Date.now(),
      unitType: responder.unitType,
    });

    if (party.status === 'RECRUITING' && party.members.length >= Math.min(party.maxSize, 2)) {
      party.status = 'ACTIVE';
    }

    this.activityFeed.unshift({
      id: `activity-${Date.now()}`,
      kind: 'PARTY_FORMED',
      title: `${responder.displayName} 加入了 ${party.name}`,
      detail: `来自组队广播 ${beacon.title} 的响应已被接受。`,
      timestampLabel: 'just now',
    });
  }

  private resolveOrCreateBeaconParty(beacon: PartyBeacon): Party {
    if (beacon.partyId) {
      const existing = this.parties.get(beacon.partyId);
      if (existing) {
        return existing;
      }
    }

    const publisher = this.resolveUnitByDid(beacon.publisherDid);
    const partyId = `party-${randomUUID()}`;
    const party: Party = {
      id: partyId,
      questId: beacon.questId,
      name: `${beacon.title} Party`,
      description: beacon.intent,
      missionBrief: beacon.intent,
      leaderId: publisher?.id || beacon.publisherDid,
      leaderType: publisher?.unitType,
      members: publisher
        ? [
            {
              userId: publisher.id,
              role: 'Beacon publisher',
              skills: GuildState.resolveCapabilities(this, publisher.id),
              status: 'ACTIVE',
              joinedAt: Date.now(),
              unitType: publisher.unitType,
            },
          ]
        : [],
      maxSize: Math.max(2, beacon.lookingFor.length + 1),
      status: 'RECRUITING',
      lookingFor: beacon.lookingFor,
      requiredSkills: beacon.requiredSkills,
      createdAt: Date.now(),
    };

    this.parties.set(partyId, party);
    beacon.partyId = partyId;

    if (beacon.questId) {
      const quest = this.quests.get(beacon.questId);
      if (quest) {
        quest.partyId = partyId;
        if (quest.status === 'OPEN') {
          quest.status = 'FORMING_PARTY';
        }
      }
    }

    return party;
  }

  private resolveUnitByDid(did: string):
    | { id: string; did: string; connectionUri: string; displayName: string; unitType: 'MEMBER' | 'AGENT' }
    | undefined {
    const member = Array.from(this.members.values()).find((item) => item.did === did);
    if (member) {
      return { id: member.id, did: member.did, connectionUri: member.connectionUri, displayName: member.displayName, unitType: 'MEMBER' };
    }

    const agent = Array.from(this.agentProfiles.values()).find((item) => item.did === did);
    if (agent) {
      return { id: agent.id, did: agent.did, connectionUri: agent.connectionUri, displayName: agent.displayName, unitType: 'AGENT' };
    }

    return undefined;
  }

  private resolveUnitByConnectionUri(connectionUri: string):
    | { id: string; did: string; connectionUri: string; displayName: string; unitType: 'MEMBER' | 'AGENT' }
    | undefined {
    const member = Array.from(this.members.values()).find((item) => item.connectionUri === connectionUri);
    if (member) {
      return { id: member.id, did: member.did, connectionUri: member.connectionUri, displayName: member.displayName, unitType: 'MEMBER' };
    }

    const agent = Array.from(this.agentProfiles.values()).find((item) => item.connectionUri === connectionUri);
    if (agent) {
      return { id: agent.id, did: agent.did, connectionUri: agent.connectionUri, displayName: agent.displayName, unitType: 'AGENT' };
    }

    return undefined;
  }

  joinGuild(payload: JoinGuildPayload, options?: { liveAgent?: AgentConnection; allowDelegation?: boolean; issueCredentials?: boolean }): GuildJoinResult {
    const agentId =
      this.findAgentIdByHandle(payload.agent.handle) || options?.liveAgent?.id || randomUUID();
    const member = payload.member ? this.upsertMemberProfile(payload.member, agentId) : undefined;
    const agent = this.upsertGuildAgent(payload.agent, agentId, member?.id, options?.liveAgent);
    let delegation: GuildDelegationRecord | undefined;

    if (member && options?.allowDelegation && payload.delegation && payload.delegation.scopes.length > 0) {
      delegation = this.upsertDelegation(member.id, agent.id, payload.delegation);
    }

    if (member && !member.agentIds.includes(agent.id)) {
      member.agentIds.push(agent.id);
    }

    this.activityFeed.unshift({
      id: `activity-${Date.now()}`,
      kind: 'AGENT_JOINED',
      title: `${agent.displayName} 完成了协会入会登记`,
      detail: member
        ? `${agent.displayName} 已与会员 ${member.displayName} 建立可追溯的协会身份关系。`
        : `${agent.displayName} 作为自由 Agent 进入协会。`,
      timestampLabel: 'just now',
    });

    let credentials: GuildJoinResult['credentials'];
    this.save();

    if (options?.issueCredentials) {
      const issued = this.db.createApiKey({
        subjectDid: agent.did,
        subjectType: 'AGENT',
        role: 'AGENT',
        scopes: delegation?.scopes ?? ['ACCEPT_QUEST'],
      });
      credentials = { apiKey: issued.secret, keyId: issued.id, subjectDid: agent.did };
    }

    this.audit({ actorDid: agent.did, action: 'JOIN_GUILD', targetType: 'agent', targetId: agent.id, metadata: { memberId: member?.id, delegationId: delegation?.id } });

    return {
      member,
      agent,
      delegation,
      credentials,
      snapshot: this.createSnapshot(),
    };
  }

  upsertAgentProfile(agentId: string, message: IncomingMessage, liveAgent: AgentConnection): void {
    const data = message.data ?? {};
    const existing = this.agentProfiles.get(agentId);
    const ownerMemberId = existing?.ownerMemberId;

    const profile: GuildAgentProfile = {
      id: agentId,
      did: existing?.did || createGuildDid('agent', agentId),
      connectionUri: existing?.connectionUri || createGuildConnectionUri('agent', agentId),
      handle:
        readOptionalString(data.handle) ||
        readOptionalString(message.handle) ||
        existing?.handle ||
        `@${agentId.slice(0, 8)}`,
      displayName: liveAgent.name,
      classification:
        readOptionalClassification(data.classification) ||
        readOptionalClassification(message.classification) ||
        existing?.classification ||
        (ownerMemberId ? 'PERSONAL' : 'FREE_AGENT'),
      autonomy:
        readOptionalAutonomy(data.autonomy) ||
        readOptionalAutonomy(message.autonomy) ||
        existing?.autonomy ||
        'DELEGATED',
      availability: 'ONLINE',
      ownerMemberId,
      operatorNotes:
        readOptionalString(data.operatorNotes) ||
        readOptionalString(message.operatorNotes) ||
        existing?.operatorNotes ||
        'Runtime registration',
      capabilities: liveAgent.capabilities,
      reputation: existing?.reputation || {
        score: 500,
        tier: 'REGULAR',
        badges: [],
        completedQuests: 0,
        reliability: 80,
      },
    };

    this.agentProfiles.set(agentId, profile);

    this.save();
  }

  markAgentOffline(agentId: string): void {
    const profile = this.agentProfiles.get(agentId);
    if (profile) {
      profile.availability = 'OFFLINE';
      this.save();
    }
  }

  private upsertMemberProfile(
    payload: NonNullable<JoinGuildPayload['member']>,
    fallbackAgentId?: string,
  ): GuildMemberRecord {
    const memberId = this.findMemberIdByHandle(payload.handle) || randomUUID();
    const existing = this.members.get(memberId);
    const nextAgentIds = new Set(existing?.agentIds ?? []);
    if (fallbackAgentId) {
      nextAgentIds.add(fallbackAgentId);
    }

    const member: GuildMemberRecord = {
      id: memberId,
      did: existing?.did || createGuildDid('member', payload.handle || payload.displayName || memberId),
      connectionUri: existing?.connectionUri || createGuildConnectionUri('member', payload.handle || payload.displayName || memberId),
      handle: payload.handle || existing?.handle || this.makeHandle(payload.displayName, memberId),
      displayName: payload.displayName || existing?.displayName || memberId,
      role: payload.role || existing?.role || 'HYBRID',
      status: existing?.status || 'ACTIVE',
      bio: payload.bio || existing?.bio || 'Guild member joined through recruitment book onboarding.',
      specialties: payload.specialties || existing?.specialties || [],
      homeRegion: payload.homeRegion || existing?.homeRegion || 'Unknown',
      reputation:
        existing?.reputation || {
          score: 500,
          tier: 'REGULAR',
          badges: [],
          completedQuests: 0,
          reliability: 80,
        },
      agentIds: Array.from(nextAgentIds),
    };

    this.members.set(memberId, member);
    return member;
  }

  private upsertGuildAgent(
    payload: JoinGuildPayload['agent'],
    agentId: string,
    ownerMemberId?: string,
    liveAgent?: AgentConnection,
  ): GuildAgentProfile {
    const existing = this.agentProfiles.get(agentId);
    const handle = payload.handle || existing?.handle || this.makeHandle(payload.displayName, agentId);
    const profile: GuildAgentProfile = {
      id: agentId,
      did: existing?.did || createGuildDid('agent', handle || payload.displayName || agentId),
      connectionUri: existing?.connectionUri || createGuildConnectionUri('agent', handle || payload.displayName || agentId),
      handle,
      displayName: payload.displayName || existing?.displayName || agentId,
      classification:
        payload.classification || existing?.classification || (ownerMemberId ? 'PERSONAL' : 'FREE_AGENT'),
      autonomy: payload.autonomy || existing?.autonomy || 'DELEGATED',
      availability:
        liveAgent ? 'ONLINE' : payload.availability || existing?.availability || 'IDLE',
      ownerMemberId: ownerMemberId || existing?.ownerMemberId,
      operatorNotes: payload.operatorNotes || existing?.operatorNotes || 'Joined via recruitment book.',
      capabilities: payload.capabilities.length > 0 ? payload.capabilities : existing?.capabilities || [],
      reputation:
        existing?.reputation || {
          score: 500,
          tier: 'REGULAR',
          badges: [],
          completedQuests: 0,
          reliability: 80,
        },
    };

    this.agentProfiles.set(agentId, profile);
    return profile;
  }

  private upsertDelegation(
    memberId: string,
    agentId: string,
    payload: NonNullable<JoinGuildPayload['delegation']>,
  ): GuildDelegationRecord {
    const existing = Array.from(this.delegations.values()).find(
      (delegation) => delegation.memberId === memberId && delegation.agentId === agentId,
    );
    const delegation: GuildDelegationRecord = {
      id: existing?.id || randomUUID(),
      memberId,
      agentId,
      scopes: payload.scopes,
      status: payload.status || existing?.status || 'ACTIVE',
      operatingNote:
        payload.operatingNote ||
        existing?.operatingNote ||
        `${agentId} may act for ${memberId} within the declared guild scopes.`,
    };

    this.delegations.set(delegation.id, delegation);
    return delegation;
  }

  private findMemberIdByHandle(handle?: string): string | undefined {
    if (!handle) {
      return undefined;
    }

    return Array.from(this.members.values()).find((member) => member.handle === handle)?.id;
  }

  private findAgentIdByHandle(handle?: string): string | undefined {
    if (!handle) {
      return undefined;
    }

    return Array.from(this.agentProfiles.values()).find((agent) => agent.handle === handle)?.id;
  }

  private makeHandle(displayName: string, fallbackId: string): string {
    const normalized = displayName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return normalized ? `@${normalized}` : `@${fallbackId.slice(0, 8)}`;
  }

  private upsertMemberFromRegistration(
    memberId: string,
    message: IncomingMessage,
    agentId: string,
  ): void {
    const data = message.data ?? {};
    const existing = this.members.get(memberId);
    const nextAgentIds = new Set(existing?.agentIds ?? []);
    nextAgentIds.add(agentId);

    this.members.set(memberId, {
      id: memberId,
      did: existing?.did || createGuildDid('member', memberId),
      connectionUri: existing?.connectionUri || createGuildConnectionUri('member', memberId),
      handle:
        readOptionalString(data.memberHandle) ||
        readOptionalString(message.memberHandle) ||
        existing?.handle ||
        `@${memberId.slice(0, 8)}`,
      displayName:
        readOptionalString(data.memberName) ||
        readOptionalString(message.memberName) ||
        existing?.displayName ||
        memberId,
      role: existing?.role || 'HYBRID',
      status: existing?.status || 'ACTIVE',
      bio: existing?.bio || 'Member registered through live agent session.',
      specialties: existing?.specialties || [],
      homeRegion: existing?.homeRegion || 'Unknown',
      reputation:
        existing?.reputation || {
          score: 500,
          tier: 'REGULAR',
          badges: [],
          completedQuests: 0,
          reliability: 80,
        },
      agentIds: Array.from(nextAgentIds),
    });
  }

  static resolveDisplayName(state: GuildState, unitId: string): string {
    return (
      state.agentProfiles.get(unitId)?.displayName ||
      state.members.get(unitId)?.displayName ||
      'Unknown'
    );
  }

  static resolveCapabilities(state: GuildState, unitId: string): string[] {
    return (
      state.liveAgents.get(unitId)?.capabilities ||
      state.agentProfiles.get(unitId)?.capabilities ||
      state.members.get(unitId)?.specialties ||
      []
    );
  }
}
