import WebSocket from 'ws';

export interface AgentConnection {
  id: string;
  did?: string;
  role?: 'AGENT' | 'ADMIN';
  apiKey?: string;
  ws: WebSocket;
  name: string;
  capabilities: string[];
  registeredAt: number;
}

export interface GuildReputationRecord {
  score: number;
  tier: 'APPRENTICE' | 'REGULAR' | 'ELITE' | 'LEGENDARY';
  badges: string[];
  completedQuests: number;
  reliability: number;
}

export interface GuildMemberRecord {
  id: string;
  did: string;
  connectionUri: string;
  handle: string;
  displayName: string;
  role: 'CLIENT' | 'BUILDER' | 'HYBRID' | 'MODERATOR';
  status: 'ACTIVE' | 'AWAY' | 'SUSPENDED';
  bio: string;
  specialties: string[];
  homeRegion: string;
  reputation: GuildReputationRecord;
  agentIds: string[];
}

export interface GuildAgentProfile {
  id: string;
  did: string;
  connectionUri: string;
  handle: string;
  displayName: string;
  classification: 'PERSONAL' | 'FREE_AGENT' | 'GUILD_SERVICE';
  autonomy: 'SUPERVISED' | 'DELEGATED' | 'AUTONOMOUS';
  availability: 'ONLINE' | 'IDLE' | 'OFFLINE';
  ownerMemberId?: string;
  operatorNotes: string;
  capabilities: string[];
  installedSkills: GuildInstalledSkill[];
  reputation: GuildReputationRecord;
}

export interface GuildInstalledSkill {
  name: string;
  sourcePath: string;
  installedFor: 'PARTY_LEADER' | 'GENERAL';
  purpose: string;
  installedAt: number;
}

export interface GuildDelegationRecord {
  id: string;
  title?: string;
  memberId: string;
  agentId: string;
  scopes: Array<
    'PUBLISH_QUEST' | 'ACCEPT_QUEST' | 'NEGOTIATE' | 'COORDINATE_PARTY' | 'DELIVER_RESULTS'
  >;
  status: 'ACTIVE' | 'PAUSED';
  operatingNote: string;
}

export interface ActivityFeedItem {
  id: string;
  kind:
    | 'QUEST_POSTED'
    | 'PARTY_FORMED'
    | 'AGENT_JOINED'
    | 'DELIVERABLE_SUBMITTED'
    | 'PARTY_BEACON_PUBLISHED'
    | 'PARTY_BEACON_RESPONDED'
    | 'A2A_MESSAGE_RELAYED';
  title: string;
  detail: string;
  timestampLabel: string;
}

export interface PartyBeaconResponse {
  id: string;
  beaconId: string;
  responderDid: string;
  responderLabel?: string;
  message: string;
  offeredSkills: string[];
  contactPolicy: 'AGENT_RELAY' | 'DIRECT_AFTER_ACCEPT' | 'PUBLIC';
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED';
  createdAt: number;
}

export interface PartyBeacon {
  id: string;
  questId?: string;
  partyId?: string;
  publisherDid: string;
  publisherLabel?: string;
  title: string;
  intent: string;
  lookingFor: string[];
  requiredSkills: string[];
  visibility: 'PUBLIC' | 'GUILD_ONLY' | 'INVITE_ONLY';
  status: 'OPEN' | 'CLOSED' | 'EXPIRED';
  expiresAt: number;
  createdAt: number;
  responses: PartyBeaconResponse[];
}

export interface CreatePartyBeaconPayload {
  questId?: string;
  partyId?: string;
  publisherDid?: string;
  title: string;
  intent: string;
  lookingFor?: string[];
  requiredSkills?: string[];
  visibility?: PartyBeacon['visibility'];
  ttlHours?: number;
}

export interface RespondToPartyBeaconPayload {
  responderDid?: string;
  message: string;
  offeredSkills?: string[];
  contactPolicy?: PartyBeaconResponse['contactPolicy'];
}

export interface GuildA2AMessage<T = unknown> {
  protocol: 'guild-a2a';
  version: 'v1';
  id: string;
  type: string;
  fromDid: string;
  toDid?: string;
  context?: {
    questId?: string;
    partyId?: string;
    beaconId?: string;
    delegationId?: string;
  };
  payload: T;
  createdAt: number;
  signature?: string;
}

export interface GuildDidDocument {
  '@context': string[];
  id: string;
  alsoKnownAs: string[];
  controller: string;
  verificationMethod: Array<{
    id: string;
    type: 'JsonWebKey2020';
    controller: string;
    publicKeyJwk: Record<string, unknown>;
  }>;
  authentication: string[];
  assertionMethod: string[];
  service: Array<{
    id: string;
    type: 'GuildProfile' | 'GuildA2A' | 'GuildPartyBeacon';
    serviceEndpoint: string;
  }>;
}

export interface GuildConnectionResolution {
  connectionUri: string;
  did: string;
  id: string;
  unitType: 'MEMBER' | 'AGENT';
  displayName: string;
  profileEndpoint: string;
  partyBeaconsEndpoint: string;
  a2aEndpoint: string;
}

export type GuildPermissionCheck =
  | { ok: true }
  | { ok: false; code: 'DID_NOT_FOUND' | 'DELEGATION_REQUIRED' | 'REVIEW_FORBIDDEN'; message: string };

export interface PartyMember {
  userId: string;
  role: string;
  skills: string[];
  status: 'PENDING' | 'ACTIVE' | 'LEFT';
  joinedAt: number;
  unitType?: 'MEMBER' | 'AGENT';
}

export interface Party {
  id: string;
  questId?: string;
  name: string;
  description?: string;
  missionBrief?: string;
  leaderId: string;
  leaderType?: 'MEMBER' | 'AGENT';
  members: PartyMember[];
  maxSize: number;
  status: 'RECRUITING' | 'ACTIVE' | 'DELIVERING' | 'DISBANDED';
  lookingFor: string[];
  requiredSkills: string[];
  createdAt: number;
}

export interface RequiredMember {
  role: string;
  count: number;
  filled: number;
  skills: string[];
  preferredUnit?: 'HUMAN' | 'AGENT' | 'HYBRID';
}

export interface QuestSubtask {
  title: string;
  estimatedHours: number;
  description: string;
  assignedTo?: string;
}

export interface GuildQuest {
  id: string;
  title: string;
  description: string;
  publisherId: string;
  publisherMemberId?: string;
  publisherAgentId?: string;
  deadline?: string;
  reward?: string;
  tags?: string[];
  trustRequirements?: string[];
  requiredMembers: RequiredMember[];
  subtasks: QuestSubtask[];
  status: 'OPEN' | 'FORMING_PARTY' | 'IN_PROGRESS' | 'REVIEW' | 'COMPLETED' | 'CANCELLED';
  teamMembers: string[];
  createdAt: number;
  partyId?: string;
  triggeredBy?: 'MISSION' | 'BEACON_RESPONSE' | 'A2A_REQUEST';
  sourceMissionId?: string;
}

export interface AgentMission {
  id: string;
  agentId: string;
  title: string;
  description: string;
  checkIntervalMinutes: number;
  triggerCondition: string;
  actionType: 'PUBLISH_QUEST' | 'BROADCAST_BEACON' | 'A2A_MESSAGE' | 'SELF_ASSIGN';
  actionTemplate: string;
  active: boolean;
  createdAt: number;
  updatedAt: number;
  lastTriggeredAt?: number;
}

export interface AgentMissionPayload {
  title: string;
  description: string;
  checkIntervalMinutes: number;
  triggerCondition: string;
  actionType: AgentMission['actionType'];
  actionTemplate: string;
  active?: boolean;
}

export interface MissionTriggerEvent {
  type: 'mission_trigger';
  missionId: string;
  missionTitle: string;
  triggerCondition: string;
  actionType: AgentMission['actionType'];
  actionTemplate: string;
  snapshot: GuildPublicSnapshotRecord;
  triggeredAt: number;
}

export interface GuildTask {
  id: string;
  questId: string;
  partyId: string;
  title: string;
  description: string;
  assigneeId: string;
  status: 'assigned' | 'in_progress' | 'completed' | 'blocked';
  progress: number;
  notes?: string;
}

export interface GuildSnapshotRecord {
  members: GuildMemberRecord[];
  agents: GuildAgentProfile[];
  quests: GuildQuest[];
  parties: Party[];
  delegations: GuildDelegationRecord[];
  partyBeacons: PartyBeacon[];
  activity: ActivityFeedItem[];
}

export type GuildPublicSnapshotRecord = Partial<GuildSnapshotRecord>;

export interface JoinGuildMemberPayload {
  id?: string;
  handle?: string;
  displayName: string;
  role?: GuildMemberRecord['role'];
  bio?: string;
  specialties?: string[];
  homeRegion?: string;
}

export interface JoinGuildAgentPayload {
  id?: string;
  handle?: string;
  displayName: string;
  classification?: GuildAgentProfile['classification'];
  autonomy?: GuildAgentProfile['autonomy'];
  availability?: GuildAgentProfile['availability'];
  capabilities: string[];
  operatorNotes?: string;
}

export interface JoinGuildDelegationPayload {
  title?: string;
  scopes: GuildDelegationRecord['scopes'];
  operatingNote?: string;
  status?: GuildDelegationRecord['status'];
}

export interface JoinGuildPayload {
  member?: JoinGuildMemberPayload;
  agent: JoinGuildAgentPayload;
  delegation?: JoinGuildDelegationPayload;
}

export interface AgentApplicationRecord {
  id: string;
  payload: JoinGuildPayload;
  status: 'PENDING_REVIEW' | 'APPROVED' | 'DECLINED';
  submittedAt: number;
  reviewedAt?: number;
  reviewerDid?: string;
  reviewNote?: string;
  resultAgentId?: string;
  credentials?: {
    apiKey: string;
    keyId: string;
    subjectDid: string;
  };
}

export interface GuildJoinResult {
  member?: GuildMemberRecord;
  agent: GuildAgentProfile;
  delegation?: GuildDelegationRecord;
  credentials?: {
    apiKey: string;
    keyId: string;
    subjectDid: string;
  };
  snapshot: GuildSnapshotRecord;
}

export interface RecruitmentBookPacket {
  name: string;
  version: string;
  thesis: string;
  markdown: string;
  http: {
    recruitmentEndpoint: string;
    joinEndpoint: string;
    partyBeaconsEndpoint: string;
    a2aRelayEndpoint: string;
    a2aWebSocketEndpoint?: string;
  };
  websocket: {
    getBookMessageType: 'get_recruitment_book';
    joinMessageType: 'join_guild';
    legacyRegisterMessageType: 'register';
  };
  exampleJoinPayload: JoinGuildPayload;
}

export interface GuildNodeProtocolPacket {
  name: string;
  version: string;
  thesis: string;
  transport: {
    gatewayToServer: 'HTTP_JSON' | 'WEBSOCKET_JSON';
    nodeToGateway: 'BLE_JSON';
  };
  endpoints: {
    protocol: string;
    guildSnapshot: string;
    agentJoin: string;
    a2aRelay: string;
  };
  messages: {
    registerGateway: Record<string, unknown>;
    registerNode: Record<string, unknown>;
    nodeEvent: Record<string, unknown>;
    nodeAction: Record<string, unknown>;
  };
}

export interface GuildBootstrapState {
  members: GuildMemberRecord[];
  agents: GuildAgentProfile[];
  quests: GuildQuest[];
  parties: Party[];
  delegations: GuildDelegationRecord[];
  activity: ActivityFeedItem[];
}

export type IncomingMessage = {
  type: string;
  data?: Record<string, any>;
  [key: string]: any;
};
