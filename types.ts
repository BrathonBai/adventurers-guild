// Adventurers Guild - Shared Type Definitions

// ============= V1 Guild Domain =============

export enum GuildMemberStatus {
  ACTIVE = 'ACTIVE',
  AWAY = 'AWAY',
  SUSPENDED = 'SUSPENDED',
}

export enum GuildMemberRole {
  CLIENT = 'CLIENT',
  BUILDER = 'BUILDER',
  HYBRID = 'HYBRID',
  MODERATOR = 'MODERATOR',
}

export enum AgentClassification {
  PERSONAL = 'PERSONAL',
  FREE_AGENT = 'FREE_AGENT',
  GUILD_SERVICE = 'GUILD_SERVICE',
}

export enum AgentAutonomyLevel {
  SUPERVISED = 'SUPERVISED',
  DELEGATED = 'DELEGATED',
  AUTONOMOUS = 'AUTONOMOUS',
}

export enum AgentAvailability {
  ONLINE = 'ONLINE',
  IDLE = 'IDLE',
  OFFLINE = 'OFFLINE',
}

export enum GuildQuestStatus {
  OPEN = 'OPEN',
  FORMING_PARTY = 'FORMING_PARTY',
  ACTIVE = 'ACTIVE',
  REVIEW = 'REVIEW',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum GuildPartyStatus {
  FORMING = 'FORMING',
  ACTIVE = 'ACTIVE',
  DELIVERING = 'DELIVERING',
  DISBANDED = 'DISBANDED',
}

export enum DelegationScope {
  PUBLISH_QUEST = 'PUBLISH_QUEST',
  ACCEPT_QUEST = 'ACCEPT_QUEST',
  NEGOTIATE = 'NEGOTIATE',
  COORDINATE_PARTY = 'COORDINATE_PARTY',
  DELIVER_RESULTS = 'DELIVER_RESULTS',
}

export enum GuildUnitType {
  MEMBER = 'MEMBER',
  AGENT = 'AGENT',
}

export interface GuildReputation {
  score: number;
  tier: ReputationLevel;
  badges: string[];
  completedQuests: number;
  reliability: number;
}

export interface GuildMember {
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
  reputation: GuildReputation;
  agentIds: string[];
}

export interface GuildAgent {
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
  reputation: GuildReputation;
}

export interface GuildQuestReward {
  amount: number;
  currency: string;
  model: 'FIXED' | 'NEGOTIABLE' | 'REV_SHARE';
}

export interface GuildQuestNeed {
  role: string;
  seats: number;
  filled: number;
  preferredUnit: ExecutorType;
  requiredSkills: string[];
}

export interface GuildQuest {
  id: string;
  title: string;
  summary: string;
  status: GuildQuestStatus;
  publisherMemberId?: string;
  publisherAgentId?: string;
  reward: GuildQuestReward;
  tags: string[];
  needs: GuildQuestNeed[];
  trustRequirements: string[];
  deadlineLabel: string;
  partyId?: string;
}

export interface GuildPartyRosterEntry {
  unitType: GuildUnitType;
  unitId: string;
  role: string;
  joinedAtLabel: string;
}

export interface GuildParty {
  id: string;
  questId: string;
  name: string;
  status: GuildPartyStatus;
  leaderUnitType: GuildUnitType;
  leaderUnitId: string;
  missionBrief: string;
  roster: GuildPartyRosterEntry[];
  openRoles: string[];
}

export interface GuildDelegation {
  id: string;
  title?: string;
  memberId: string;
  agentId: string;
  scopes: DelegationScope[];
  status: 'ACTIVE' | 'PAUSED';
  operatingNote: string;
}

export interface GuildActivity {
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

export interface GuildSnapshot {
  members: GuildMember[];
  agents: GuildAgent[];
  quests: GuildQuest[];
  parties: GuildParty[];
  delegations: GuildDelegation[];
  partyBeacons: PartyBeacon[];
  activity: GuildActivity[];
}

export interface JoinGuildMemberInput {
  id?: string;
  handle?: string;
  displayName: string;
  role?: GuildMemberRole;
  bio?: string;
  specialties?: string[];
  homeRegion?: string;
}

export interface JoinGuildAgentInput {
  id?: string;
  handle?: string;
  displayName: string;
  classification?: AgentClassification;
  autonomy?: AgentAutonomyLevel;
  availability?: AgentAvailability;
  capabilities: string[];
  operatorNotes?: string;
}

export interface JoinGuildDelegationInput {
  title?: string;
  scopes: DelegationScope[];
  operatingNote?: string;
  status?: 'ACTIVE' | 'PAUSED';
}

export interface JoinGuildPayload {
  member?: JoinGuildMemberInput;
  agent: JoinGuildAgentInput;
  delegation?: JoinGuildDelegationInput;
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

// ============= Legacy Demo Types =============

export enum UserRole {
  HUMAN = 'HUMAN',
  AGENT_OWNER = 'AGENT_OWNER',
}

export enum ReputationLevel {
  APPRENTICE = 'APPRENTICE',
  REGULAR = 'REGULAR',
  ELITE = 'ELITE',
  LEGENDARY = 'LEGENDARY',
}

export enum QuestStatus {
  PENDING_REVIEW = 'PENDING_REVIEW',
  REVIEWING = 'REVIEWING',
  PUBLISHED = 'PUBLISHED',
  IN_PROGRESS = 'IN_PROGRESS',
  IN_ARBITRATION = 'IN_ARBITRATION',
  COMPLETED = 'COMPLETED',
  REJECTED = 'REJECTED',
}

export enum ExecutorType {
  HUMAN = 'HUMAN',
  AGENT = 'AGENT',
  HYBRID = 'HYBRID',
}

export enum RiskLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

export enum DisputeStatus {
  OPEN = 'OPEN',
  VOTING = 'VOTING',
  RESOLVED = 'RESOLVED',
  ESCALATED = 'ESCALATED',
}

export interface User {
  id: string;
  email: string;
  username: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
  agentConfig?: AgentConfig;
  reputation?: Reputation;
}

export interface AgentConfig {
  id: string;
  userId: string;
  modelType: string;
  capabilities: string[];
  sandboxTested: boolean;
  testResults?: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface Reputation {
  id: string;
  userId: string;
  level: ReputationLevel;
  score: number;
  badges: string[];
  historyLog: ReputationHistoryEntry[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ReputationHistoryEntry {
  date: string;
  action: string;
  scoreChange: number;
  reason: string;
}

export interface Quest {
  id: string;
  title: string;
  description: string;
  tags: string[];
  reward: number;
  status: QuestStatus;
  targetExecutor: ExecutorType;
  executor_type: ExecutorType;
  required_skills: string[];
  difficulty?: 'S' | 'A' | 'B' | 'C' | 'D' | 'E';
  deadline?: Date;
  legalCheckResult?: LegalCheckResult;
  creatorId: string;
  assigneeId?: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

export interface LegalCheckResult {
  is_approved: boolean;
  risk_level: RiskLevel;
  reasoning: string;
  suggested_modifications: string[];
  checked_at: string;
  checker_version: string;
}

export interface Transaction {
  id: string;
  questId: string;
  userId: string;
  amount: number;
  status: 'ESCROWED' | 'RELEASED' | 'REFUNDED';
  createdAt: Date;
  updatedAt: Date;
}

export interface Dispute {
  id: string;
  questId: string;
  initiatorId: string;
  reason: string;
  evidence?: unknown;
  status: DisputeStatus;
  votes: JuryVote[];
  resolution?: string;
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface JuryVote {
  id: string;
  disputeId: string;
  voterId: string;
  vote: 'APPROVE_CREATOR' | 'APPROVE_ASSIGNEE' | 'NEUTRAL';
  reasoning?: string;
  createdAt: Date;
}

export interface Adventurer extends User {
  reputation: Reputation;
  skills: string[];
  availability: boolean;
  currentLoad: number;
}

export interface MatchResult {
  adventurer: Adventurer;
  matchScore: number;
  reasoning: string;
  isHybridRecommendation?: boolean;
  suggestedPartner?: Adventurer;
}

export interface ComplianceCheckRequest {
  taskDescription: string;
  context?: {
    creatorReputation?: number;
    targetExecutor?: ExecutorType;
    reward?: number;
    tags?: string[];
  };
}

export interface ComplianceCheckResponse {
  is_approved: boolean;
  risk_level: RiskLevel;
  reasoning: string;
  suggested_modifications: string[];
  confidence_score: number;
  flags: string[];
}
