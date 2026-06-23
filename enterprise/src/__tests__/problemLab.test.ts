import { inspectEnterpriseA2AMessage } from '../problemLab';
import { EnterpriseA2AGovernanceMetadata } from '../domain';

const baseMetadata: EnterpriseA2AGovernanceMetadata = {
  tenantId: 'tenant-acme',
  workItemId: 'work-incident-1',
  source: {
    system: 'servicenow',
    type: 'incident',
    id: 'INC-10428',
    url: 'https://servicenow.example.com/incident/INC-10428',
    sourceOfTruth: 'EXTERNAL_SYSTEM',
  },
  delegation: {
    delegationGrantId: 'grant-support-agent',
    grantorActorId: 'actor-support-manager',
    granteeAgentId: 'agent-customer-response',
    scopes: ['DRAFT', 'COMMENT_EXTERNAL'],
    approvalMode: 'HUMAN_APPROVAL_REQUIRED',
  },
  policy: {
    policyDecisionId: 'policy-1',
    requestedScope: 'COMMENT_EXTERNAL',
    decision: 'ALLOW_WITH_APPROVAL',
    reasons: ['External customer communication requires approval.'],
  },
  approval: {
    approvalRequestId: 'approval-1',
    status: 'APPROVED',
    requiredApproverActorIds: ['actor-support-manager'],
    approvedByActorId: 'actor-support-manager',
    approvedAt: '2026-06-08T10:00:00.000Z',
  },
  audit: {
    auditEventId: 'audit-1',
    correlationId: 'corr-incident-1',
    evidenceRefs: ['servicenow:INC-10428'],
  },
  risk: {
    dataClass: 'CONFIDENTIAL',
    policyTags: ['customer_impact', 'external_comms_approval_required'],
    commitmentLevel: 'DRAFT',
  },
};

describe('Enterprise A2A problem lab', () => {
  it('blocks a plain A2A-like message that carries no enterprise governance metadata', () => {
    const inspection = inspectEnterpriseA2AMessage({
      id: 'msg-plain-a2a',
      type: 'message',
    });

    expect(inspection.canProceed).toBe(false);
    expect(inspection.gaps).toEqual([
      expect.objectContaining({ code: 'ENTERPRISE_METADATA_MISSING', severity: 'BLOCKER' }),
    ]);
  });

  it('blocks a mutating customer-facing action until human approval is completed', () => {
    const inspection = inspectEnterpriseA2AMessage({
      id: 'msg-external-comment',
      type: 'enterprise.action.execute',
      metadata: {
        enterprise: {
          ...baseMetadata,
          approval: {
            approvalRequestId: 'approval-1',
            status: 'PENDING',
            requiredApproverActorIds: ['actor-support-manager'],
          },
          risk: {
            ...baseMetadata.risk,
            commitmentLevel: 'ACTION_EXECUTED',
          },
        },
      },
    });

    expect(inspection.canProceed).toBe(false);
    expect(inspection.gaps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'APPROVAL_INCOMPLETE', severity: 'BLOCKER' }),
        expect.objectContaining({ code: 'COMMITMENT_REQUIRES_APPROVAL', severity: 'BLOCKER' }),
      ]),
    );
  });

  it('allows an approval-gated external draft after governance context and approval are present', () => {
    const inspection = inspectEnterpriseA2AMessage({
      id: 'msg-approved-draft',
      type: 'enterprise.action.draft',
      metadata: {
        enterprise: baseMetadata,
      },
    });

    expect(inspection.canProceed).toBe(true);
    expect(inspection.gaps).toEqual([
      expect.objectContaining({ code: 'APPROVAL_REQUIRED', severity: 'WARN' }),
    ]);
  });

  it('blocks source-system mutation when the source binding is missing', () => {
    const { source: _source, ...metadataWithoutSource } = baseMetadata;
    const inspection = inspectEnterpriseA2AMessage({
      id: 'msg-missing-source',
      type: 'enterprise.action.execute',
      metadata: {
        enterprise: {
          ...metadataWithoutSource,
          policy: {
            ...baseMetadata.policy,
            requestedScope: 'UPDATE_STATUS',
            decision: 'ALLOW',
          },
        },
      },
    });

    expect(inspection.canProceed).toBe(false);
    expect(inspection.gaps).toEqual([
      expect.objectContaining({ code: 'SOURCE_BINDING_MISSING', severity: 'BLOCKER' }),
    ]);
  });
});

