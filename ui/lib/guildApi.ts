import {
  AgentAutonomyLevel,
  AgentAvailability,
  AgentClassification,
  CreatePartyBeaconPayload,
  DelegationScope,
  ExecutorType,
  GuildActivity,
  GuildMember,
  GuildMemberRole,
  GuildMemberStatus,
  GuildPartyStatus,
  GuildQuest,
  GuildQuestStatus,
  GuildSnapshot,
  GuildUnitType,
  JoinGuildPayload,
  PartyBeaconResponse,
  RecruitmentBookPacket,
  RespondToPartyBeaconPayload,
} from '../../types';

type RuntimeSnapshot = {
  members: Array<{
    id: string;
    did: string;
    connectionUri: string;
    handle: string;
    displayName: string;
    role: GuildMemberRole;
    status: GuildMemberStatus;
    bio: string;
    specialties: string[];
    homeRegion: string;
    reputation: GuildMember['reputation'];
    agentIds: string[];
  }>;
  agents: Array<{
    id: string;
    did: string;
    connectionUri: string;
    handle: string;
    displayName: string;
    classification: AgentClassification;
    autonomy: AgentAutonomyLevel;
    availability: AgentAvailability;
    ownerMemberId?: string;
    operatorNotes: string;
    capabilities: string[];
    installedSkills: Array<{
      name: string;
      sourcePath: string;
      installedFor: 'PARTY_LEADER' | 'GENERAL';
      purpose: string;
      installedAt: number;
    }>;
    reputation: GuildMember['reputation'];
  }>;
  quests: Array<{
    id: string;
    title: string;
    description: string;
    status: 'OPEN' | 'FORMING_PARTY' | 'IN_PROGRESS' | 'REVIEW' | 'COMPLETED' | 'CANCELLED';
    publisherMemberId?: string;
    publisherAgentId?: string;
    reward?: string;
    tags?: string[];
    trustRequirements?: string[];
    requiredMembers: Array<{
      role: string;
      count: number;
      filled: number;
      preferredUnit?: 'HUMAN' | 'AGENT' | 'HYBRID';
      skills: string[];
    }>;
    deadline?: string;
    partyId?: string;
    triggeredBy?: 'MISSION' | 'BEACON_RESPONSE' | 'A2A_REQUEST';
    sourceMissionId?: string;
  }>;
  parties: Array<{
    id: string;
    questId?: string;
    name: string;
    missionBrief?: string;
    leaderId: string;
    leaderType?: 'MEMBER' | 'AGENT';
    members: Array<{
      userId: string;
      role: string;
      joinedAt: number;
      unitType?: 'MEMBER' | 'AGENT';
    }>;
    status: 'RECRUITING' | 'ACTIVE' | 'DELIVERING' | 'DISBANDED';
    lookingFor: string[];
  }>;
  delegations?: GuildSnapshot['delegations'];
  partyBeacons: GuildSnapshot['partyBeacons'];
  activity: GuildActivity[];
};

type JoinGuildResult = {
  status?: 'PENDING_REVIEW';
  applicationId?: string;
  snapshot: RuntimeSnapshot;
};

export const GUILD_API_KEY_STORAGE_KEY = 'adventurers-guild.apiKey';

export async function fetchGuildSnapshot(): Promise<GuildSnapshot> {
  const response = await fetch('/api/guild-snapshot');
  if (!response.ok) {
    throw new Error(`Failed to fetch guild snapshot: ${response.status}`);
  }

  const snapshot = (await response.json()) as RuntimeSnapshot;
  return adaptSnapshot(snapshot);
}

export async function fetchAdminGuildSnapshot(): Promise<GuildSnapshot> {
  const token = readAdminToken();
  const response = await fetch('/admin-api/guild-snapshot', {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch admin guild snapshot: ${response.status}`);
  }

  const snapshot = (await response.json()) as RuntimeSnapshot;
  return adaptSnapshot(snapshot);
}

export async function fetchRecruitmentBook(): Promise<RecruitmentBookPacket> {
  const response = await fetch('/api/recruitment-book');
  if (!response.ok) {
    throw new Error(`Failed to fetch recruitment book: ${response.status}`);
  }

  return (await response.json()) as RecruitmentBookPacket;
}

export async function joinGuild(payload: JoinGuildPayload): Promise<GuildSnapshot> {
  const response = await fetch('/api/agent/applications', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    const message = typeof errorBody?.message === 'string' ? errorBody.message : `Application failed: ${response.status}`;
    throw new Error(message);
  }

  const result = (await response.json()) as JoinGuildResult;
  return adaptSnapshot(result.snapshot);
}

export async function createPartyBeacon(payload: CreatePartyBeaconPayload): Promise<GuildSnapshot> {
  const response = await fetch('/api/party-beacons', {
    method: 'POST',
    headers: writeHeaders(),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, `Create party beacon failed: ${response.status}`));
  }

  return fetchGuildSnapshot();
}

export async function respondToPartyBeacon(
  beaconId: string,
  payload: RespondToPartyBeaconPayload,
): Promise<GuildSnapshot> {
  const response = await fetch(`/api/party-beacons/${encodeURIComponent(beaconId)}/respond`, {
    method: 'POST',
    headers: writeHeaders(),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, `Respond to party beacon failed: ${response.status}`));
  }

  return fetchGuildSnapshot();
}

export async function reviewPartyBeaconResponse(
  beaconId: string,
  responseId: string,
  status: PartyBeaconResponse['status'],
): Promise<GuildSnapshot> {
  const response = await fetch(
    `/api/party-beacons/${encodeURIComponent(beaconId)}/responses/${encodeURIComponent(responseId)}/review`,
    {
      method: 'POST',
      headers: writeHeaders(),
      body: JSON.stringify({ status }),
    },
  );

  if (!response.ok) {
    throw new Error(await readApiError(response, `Review party beacon response failed: ${response.status}`));
  }

  return fetchGuildSnapshot();
}

function adaptSnapshot(snapshot: RuntimeSnapshot): GuildSnapshot {
  return {
    members: snapshot.members,
    agents: snapshot.agents,
    quests: snapshot.quests.map((quest) => ({
      id: quest.id,
      title: quest.title,
      summary: quest.description,
      status: adaptQuestStatus(quest.status),
      publisherMemberId: quest.publisherMemberId,
      publisherAgentId: quest.publisherAgentId,
      reward: parseReward(quest.reward),
      tags: quest.tags ?? [],
      needs: quest.requiredMembers.map((need) => ({
        role: need.role,
        seats: need.count,
        filled: need.filled,
        preferredUnit: adaptExecutorType(need.preferredUnit),
        requiredSkills: need.skills,
      })),
      trustRequirements: quest.trustRequirements ?? [],
      deadlineLabel: quest.deadline ?? '待定',
      partyId: quest.partyId,
      triggeredBy: quest.triggeredBy,
      sourceMissionId: quest.sourceMissionId,
    })),
    parties: snapshot.parties.map((party) => ({
      id: party.id,
      questId: party.questId || '',
      name: party.name,
      status: adaptPartyStatus(party.status),
      leaderUnitType: party.leaderType === 'MEMBER' ? GuildUnitType.MEMBER : GuildUnitType.AGENT,
      leaderUnitId: party.leaderId,
      missionBrief: party.missionBrief || '队伍正在准备任务说明。',
      roster: party.members.map((member) => ({
        unitType: member.unitType === 'MEMBER' ? GuildUnitType.MEMBER : GuildUnitType.AGENT,
        unitId: member.userId,
        role: member.role,
        joinedAtLabel: formatJoinedAt(member.joinedAt),
      })),
      openRoles: party.lookingFor,
    })),
    delegations: (snapshot.delegations ?? []).map((delegation) => ({
      ...delegation,
      title: delegation.title ?? '',
      scopes: delegation.scopes as DelegationScope[],
    })),
    partyBeacons: snapshot.partyBeacons ?? [],
    activity: snapshot.activity,
  };
}

function parseReward(reward?: string): GuildQuest['reward'] {
  if (!reward) {
    return { amount: 0, currency: 'CNY', model: 'NEGOTIABLE' };
  }

  const amountMatch = reward.match(/\d+/);
  const currencyMatch = reward.match(/[A-Z]{3}/);
  const lower = reward.toLowerCase();
  return {
    amount: amountMatch ? Number(amountMatch[0]) : 0,
    currency: currencyMatch?.[0] || 'CNY',
    model: lower.includes('rev') ? 'REV_SHARE' : lower.includes('negotiable') ? 'NEGOTIABLE' : 'FIXED',
  };
}

function adaptQuestStatus(status: RuntimeSnapshot['quests'][number]['status']): GuildQuestStatus {
  switch (status) {
    case 'OPEN':
      return GuildQuestStatus.OPEN;
    case 'FORMING_PARTY':
      return GuildQuestStatus.FORMING_PARTY;
    case 'IN_PROGRESS':
      return GuildQuestStatus.ACTIVE;
    case 'REVIEW':
      return GuildQuestStatus.REVIEW;
    case 'COMPLETED':
      return GuildQuestStatus.COMPLETED;
    default:
      return GuildQuestStatus.CANCELLED;
  }
}

function adaptPartyStatus(status: RuntimeSnapshot['parties'][number]['status']): GuildPartyStatus {
  switch (status) {
    case 'RECRUITING':
      return GuildPartyStatus.FORMING;
    case 'ACTIVE':
      return GuildPartyStatus.ACTIVE;
    case 'DELIVERING':
      return GuildPartyStatus.DELIVERING;
    default:
      return GuildPartyStatus.DISBANDED;
  }
}

function adaptExecutorType(value?: 'HUMAN' | 'AGENT' | 'HYBRID'): ExecutorType {
  switch (value) {
    case 'HUMAN':
      return ExecutorType.HUMAN;
    case 'AGENT':
      return ExecutorType.AGENT;
    default:
      return ExecutorType.HYBRID;
  }
}

function formatJoinedAt(joinedAt: number): string {
  const hours = Math.max(1, Math.round((Date.now() - joinedAt) / (1000 * 60 * 60)));
  return hours < 24 ? `${hours} 小时前` : `${Math.round(hours / 24)} 天前`;
}

async function readApiError(response: Response, fallback: string): Promise<string> {
  const errorBody = await response.json().catch(() => null);
  return typeof errorBody?.message === 'string' ? errorBody.message : fallback;
}

function writeHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const apiKey = readStoredApiKey();
  if (apiKey) {
    headers['X-API-Key'] = apiKey;
  }
  return headers;
}

function readStoredApiKey(): string {
  if (typeof window === 'undefined') {
    return '';
  }
  return window.localStorage.getItem(GUILD_API_KEY_STORAGE_KEY)?.trim() || '';
}

function readAdminToken(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  return (
    window.localStorage.getItem('adventurers-guild.adminToken') ||
    window.localStorage.getItem('guild-admin-token') ||
    ''
  ).trim();
}
