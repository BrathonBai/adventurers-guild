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
  GuildPublicSnapshotRecord,
  GuildDelegationRecord,
  GuildMemberRecord,
  GuildQuest,
  GuildSnapshotRecord,
  GuildTask,
  PartyBeacon,
  PartyBeaconResponse,
  PartyMember,
  RequiredMember,
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

export type GuildUnitIdentity = {
  id: string;
  did: string;
  connectionUri: string;
  displayName: string;
  unitType: 'MEMBER' | 'AGENT';
};

export type QuestAcceptanceResult = {
  quest: GuildQuest;
  party?: Party;
  acceptedUnit: GuildUnitIdentity;
  role: string;
};

export const ORCHESTRATOR_AGENT_SKILL = {
  name: 'orchestrator-agent',
  sourcePath: '/Users/rongchongbai/.codex/skills/orchestrator-agent',
  installedFor: 'PARTY_LEADER' as const,
  purpose:
    'Equip the party leader to own workflow state, task routing, retries, validation, resume behavior, and completion criteria until multi-agent work is genuinely complete.',
};

export class QuestAcceptanceError extends Error {
  constructor(
    readonly code:
      | 'DID_NOT_FOUND'
      | 'QUEST_NOT_OPEN'
      | 'ALREADY_IN_TEAM'
      | 'ROLE_REQUIRED'
      | 'ROLE_NOT_FOUND'
      | 'ROLE_FILLED',
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

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
      agent.installedSkills ||= [];
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

    if (this.ensurePartiesForQuests()) {
      this.save();
    }
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
      delegations: Array.from(this.delegations.values()).map((delegation) => this.withDelegationTitle(delegation)),
      partyBeacons: this.listPartyBeacons(),
      activity: this.activityFeed,
    };
  }

  createPublicSnapshot(): GuildPublicSnapshotRecord {
    const publicAgents = Array.from(this.agentProfiles.values()).filter((agent) => this.isPubliclyDiscoverableAgent(agent));
    const publicAgentIds = new Set(publicAgents.map((agent) => agent.id));
    const publicUnitIds = new Set([...Array.from(this.members.keys()), ...publicAgentIds]);

    return {
      members: Array.from(this.members.values()).map((member) => ({
        ...member,
        handle: this.toPublicText(member.handle),
        displayName: this.toPublicText(member.displayName),
        bio: this.toPublicText(member.bio),
        specialties: this.toPublicTextList(member.specialties),
        homeRegion: this.toPublicText(member.homeRegion),
        reputation: {
          ...member.reputation,
          badges: this.toPublicTextList(member.reputation.badges),
        },
        did: '',
        connectionUri: '',
        agentIds: [],
      })),
      agents: publicAgents.map((agent) => this.toPublicAgent(agent)),
      quests: Array.from(this.quests.values()).map((quest) => this.toPublicQuest(quest, publicAgentIds, publicUnitIds)),
      parties: Array.from(this.parties.values()).map((party) => this.toPublicParty(party, publicUnitIds)),
      partyBeacons: this.listPublicPartyBeacons(),
      activity: this.activityFeed
        .filter((entry) => !this.referencesPrivateAgent(entry))
        .slice(0, 50)
        .map((entry) => ({
          ...entry,
          title: this.toPublicText(entry.title),
          detail: this.toPublicText(entry.detail),
        })),
    };
  }

  listPartyBeacons(): PartyBeacon[] {
    const now = Date.now();
    return Array.from(this.partyBeacons.values()).map((beacon) => ({
      ...beacon,
      status: beacon.status === 'OPEN' && beacon.expiresAt <= now ? 'EXPIRED' : beacon.status,
    }));
  }

  listPublicPartyBeacons(): PartyBeacon[] {
    return this.listPartyBeacons()
      .filter((beacon) => beacon.visibility === 'PUBLIC')
      .filter((beacon) => !this.isPrivateUnitDid(beacon.publisherDid))
      .map((beacon) => {
        const publisher = this.resolveUnitByDid(beacon.publisherDid);
        return {
          ...beacon,
          publisherDid: '',
          publisherLabel: beacon.publisherLabel || publisher?.displayName || '已审核身份',
          title: this.toPublicText(beacon.title),
          intent: this.toPublicText(beacon.intent),
          lookingFor: this.toPublicTextList(beacon.lookingFor),
          requiredSkills: this.toPublicTextList(beacon.requiredSkills),
          responses: beacon.responses
            .filter((response) => !this.isPrivateUnitDid(response.responderDid))
            .map((response) => {
              const responder = this.resolveUnitByDid(response.responderDid);
              return {
                ...response,
                responderDid: '',
                responderLabel: response.responderLabel || responder?.displayName || '已审核身份',
                message: this.toPublicText(response.message),
                offeredSkills: this.toPublicTextList(response.offeredSkills),
              };
            }),
        };
      });
  }

  isPubliclyDiscoverableAgent(agent: GuildAgentProfile): boolean {
    const reservedIds = new Set([
      'agent-guild-registrar',
      'agent-guild-steward',
      'agent-daily-broadcast',
    ]);
    const reservedHandles = new Set([
      '@guild-registrar',
      '@guild-steward',
      '@daily-broadcast',
    ]);
    const privilegedTerms = [
      'admin operations',
      'administrator agent',
      'credential issuance',
      'guild registrar',
      'guild steward',
      'guild monitoring',
      'daily broadcast',
      'incident triage',
      'ops reporting',
      'human escalation',
    ];
    const haystack = [
      agent.id,
      agent.handle,
      agent.displayName,
      agent.operatorNotes,
      ...agent.capabilities,
    ]
      .join(' ')
      .toLowerCase();

    if (reservedIds.has(agent.id) || reservedHandles.has(agent.handle)) {
      return false;
    }

    return !privilegedTerms.some((term) => haystack.includes(term));
  }

  private toPublicAgent(agent: GuildAgentProfile): GuildAgentProfile {
    const publicAgent: GuildAgentProfile = {
      ...agent,
      handle: this.toPublicText(agent.handle),
      displayName: this.toPublicText(agent.displayName),
      did: '',
      connectionUri: '',
      operatorNotes: '',
      capabilities: this.toPublicTextList(agent.capabilities),
      installedSkills: (agent.installedSkills ?? []).map((skill) => ({
        ...skill,
        sourcePath: '',
        purpose: this.toPublicText(skill.purpose),
      })),
      reputation: {
        ...agent.reputation,
        badges: this.toPublicTextList(agent.reputation.badges),
      },
    };
    delete publicAgent.ownerMemberId;
    return publicAgent;
  }

  private toPublicQuest(
    quest: GuildQuest,
    publicAgentIds: Set<string>,
    publicUnitIds: Set<string>,
  ): GuildQuest {
    const publisherAgentId =
      quest.publisherAgentId && publicAgentIds.has(quest.publisherAgentId) ? quest.publisherAgentId : undefined;
    const publisherMemberId =
      quest.publisherMemberId && publicUnitIds.has(quest.publisherMemberId) ? quest.publisherMemberId : undefined;
    const publisherId = publicUnitIds.has(quest.publisherId)
      ? quest.publisherId
      : publisherAgentId || publisherMemberId || 'guild-platform';

    return {
      ...quest,
      title: this.toPublicText(quest.title),
      description: this.toPublicText(quest.description),
      publisherId,
      publisherMemberId: undefined,
      publisherAgentId: undefined,
      deadline: quest.deadline ? this.toPublicText(quest.deadline) : undefined,
      reward: quest.reward ? this.toPublicText(quest.reward) : undefined,
      tags: this.toPublicTextList(quest.tags ?? []),
      trustRequirements: this.toPublicTextList(quest.trustRequirements ?? []),
      requiredMembers: quest.requiredMembers.map((member) => ({
        ...member,
        role: this.toPublicText(member.role),
        skills: this.toPublicTextList(member.skills),
      })),
      teamMembers: quest.teamMembers.filter((unitId) => publicUnitIds.has(unitId)),
      subtasks: quest.subtasks.map((subtask) => ({
        ...subtask,
        title: this.toPublicText(subtask.title),
        description: this.toPublicText(subtask.description),
        assignedTo: subtask.assignedTo && publicUnitIds.has(subtask.assignedTo) ? subtask.assignedTo : undefined,
      })),
    };
  }

  private toPublicParty(
    party: Party,
    publicUnitIds: Set<string>,
  ): Party {
    const leaderIsPublic = publicUnitIds.has(party.leaderId);
    const firstPublicMember = party.members.find((member) => publicUnitIds.has(member.userId));

    return {
      ...party,
      name: this.toPublicText(party.name),
      description: party.description ? this.toPublicText(party.description) : undefined,
      missionBrief: party.missionBrief ? this.toPublicText(party.missionBrief) : undefined,
      leaderId: leaderIsPublic ? party.leaderId : firstPublicMember?.userId || 'guild-platform',
      leaderType: leaderIsPublic ? party.leaderType : firstPublicMember?.unitType,
      members: party.members
        .filter((member) => publicUnitIds.has(member.userId))
        .map((member) => ({
          ...member,
          role: this.toPublicText(member.role),
          skills: this.toPublicTextList(member.skills),
        })),
      lookingFor: this.toPublicTextList(party.lookingFor),
      requiredSkills: this.toPublicTextList(party.requiredSkills),
    };
  }

  private isPrivateUnitDid(did: string): boolean {
    const unit = this.resolveUnitByDid(did);
    if (!unit || unit.unitType !== 'AGENT') {
      return false;
    }

    const agent = this.agentProfiles.get(unit.id);
    return agent ? !this.isPubliclyDiscoverableAgent(agent) : false;
  }

  private referencesPrivateAgent(entry: ActivityFeedItem): boolean {
    const text = `${entry.title} ${entry.detail}`.toLowerCase();
    return Array.from(this.agentProfiles.values())
      .filter((agent) => !this.isPubliclyDiscoverableAgent(agent))
      .some((agent) =>
        [agent.id, agent.did, agent.connectionUri, agent.handle, agent.displayName]
          .filter(Boolean)
          .some((identity) => text.includes(identity.toLowerCase())),
      );
  }

  private redactPublicIdentityText(value: string): string {
    return Array.from(this.members.values())
      .reduce(
        (text, member) => this.replaceIdentityInText(text, member.did, member.displayName),
        Array.from(this.agentProfiles.values()).reduce(
          (text, agent) => this.replaceIdentityInText(text, agent.did, agent.displayName),
          value,
        ),
      );
  }

  private replaceIdentityInText(text: string, identity: string, label: string): string {
    return identity ? text.split(identity).join(label) : text;
  }

  private toPublicTextList(values: string[]): string[] {
    return values.map((value) => this.toPublicText(value));
  }

  private toPublicText(value: string): string {
    return this.redactPublicGovernanceText(this.redactPublicRelationshipText(this.redactPublicIdentityText(value)));
  }

  private redactPublicGovernanceText(value: string): string {
    return value
      .split('Agent/Member/Quest/Party/Delegation')
      .join('Agent/Member/Quest/Party/Governance')
      .split('Delegation 可视化')
      .join('权限治理可视化')
      .split('Delegation Title')
      .join('Permission Boundary')
      .split('Delegation')
      .join('权限治理')
      .split('delegation title')
      .join('permission boundary')
      .split('delegation review')
      .join('permission review')
      .split('clear delegation rules')
      .join('clear participation rules')
      .split('delegation rules')
      .join('participation rules')
      .split('delegation')
      .join('permission')
      .split('owner bindings')
      .join('routing boundaries')
      .split('owner binding')
      .join('routing boundary')
      .split('owner accountability')
      .join('public accountability')
      .split('授权关系')
      .join('协作边界')
      .split('代理关系')
      .join('协作边界')
      .split('代表谁')
      .join('责任边界');
  }

  private redactPublicRelationshipText(value: string): string {
    const agentLabels = Array.from(this.agentProfiles.values()).flatMap((agent) => [agent.displayName, agent.handle]);
    const memberLabels = Array.from(this.members.values()).flatMap((member) => [member.displayName, member.handle]);
    const publicText = value
      .split('建立可追溯的协会身份关系')
      .join('完成协会身份登记')
      .split('建立可追溯的身份关系')
      .join('完成身份登记');

    return agentLabels
      .filter(Boolean)
      .reduce(
        (text, agentLabel) =>
          memberLabels
            .filter(Boolean)
            .reduce(
              (innerText, memberLabel) =>
                innerText
                  .split(`${agentLabel} 已与会员 ${memberLabel} 建立可追溯的协会身份关系`)
                  .join(`${agentLabel} 完成协会身份登记`)
                  .split(`${agentLabel} 已与会员 ${memberLabel} 完成协会身份登记`)
                  .join(`${agentLabel} 完成协会身份登记`)
                  .split(`${agentLabel} 代表 ${memberLabel}`)
                  .join(agentLabel)
                  .split(`${memberLabel} 委托 ${agentLabel}`)
                  .join(agentLabel),
              text,
            ),
        publicText,
      );
  }

  createPartyBeacon(payload: CreatePartyBeaconPayload): PartyBeacon {
    const publisherDid = payload.publisherDid;
    if (!publisherDid) {
      throw new Error('publisherDid is required');
    }
    const permission = this.canPublishPartyBeacon(publisherDid);
    if (!permission.ok) {
      throw new Error(permission.message);
    }
    const publisher = this.resolveUnitByDid(publisherDid);

    const beacon: PartyBeacon = {
      id: `beacon-${randomUUID()}`,
      questId: payload.questId,
      partyId: payload.partyId,
      publisherDid,
      publisherLabel: publisher?.displayName,
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
      title: `${publisher?.displayName || '已审核身份'} 发布了组队广播`,
      detail: beacon.intent,
      timestampLabel: 'just now',
    });

    this.save();
    this.audit({ actorDid: publisherDid, action: 'CREATE_PARTY_BEACON', targetType: 'beacon', targetId: beacon.id });

    return beacon;
  }

  publishAgentInitiatedQuest(params: {
    title: string;
    description: string;
    tags: string[];
    publisherDid: string;
    requiredMembers: RequiredMember[];
    triggeredBy: 'MISSION' | 'BEACON_RESPONSE' | 'A2A_REQUEST';
    sourceMissionId?: string;
  }): GuildQuest {
    const publisher = this.resolveUnitByDid(params.publisherDid);
    if (!publisher || publisher.unitType !== 'AGENT') {
      throw new Error('publisherDid must be a registered agent DID');
    }

    const agentProfile = this.agentProfiles.get(publisher.id);
    const quest: GuildQuest = {
      id: this.nextQuestId(),
      title: params.title,
      description: params.description,
      publisherId: publisher.id,
      publisherMemberId: agentProfile?.ownerMemberId,
      publisherAgentId: publisher.id,
      tags: params.tags,
      requiredMembers: params.requiredMembers,
      subtasks: [],
      status: params.requiredMembers.length > 0 ? 'FORMING_PARTY' : 'OPEN',
      teamMembers: [publisher.id],
      createdAt: Date.now(),
      triggeredBy: params.triggeredBy,
      sourceMissionId: params.sourceMissionId,
    };

    this.quests.set(quest.id, quest);
    const party = this.ensurePartyForQuest(quest);
    this.activityFeed.unshift({
      id: `activity-${Date.now()}`,
      kind: 'QUEST_POSTED',
      title: `${publisher.displayName} 自主发布了 Quest`,
      detail: `${quest.title} | 驱动力: ${params.triggeredBy}`,
      timestampLabel: 'just now',
    });
    this.save();
    this.audit({
      actorDid: params.publisherDid,
      actorRole: 'AGENT',
      action: 'AGENT_PUBLISH_QUEST',
      targetType: 'quest',
      targetId: quest.id,
      metadata: {
        partyId: party.id,
        triggeredBy: params.triggeredBy,
        sourceMissionId: params.sourceMissionId,
      },
    });

    return quest;
  }

  checkAgentActionRateLimit(agentId: string, maxActionsPerHour = 10): boolean {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const recentQuests = Array.from(this.quests.values()).filter(
      (quest) => quest.publisherAgentId === agentId && quest.createdAt > oneHourAgo,
    ).length;
    const recentBeacons = Array.from(this.partyBeacons.values()).filter((beacon) => {
      const publisher = this.resolveUnitByDid(beacon.publisherDid);
      return publisher?.id === agentId && beacon.createdAt > oneHourAgo;
    }).length;

    return recentQuests + recentBeacons < maxActionsPerHour;
  }

  revokeAgentInitiatedQuest(questId: string, actorDid?: string, actorRole?: string): GuildQuest | undefined {
    const quest = this.quests.get(questId);
    if (!quest) {
      return undefined;
    }

    const previousStatus = quest.status;
    quest.status = 'CANCELLED';
    this.save();
    this.audit({
      actorDid,
      actorRole,
      action: 'REVOKE_AGENT_ACTION',
      targetType: 'quest',
      targetId: quest.id,
      metadata: { previousStatus, triggeredBy: quest.triggeredBy, sourceMissionId: quest.sourceMissionId },
    });

    return quest;
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

  getUnitByDid(did: string): GuildUnitIdentity | undefined {
    return this.resolveUnitByDid(did);
  }

  ensurePartyForQuest(quest: GuildQuest): Party {
    const existingParty = quest.partyId ? this.parties.get(quest.partyId) : undefined;
    if (existingParty) {
      this.syncPartyWithQuest(existingParty, quest);
      return existingParty;
    }

    const partyId = this.makeQuestPartyId(quest.id);
    const leaderId = quest.publisherAgentId || quest.publisherMemberId || quest.publisherId || quest.teamMembers[0] || 'guild';
    const leaderType = this.getUnitTypeById(leaderId);
    const party: Party = {
      id: partyId,
      questId: quest.id,
      name: `${quest.title} 小队`,
      description: quest.description,
      missionBrief: this.buildQuestMissionBrief(quest),
      leaderId,
      leaderType,
      members: this.buildQuestPartyMembers(quest),
      maxSize: this.calculateQuestPartyMaxSize(quest),
      status: this.derivePartyStatusFromQuest(quest),
      lookingFor: this.getOpenQuestRoles(quest),
      requiredSkills: this.getOpenQuestSkills(quest),
      createdAt: Date.now(),
    };

    this.parties.set(party.id, party);
    quest.partyId = party.id;
    this.ensureOrchestratorSkillForPartyLeader(party);
    return party;
  }

  ensureOrchestratorSkillForPartyLeader(party: Party): boolean {
    if (party.leaderType !== 'AGENT') {
      return false;
    }

    const leader = this.agentProfiles.get(party.leaderId);
    if (!leader) {
      return false;
    }

    leader.installedSkills ||= [];
    if (leader.installedSkills.some((skill) => skill.name === ORCHESTRATOR_AGENT_SKILL.name)) {
      return false;
    }

    leader.installedSkills.push({
      ...ORCHESTRATOR_AGENT_SKILL,
      installedAt: Date.now(),
    });
    return true;
  }

  acceptQuest(questId: string, actorDid: string, role: string, actorRole?: string): QuestAcceptanceResult | undefined {
    const quest = this.quests.get(questId);
    if (!quest) {
      return undefined;
    }

    const acceptedRole = role.trim();
    if (!acceptedRole) {
      throw new QuestAcceptanceError('ROLE_REQUIRED', 'role is required');
    }

    if (quest.status !== 'OPEN' && quest.status !== 'FORMING_PARTY') {
      throw new QuestAcceptanceError('QUEST_NOT_OPEN', 'Quest is not open for acceptance', 409);
    }

    const unit = this.resolveUnitByDid(actorDid);
    if (!unit) {
      throw new QuestAcceptanceError('DID_NOT_FOUND', 'Authenticated DID is not registered in the guild', 403);
    }

    if (quest.teamMembers.includes(unit.id)) {
      throw new QuestAcceptanceError('ALREADY_IN_TEAM', 'You are already in this quest team', 409);
    }

    const requiredMember = quest.requiredMembers.find((member) => member.role === acceptedRole);
    if (!requiredMember) {
      throw new QuestAcceptanceError('ROLE_NOT_FOUND', 'Role not found in quest requirements', 404);
    }

    if (requiredMember.filled >= requiredMember.count) {
      throw new QuestAcceptanceError('ROLE_FILLED', 'This role is already filled', 409);
    }

    quest.teamMembers.push(unit.id);
    requiredMember.filled += 1;
    if (quest.status === 'OPEN') {
      quest.status = 'FORMING_PARTY';
    }

    if (quest.requiredMembers.every((member) => member.filled >= member.count)) {
      quest.status = 'IN_PROGRESS';
    }

    const party = quest.partyId ? this.parties.get(quest.partyId) : undefined;
    if (party && !party.members.some((member) => member.userId === unit.id)) {
      party.members.push({
        userId: unit.id,
        role: acceptedRole,
        skills: requiredMember.skills.length > 0 ? requiredMember.skills : GuildState.resolveCapabilities(this, unit.id),
        status: 'ACTIVE',
        joinedAt: Date.now(),
        unitType: unit.unitType,
      });

      if (requiredMember.filled >= requiredMember.count) {
        party.lookingFor = party.lookingFor.filter((openRole) => openRole !== acceptedRole);
      }

      if (party.status === 'RECRUITING' && party.members.length >= Math.min(party.maxSize, 2)) {
        party.status = 'ACTIVE';
      }
    }
    if (party) {
      this.syncPartyWithQuest(party, quest);
    }

    this.save();
    this.audit({
      actorDid,
      actorRole,
      action: 'ACCEPT_QUEST',
      targetType: 'quest',
      targetId: quest.id,
      metadata: { role: acceptedRole, unitId: unit.id, unitType: unit.unitType, partyId: quest.partyId },
    });

    return { quest, party, acceptedUnit: unit, role: acceptedRole };
  }

  respondToPartyBeacon(beaconId: string, payload: RespondToPartyBeaconPayload): PartyBeaconResponse | undefined {
    const beacon = this.partyBeacons.get(beaconId);
    if (!beacon || beacon.status !== 'OPEN' || beacon.expiresAt <= Date.now()) {
      return undefined;
    }

    const responderDid = payload.responderDid;
    if (!responderDid) {
      throw new Error('responderDid is required');
    }
    const responder = this.resolveUnitByDid(responderDid);
    if (!responder) {
      throw new Error('responderDid is not a registered guild DID');
    }

    const response: PartyBeaconResponse = {
      id: `beacon-response-${randomUUID()}`,
      beaconId,
      responderDid,
      responderLabel: responder.displayName,
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
      title: `${responder.displayName} 响应了组队广播`,
      detail: beacon.title,
      timestampLabel: 'just now',
    });

    this.save();
    this.audit({ actorDid: responderDid, action: 'CREATE_BEACON_RESPONSE', targetType: 'beacon', targetId: beacon.id, metadata: { responseId: response.id } });

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

  private ensurePartiesForQuests(): boolean {
    let changed = false;
    this.quests.forEach((quest) => {
      const beforePartyId = quest.partyId;
      const beforeParty = beforePartyId ? this.parties.get(beforePartyId) : undefined;
      const before = beforeParty
        ? JSON.stringify({
            questId: beforeParty.questId,
            status: beforeParty.status,
            lookingFor: beforeParty.lookingFor,
            requiredSkills: beforeParty.requiredSkills,
            leaderSkillCount: this.agentProfiles.get(beforeParty.leaderId)?.installedSkills?.length ?? 0,
            members: beforeParty.members.map((member) => ({
              userId: member.userId,
              role: member.role,
              unitType: member.unitType,
            })),
          })
        : undefined;

      const party = this.ensurePartyForQuest(quest);
      const after = JSON.stringify({
        questId: party.questId,
        status: party.status,
        lookingFor: party.lookingFor,
        requiredSkills: party.requiredSkills,
        leaderSkillCount: this.agentProfiles.get(party.leaderId)?.installedSkills?.length ?? 0,
        members: party.members.map((member) => ({
          userId: member.userId,
          role: member.role,
          unitType: member.unitType,
        })),
      });

      if (!beforePartyId || beforePartyId !== quest.partyId || before !== after) {
        changed = true;
      }
    });
    return changed;
  }

  private syncPartyWithQuest(party: Party, quest: GuildQuest): void {
    party.questId = quest.id;
    party.lookingFor = this.getOpenQuestRoles(quest);
    party.requiredSkills = this.getOpenQuestSkills(quest);
    party.status = this.derivePartyStatusFromQuest(quest);
    party.maxSize = Math.max(party.maxSize, this.calculateQuestPartyMaxSize(quest));
    party.missionBrief ||= this.buildQuestMissionBrief(quest);

    const assignedRoleCounts = this.countAssignedRequiredRoles(quest, party.members);
    quest.teamMembers.forEach((unitId) => {
      if (party.members.some((member) => member.userId === unitId)) {
        return;
      }

      party.members.push({
        userId: unitId,
        role: this.inferQuestPartyRole(quest, unitId, assignedRoleCounts),
        skills: GuildState.resolveCapabilities(this, unitId),
        status: 'ACTIVE',
        joinedAt: Date.now(),
        unitType: this.getUnitTypeById(unitId),
      });
    });
    this.ensureOrchestratorSkillForPartyLeader(party);
  }

  private buildQuestPartyMembers(quest: GuildQuest): PartyMember[] {
    const assignedRoleCounts = new Map<string, number>();
    return quest.teamMembers.map((unitId) => ({
      userId: unitId,
      role: this.inferQuestPartyRole(quest, unitId, assignedRoleCounts),
      skills: GuildState.resolveCapabilities(this, unitId),
      status: 'ACTIVE',
      joinedAt: quest.createdAt,
      unitType: this.getUnitTypeById(unitId),
    }));
  }

  private inferQuestPartyRole(quest: GuildQuest, unitId: string, assignedRoleCounts: Map<string, number>): string {
    if (unitId === quest.publisherAgentId || unitId === quest.publisherId) {
      return 'Quest coordinator';
    }

    if (unitId === quest.publisherMemberId) {
      return 'Quest sponsor';
    }

    const acceptedRole = quest.requiredMembers.find((member) => {
      const assigned = assignedRoleCounts.get(member.role) ?? 0;
      return assigned < member.filled;
    });
    if (acceptedRole) {
      assignedRoleCounts.set(acceptedRole.role, (assignedRoleCounts.get(acceptedRole.role) ?? 0) + 1);
      return acceptedRole.role;
    }

    return 'Quest member';
  }

  private countAssignedRequiredRoles(quest: GuildQuest, members: PartyMember[]): Map<string, number> {
    const requiredRoles = new Set(quest.requiredMembers.map((member) => member.role));
    const counts = new Map<string, number>();
    members.forEach((member) => {
      if (requiredRoles.has(member.role)) {
        counts.set(member.role, (counts.get(member.role) ?? 0) + 1);
      }
    });
    return counts;
  }

  private getOpenQuestRoles(quest: GuildQuest): string[] {
    return quest.requiredMembers.flatMap((member) => {
      const remaining = Math.max(0, member.count - member.filled);
      if (remaining <= 0) {
        return [];
      }
      return remaining === 1 ? [member.role] : [`${member.role} ×${remaining}`];
    });
  }

  private getOpenQuestSkills(quest: GuildQuest): string[] {
    return Array.from(
      new Set(
        quest.requiredMembers
          .filter((member) => member.filled < member.count)
          .flatMap((member) => member.skills),
      ),
    );
  }

  private calculateQuestPartyMaxSize(quest: GuildQuest): number {
    const requiredSeats = quest.requiredMembers.reduce((sum, member) => sum + member.count, 0);
    return Math.max(2, quest.teamMembers.length, requiredSeats + 1);
  }

  private derivePartyStatusFromQuest(quest: GuildQuest): Party['status'] {
    if (quest.status === 'CANCELLED') {
      return 'DISBANDED';
    }
    if (quest.status === 'REVIEW' || quest.status === 'COMPLETED') {
      return 'DELIVERING';
    }
    if (quest.status === 'IN_PROGRESS') {
      return 'ACTIVE';
    }
    return 'RECRUITING';
  }

  private buildQuestMissionBrief(quest: GuildQuest): string {
    const [firstLine] = quest.description.split('\n').map((line) => line.trim()).filter(Boolean);
    return firstLine || quest.title;
  }

  private makeQuestPartyId(questId: string): string {
    const base = `party-${questId.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || randomUUID()}`;
    if (!this.parties.has(base)) {
      return base;
    }

    let suffix = 2;
    while (this.parties.has(`${base}-${suffix}`)) {
      suffix += 1;
    }
    return `${base}-${suffix}`;
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
    this.ensureOrchestratorSkillForPartyLeader(party);

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

  private resolveUnitByDid(did: string): GuildUnitIdentity | undefined {
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

  private getUnitTypeById(unitId: string): 'MEMBER' | 'AGENT' | undefined {
    if (this.members.has(unitId)) {
      return 'MEMBER';
    }
    if (this.agentProfiles.has(unitId) || this.liveAgents.has(unitId)) {
      return 'AGENT';
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
        ? `${agent.displayName} 完成了协会身份登记。`
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
      installedSkills: existing?.installedSkills || [],
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
      installedSkills: existing?.installedSkills || [],
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
      title:
        payload.title ||
        existing?.title ||
        this.buildDelegationTitle(memberId, agentId),
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

  private withDelegationTitle(delegation: GuildDelegationRecord): GuildDelegationRecord {
    return {
      ...delegation,
      title: delegation.title || this.buildDelegationTitle(delegation.memberId, delegation.agentId),
    };
  }

  private buildDelegationTitle(memberId: string, agentId: string): string {
    const member = this.members.get(memberId);
    const agent = this.agentProfiles.get(agentId);
    const memberName = member?.displayName || member?.handle || memberId;
    const agentName = agent?.displayName || agent?.handle || agentId;
    return `${memberName} → ${agentName}`;
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
