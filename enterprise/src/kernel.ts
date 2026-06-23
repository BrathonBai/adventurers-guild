import {
  DelegationGrant,
  DelegationScope,
  EnterpriseA2AEnvelope,
  EnterpriseActor,
  EnterpriseAgent,
  EnterpriseAuditEvent,
  EnterprisePartyTemplate,
  EnterpriseRuntimeSnapshot,
  EnterpriseWorkItem,
  EnterpriseWorkParty,
  PolicyDecision,
  SourceReference,
} from './domain';

export interface EnterpriseConnector<TNativeRecord = unknown> {
  system: string;
  listChangedRecords(since?: string): Promise<TNativeRecord[]>;
  toWorkItem(record: TNativeRecord): Promise<EnterpriseWorkItem>;
  mutateSource?(input: SourceMutationRequest): Promise<SourceMutationResult>;
}

export interface SourceMutationRequest {
  source: SourceReference;
  scope: DelegationScope;
  payload: unknown;
  requestedByAgentId: string;
  workItemId: string;
  delegationGrantId?: string;
}

export interface SourceMutationResult {
  ok: boolean;
  source: SourceReference;
  message: string;
  externalAuditId?: string;
}

export interface PolicyEvaluationInput {
  agentId: string;
  workItemId?: string;
  source?: SourceReference;
  requestedScope: DelegationScope;
  payload?: unknown;
}

export interface PartyFormationInput {
  workItemId: string;
  templateId?: string;
  requiredCapabilities?: string[];
}

export interface EnterpriseGuildKernel {
  registerActor(actor: EnterpriseActor): Promise<EnterpriseActor>;
  registerAgent(agent: EnterpriseAgent): Promise<EnterpriseAgent>;
  grantDelegation(grant: DelegationGrant): Promise<DelegationGrant>;
  revokeDelegation(grantId: string, reason: string): Promise<DelegationGrant>;

  ingestWorkItem(workItem: EnterpriseWorkItem): Promise<EnterpriseWorkItem>;
  syncConnector(connector: EnterpriseConnector, since?: string): Promise<EnterpriseWorkItem[]>;

  evaluatePolicy(input: PolicyEvaluationInput): Promise<PolicyDecision>;
  formParty(input: PartyFormationInput): Promise<EnterpriseWorkParty>;
  registerPartyTemplate(template: EnterprisePartyTemplate): Promise<EnterprisePartyTemplate>;

  relayA2A<TPayload>(message: EnterpriseA2AEnvelope<TPayload>): Promise<EnterpriseA2AEnvelope<TPayload>>;
  appendAudit(event: EnterpriseAuditEvent): Promise<EnterpriseAuditEvent>;
  createSnapshot(): Promise<EnterpriseRuntimeSnapshot>;
}

export interface EnterpriseMethodologyCheckpoint {
  phase:
    | 'WORK_DISCOVERY'
    | 'IDENTITY_AND_AUTHORITY'
    | 'WORK_NORMALIZATION'
    | 'PARTY_AND_ROUTING'
    | 'GOVERNANCE_AND_AUDIT'
    | 'PILOT_IMPLEMENTATION'
    | 'SCALE_OUT';
  requiredArtifacts: string[];
  exitCriteria: string[];
}

export const ENTERPRISE_GUILD_METHOD: EnterpriseMethodologyCheckpoint[] = [
  {
    phase: 'WORK_DISCOVERY',
    requiredArtifacts: ['workflow inventory', 'source-of-truth map', 'pilot candidate list'],
    exitCriteria: ['one measurable pilot workflow selected', 'business owner identified'],
  },
  {
    phase: 'IDENTITY_AND_AUTHORITY',
    requiredArtifacts: ['actor model', 'agent registry', 'delegation matrix'],
    exitCriteria: ['all pilot agents have owners and autonomy levels'],
  },
  {
    phase: 'WORK_NORMALIZATION',
    requiredArtifacts: ['work schema', 'connector mapping', 'allowed mutation list'],
    exitCriteria: ['source records can become EnterpriseWorkItem objects'],
  },
  {
    phase: 'PARTY_AND_ROUTING',
    requiredArtifacts: ['capability taxonomy', 'party templates', 'routing rules'],
    exitCriteria: ['pilot work can be matched to humans and agents'],
  },
  {
    phase: 'GOVERNANCE_AND_AUDIT',
    requiredArtifacts: ['policy gates', 'audit schema', 'escalation rules'],
    exitCriteria: ['high-impact actions require approval or are blocked'],
  },
  {
    phase: 'PILOT_IMPLEMENTATION',
    requiredArtifacts: ['pilot connector', 'pilot dashboard', 'operator guide'],
    exitCriteria: ['baseline and post-pilot KPIs can be compared'],
  },
  {
    phase: 'SCALE_OUT',
    requiredArtifacts: ['reusable templates', 'expansion roadmap', 'governance review'],
    exitCriteria: ['second workflow can reuse the kernel without conceptual rewrite'],
  },
];

