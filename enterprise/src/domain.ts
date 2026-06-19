export type EnterpriseActorType = 'HUMAN' | 'TEAM' | 'SERVICE_ACCOUNT' | 'EXTERNAL_ORG';

export type EnterpriseAgentType =
  | 'PERSONAL'
  | 'DEPARTMENT'
  | 'WORKFLOW_SERVICE'
  | 'CONNECTOR'
  | 'EXTERNAL'
  | 'GUILD_SERVICE';

export type AutonomyLevel = 'READ_ONLY' | 'DRAFT_ONLY' | 'APPROVAL_GATED' | 'DELEGATED' | 'AUTONOMOUS';

export type DataClassification = 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED' | 'SECRET';

export type WorkStatus =
  | 'NEW'
  | 'TRIAGED'
  | 'FORMING_PARTY'
  | 'IN_PROGRESS'
  | 'WAITING_FOR_APPROVAL'
  | 'BLOCKED'
  | 'DONE'
  | 'CANCELLED';

export type DelegationScope =
  | 'READ'
  | 'SUMMARIZE'
  | 'RECOMMEND'
  | 'DRAFT'
  | 'ROUTE'
  | 'COMMENT_INTERNAL'
  | 'COMMENT_EXTERNAL'
  | 'UPDATE_STATUS'
  | 'CREATE_WORK'
  | 'APPROVE_WORK'
  | 'EXECUTE_SYSTEM_ACTION'
  | 'SPEND_MONEY'
  | 'ACCESS_RESTRICTED_DATA';

export type ApprovalMode = 'NONE' | 'HUMAN_APPROVAL_REQUIRED' | 'TWO_PERSON_APPROVAL' | 'POLICY_FORBIDDEN';

export interface EnterpriseIdentity {
  id: string;
  subject: string;
  displayName: string;
  directorySource?: string;
  did?: string;
}

export interface EnterpriseActor {
  id: string;
  identity: EnterpriseIdentity;
  type: EnterpriseActorType;
  department?: string;
  region?: string;
  managerActorId?: string;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  capabilities: string[];
}

export interface EnterpriseAgent {
  id: string;
  identity: EnterpriseIdentity;
  type: EnterpriseAgentType;
  ownerActorId?: string;
  operatingTeamId?: string;
  runtime: {
    provider: string;
    endpoint?: string;
    version?: string;
  };
  autonomy: AutonomyLevel;
  status: 'ONLINE' | 'IDLE' | 'OFFLINE' | 'SUSPENDED';
  capabilities: string[];
  allowedDataClasses: DataClassification[];
  allowedSystems: string[];
}

export interface DelegationGrant {
  id: string;
  grantorActorId: string;
  granteeAgentId: string;
  scopes: DelegationScope[];
  systems: string[];
  dataClasses: DataClassification[];
  approvalMode: ApprovalMode;
  status: 'ACTIVE' | 'PAUSED' | 'REVOKED' | 'EXPIRED';
  reason: string;
  createdAt: string;
  expiresAt?: string;
}

export interface SourceReference {
  system: string;
  type: string;
  id: string;
  url?: string;
  lastSyncedAt?: string;
}

export interface EnterpriseWorkItem {
  id: string;
  source: SourceReference;
  title: string;
  summary?: string;
  status: WorkStatus;
  priority?: 'P0' | 'P1' | 'P2' | 'P3' | 'P4';
  ownerActorId?: string;
  requesterActorId?: string;
  requiredCapabilities: string[];
  policyTags: string[];
  dataClass: DataClassification;
  sourceOfTruth: 'EXTERNAL_SYSTEM' | 'ENTERPRISE_GUILD';
  allowedAgentScopes: DelegationScope[];
  createdAt: string;
  updatedAt: string;
}

export interface PartyRole {
  role: string;
  requiredCapabilities: string[];
  preferredParticipantType: 'HUMAN' | 'AGENT' | 'HYBRID';
  count: number;
}

export interface EnterprisePartyTemplate {
  id: string;
  name: string;
  description: string;
  workTypes: string[];
  roles: PartyRole[];
  policyTags: string[];
}

export interface EnterprisePartyMember {
  participantId: string;
  participantType: 'ACTOR' | 'AGENT';
  role: string;
  status: 'INVITED' | 'ACTIVE' | 'LEFT' | 'REMOVED';
}

export interface EnterpriseWorkParty {
  id: string;
  workItemId: string;
  templateId?: string;
  name: string;
  status: 'FORMING' | 'ACTIVE' | 'DELIVERING' | 'CLOSED';
  members: EnterprisePartyMember[];
  createdAt: string;
  updatedAt: string;
}

export interface PolicyDecision {
  id: string;
  actorId?: string;
  agentId?: string;
  workItemId?: string;
  requestedScope: DelegationScope;
  decision: 'ALLOW' | 'ALLOW_WITH_APPROVAL' | 'DENY';
  reasons: string[];
  evaluatedAt: string;
}

export interface EnterpriseA2AEnvelope<TPayload = unknown> {
  protocol: 'enterprise-guild-a2a';
  version: 'v1';
  id: string;
  type: string;
  fromAgentId: string;
  toAgentId?: string;
  workItemId?: string;
  partyId?: string;
  delegationGrantId?: string;
  policyTags: string[];
  payload: TPayload;
  createdAt: string;
  nonce?: string;
  signature?: string;
}

export type EnterpriseA2ACommitmentLevel =
  | 'OBSERVATION'
  | 'RECOMMENDATION'
  | 'DRAFT'
  | 'INTENT_TO_ACT'
  | 'APPROVAL_REQUESTED'
  | 'ACTION_EXECUTED'
  | 'COMMITMENT_MADE';

export type EnterpriseA2AFailureClass =
  | 'POLICY_DENIED'
  | 'APPROVAL_REQUIRED'
  | 'AUTHENTICATION_FAILED'
  | 'DELEGATION_EXPIRED'
  | 'DATA_CLASS_FORBIDDEN'
  | 'SOURCE_SYSTEM_ERROR'
  | 'AGENT_UNAVAILABLE'
  | 'UNSAFE_ACTION'
  | 'HUMAN_ESCALATION_REQUIRED';

export interface EnterpriseA2AGovernanceMetadata {
  tenantId: string;
  workItemId?: string;
  partyId?: string;
  source?: SourceReference & {
    sourceOfTruth: EnterpriseWorkItem['sourceOfTruth'];
  };
  delegation?: {
    delegationGrantId: string;
    grantorActorId: string;
    granteeAgentId: string;
    scopes: DelegationScope[];
    approvalMode: ApprovalMode;
  };
  policy?: {
    policyDecisionId?: string;
    requestedScope: DelegationScope;
    decision?: PolicyDecision['decision'];
    reasons?: string[];
  };
  approval?: {
    approvalRequestId?: string;
    status: 'NOT_REQUIRED' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
    requiredApproverActorIds?: string[];
    approvedByActorId?: string;
    approvedAt?: string;
  };
  audit?: {
    auditEventId?: string;
    correlationId: string;
    causationId?: string;
    evidenceRefs?: string[];
  };
  risk: {
    dataClass: DataClassification;
    policyTags: string[];
    commitmentLevel: EnterpriseA2ACommitmentLevel;
  };
  failure?: {
    class: EnterpriseA2AFailureClass;
    message: string;
    retryable: boolean;
    escalationActorId?: string;
  };
}

export interface EnterpriseAuditEvent {
  id: string;
  kind:
    | 'IDENTITY_SYNCED'
    | 'AGENT_REGISTERED'
    | 'DELEGATION_GRANTED'
    | 'DELEGATION_REVOKED'
    | 'WORK_INGESTED'
    | 'PARTY_CREATED'
    | 'POLICY_EVALUATED'
    | 'A2A_MESSAGE_RELAYED'
    | 'SOURCE_SYSTEM_MUTATED'
    | 'HUMAN_APPROVAL_RECORDED';
  actorId?: string;
  agentId?: string;
  workItemId?: string;
  source?: SourceReference;
  detail: string;
  createdAt: string;
}

export interface EnterpriseRuntimeSnapshot {
  actors: EnterpriseActor[];
  agents: EnterpriseAgent[];
  delegationGrants: DelegationGrant[];
  workItems: EnterpriseWorkItem[];
  parties: EnterpriseWorkParty[];
  policyDecisions: PolicyDecision[];
  auditEvents: EnterpriseAuditEvent[];
}
