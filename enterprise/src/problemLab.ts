import {
  DelegationScope,
  EnterpriseA2AGovernanceMetadata,
  EnterpriseA2ACommitmentLevel,
} from './domain';

export type GovernanceGapSeverity = 'BLOCKER' | 'WARN';

export type GovernanceGapCode =
  | 'ENTERPRISE_METADATA_MISSING'
  | 'WORK_CONTEXT_MISSING'
  | 'SOURCE_BINDING_MISSING'
  | 'DELEGATION_MISSING'
  | 'POLICY_MISSING'
  | 'POLICY_DENIED'
  | 'APPROVAL_REQUIRED'
  | 'APPROVAL_INCOMPLETE'
  | 'AUDIT_CORRELATION_MISSING'
  | 'RISK_CONTEXT_MISSING'
  | 'COMMITMENT_REQUIRES_APPROVAL'
  | 'FAILURE_REQUIRES_ESCALATION';

export interface A2AMessageLike {
  id: string;
  type: string;
  metadata?: {
    enterprise?: EnterpriseA2AGovernanceMetadata;
    [key: string]: unknown;
  };
}

export interface GovernanceGap {
  code: GovernanceGapCode;
  severity: GovernanceGapSeverity;
  message: string;
}

export interface GovernanceInspection {
  messageId: string;
  canProceed: boolean;
  metadata?: EnterpriseA2AGovernanceMetadata;
  gaps: GovernanceGap[];
}

const mutatingScopes = new Set<DelegationScope>([
  'COMMENT_INTERNAL',
  'COMMENT_EXTERNAL',
  'UPDATE_STATUS',
  'CREATE_WORK',
  'APPROVE_WORK',
  'EXECUTE_SYSTEM_ACTION',
  'SPEND_MONEY',
  'ACCESS_RESTRICTED_DATA',
]);

const commitmentApprovalLevels = new Set<EnterpriseA2ACommitmentLevel>([
  'APPROVAL_REQUESTED',
  'ACTION_EXECUTED',
  'COMMITMENT_MADE',
]);

export function inspectEnterpriseA2AMessage(message: A2AMessageLike): GovernanceInspection {
  const metadata = message.metadata?.enterprise;
  const gaps: GovernanceGap[] = [];

  if (!metadata) {
    return {
      messageId: message.id,
      canProceed: false,
      gaps: [
        {
          code: 'ENTERPRISE_METADATA_MISSING',
          severity: 'BLOCKER',
          message: 'A2A message has no Enterprise Guild governance metadata.',
        },
      ],
    };
  }

  if (!metadata.workItemId) {
    gaps.push({
      code: 'WORK_CONTEXT_MISSING',
      severity: 'BLOCKER',
      message: 'Message is not bound to an enterprise work item.',
    });
  }

  if (!metadata.delegation) {
    gaps.push({
      code: 'DELEGATION_MISSING',
      severity: 'BLOCKER',
      message: 'Message does not reference a delegation grant.',
    });
  }

  if (!metadata.policy) {
    gaps.push({
      code: 'POLICY_MISSING',
      severity: 'BLOCKER',
      message: 'Message does not include a policy evaluation context.',
    });
  }

  if (!metadata.audit?.correlationId) {
    gaps.push({
      code: 'AUDIT_CORRELATION_MISSING',
      severity: 'BLOCKER',
      message: 'Message cannot be correlated with an enterprise audit trail.',
    });
  }

  if (!metadata.risk) {
    gaps.push({
      code: 'RISK_CONTEXT_MISSING',
      severity: 'BLOCKER',
      message: 'Message does not declare data class, policy tags, or commitment level.',
    });
  }

  const requestedScope = metadata.policy?.requestedScope;
  if (requestedScope && mutatingScopes.has(requestedScope) && !metadata.source) {
    gaps.push({
      code: 'SOURCE_BINDING_MISSING',
      severity: 'BLOCKER',
      message: 'Mutating action is not bound to a source-of-truth system record.',
    });
  }

  if (metadata.policy?.decision === 'DENY') {
    gaps.push({
      code: 'POLICY_DENIED',
      severity: 'BLOCKER',
      message: 'Policy decision denies the requested action.',
    });
  }

  if (metadata.policy?.decision === 'ALLOW_WITH_APPROVAL') {
    gaps.push({
      code: 'APPROVAL_REQUIRED',
      severity: metadata.approval?.status === 'APPROVED' ? 'WARN' : 'BLOCKER',
      message: 'Policy requires human approval for the requested action.',
    });
  }

  if (
    metadata.policy?.decision === 'ALLOW_WITH_APPROVAL' &&
    metadata.approval?.status !== 'APPROVED'
  ) {
    gaps.push({
      code: 'APPROVAL_INCOMPLETE',
      severity: 'BLOCKER',
      message: 'Human approval is required but has not been completed.',
    });
  }

  if (
    metadata.risk &&
    commitmentApprovalLevels.has(metadata.risk.commitmentLevel) &&
    metadata.approval?.status !== 'APPROVED'
  ) {
    gaps.push({
      code: 'COMMITMENT_REQUIRES_APPROVAL',
      severity: 'BLOCKER',
      message: 'Executed actions and business commitments require completed approval.',
    });
  }

  if (metadata.failure && metadata.failure.escalationActorId) {
    gaps.push({
      code: 'FAILURE_REQUIRES_ESCALATION',
      severity: 'WARN',
      message: 'Failure includes an escalation owner and should be surfaced to a human.',
    });
  }

  return {
    messageId: message.id,
    canProceed: !gaps.some((gap) => gap.severity === 'BLOCKER'),
    metadata,
    gaps,
  };
}

