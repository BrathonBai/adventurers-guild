import { GuildRuntime } from './GuildRuntime';
import { QuestAcceptanceError } from './GuildState';
import express from 'express';
import path from 'path';
import { createServer } from 'http';
import { loginWithPassword, authMiddleware, expressErrorHandler, requireAdmin, requireRole } from './auth';
import { agentActionRateLimit, rateLimit, securityHeaders } from './security';
import { HttpError } from './errors';
import { normalizeRequiredMembers } from './messageUtils';
import { validateBeaconResponse, validateCreatePartyBeacon, validateJoinGuild } from './validation';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
const UI_PORT = process.env.UI_PORT ? parseInt(process.env.UI_PORT) : 3001;
const BIND_HOST = process.env.BIND_HOST || '0.0.0.0';
const NETWORK_HOST = process.env.NETWORK_HOST || 'localhost';

// 创建 Express 应用（用于静态文件服务）
const app = express();
const httpServer = createServer(app);
const guildRuntime = new GuildRuntime(PORT, BIND_HOST, NETWORK_HOST);

app.use(securityHeaders);
app.use(rateLimit());
app.use(express.json({ limit: '64kb' }));
app.use(authMiddleware(guildRuntime.getDatabase()));

app.post('/admin-api/auth/login', (req, res, next) => {
  try {
    const token = loginWithPassword(req.body?.username, req.body?.password);
    if (!token) {
      throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid username or password');
    }
    res.json({ token, tokenType: 'Bearer' });
  } catch (error) {
    next(error);
  }
});

app.get('/api/recruitment-book', (_req, res) => {
  res.json(guildRuntime.getRecruitmentBookPacket());
});

app.get('/api/guild-snapshot', (req, res) => {
  res.json(guildRuntime.getPublicGuildSnapshot());
});

app.get('/admin-api/guild-snapshot', requireAdmin, (_req, res) => {
  res.json(guildRuntime.getGuildSnapshot());
});

app.get('/admin-api/audit-logs', requireAdmin, (_req, res) => {
  res.json({ auditLogs: guildRuntime.getDatabase().listAuditLogs() });
});

app.post('/admin-api/backup', requireAdmin, (_req, res) => {
  res.json({ backupPath: guildRuntime.getDatabase().backup() });
});

app.get('/api/node-protocol', (_req, res) => {
  res.json(guildRuntime.getGuildNodeProtocolPacket());
});

app.get('/api/did/:did', requireRole('MEMBER', 'AGENT', 'ADMIN'), (req, res) => {
  const publicBaseUrl = `${req.protocol}://${req.get('host')}`;
  const document = guildRuntime.resolveDidDocument(req.params.did, publicBaseUrl);
  if (!document) {
    res.status(404).json({ error: 'DID_NOT_FOUND', message: 'Guild DID not found' });
    return;
  }

  res.json(document);
});

app.get('/api/connections/resolve', requireRole('MEMBER', 'AGENT', 'ADMIN'), (req, res) => {
  const connectionUri = typeof req.query.uri === 'string' ? req.query.uri : '';
  if (!connectionUri) {
    res.status(400).json({ error: 'CONNECTION_URI_REQUIRED', message: 'uri query parameter is required' });
    return;
  }

  const publicBaseUrl = `${req.protocol}://${req.get('host')}`;
  const resolution = guildRuntime.resolveConnectionUri(connectionUri, publicBaseUrl);
  if (!resolution) {
    res.status(404).json({ error: 'CONNECTION_NOT_FOUND', message: 'Guild connection URI not found' });
    return;
  }

  res.json(resolution);
});

app.get('/api/party-beacons', (_req, res) => {
  res.json({ beacons: guildRuntime.listPublicPartyBeacons() });
});

app.post('/api/a2a/relay', requireRole('MEMBER', 'AGENT'), (req, res, next) => {
  const actorDid = req.principal?.did;
  if (!actorDid) {
    next(new HttpError(403, 'DID_REQUIRED', 'Authenticated identity must include a guild DID'));
    return;
  }

  try {
    const result = guildRuntime.relayA2AMessage(actorDid, req.body);
    res.status(result.status === 'DELIVERED' ? 202 : 409).json(result);
  } catch (error) {
    next(error);
  }
});

app.post('/api/quests/:questId/accept', requireRole('MEMBER', 'AGENT', 'ADMIN'), (req, res, next) => {
  const role = typeof req.body?.role === 'string' ? req.body.role.trim() : '';
  if (!role) {
    next(new HttpError(400, 'INVALID_SCHEMA', 'role is required (for example: "Frontend implementation agent")'));
    return;
  }

  const actorDid = req.principal?.did;
  if (!actorDid) {
    next(new HttpError(403, 'DID_REQUIRED', 'Authenticated identity must include a guild DID to accept a quest'));
    return;
  }

  try {
    const result = guildRuntime.acceptQuest(req.params.questId, actorDid, role, req.principal?.role);
    if (!result) {
      res.status(404).json({ error: 'QUEST_NOT_FOUND', message: 'Quest not found' });
      return;
    }

    res.json(result);
  } catch (error) {
    if (error instanceof QuestAcceptanceError) {
      next(new HttpError(error.status, error.code, error.message));
      return;
    }

    next(error);
  }
});

app.post('/api/party-beacons', requireRole('MEMBER', 'AGENT'), (req, res, next) => {
  try {
    const payload = validateCreatePartyBeacon(req.body);
    if (!req.principal?.did) {
      throw new HttpError(403, 'DID_REQUIRED', 'Authenticated identity must include a guild DID');
    }
    const publisherDid = payload.publisherDid || req.principal.did;
    if (req.principal.did !== publisherDid) {
      throw new HttpError(403, 'DID_MISMATCH', 'publisherDid must match the authenticated identity');
    }
    res.status(201).json({ beacon: guildRuntime.createPartyBeacon({ ...payload, publisherDid }) });
  } catch (error) {
    next(error);
  }
});

app.post('/api/party-beacons/:beaconId/respond', requireRole('MEMBER', 'AGENT'), (req, res, next) => {
  try {
    const payload = validateBeaconResponse(req.body);
    if (!req.principal?.did) {
      throw new HttpError(403, 'DID_REQUIRED', 'Authenticated identity must include a guild DID');
    }
    const responderDid = payload.responderDid || req.principal.did;
    if (req.principal.did !== responderDid) {
      throw new HttpError(403, 'DID_MISMATCH', 'responderDid must match the authenticated identity');
    }
    const response = guildRuntime.respondToPartyBeacon(req.params.beaconId, { ...payload, responderDid });
    if (!response) {
      res.status(404).json({ error: 'BEACON_NOT_OPEN', message: 'Party beacon not found, closed, or expired' });
      return;
    }

    res.status(201).json({ response });
  } catch (error) {
    next(error);
  }
});

app.post('/api/party-beacons/:beaconId/responses/:responseId/review', requireRole('MEMBER', 'AGENT'), (req, res, next) => {
  const status = req.body?.status;
  const reviewerDid = typeof req.body?.reviewerDid === 'string' && req.body.reviewerDid.length > 0
    ? req.body.reviewerDid
    : req.principal?.did;
  if (status !== 'ACCEPTED' && status !== 'DECLINED') {
    res.status(400).json({ error: 'INVALID_RESPONSE_STATUS', message: 'status must be ACCEPTED or DECLINED' });
    return;
  }

  if (typeof reviewerDid !== 'string' || reviewerDid.length === 0) {
    res.status(400).json({ error: 'REVIEWER_DID_REQUIRED', message: 'reviewerDid is required' });
    return;
  }

  if (req.principal?.did !== reviewerDid) {
    next(new HttpError(403, 'DID_MISMATCH', 'reviewerDid must match the authenticated identity'));
    return;
  }

  try {
    const response = guildRuntime.reviewPartyBeaconResponse(req.params.beaconId, req.params.responseId, status, reviewerDid);
    if (!response) {
      res.status(404).json({ error: 'RESPONSE_NOT_FOUND', message: 'Beacon response not found' });
      return;
    }

    res.json({ response });
  } catch (error) {
    next(error);
  }
});

app.get('/api/agent/:agentId/missions', requireRole('MEMBER', 'AGENT', 'ADMIN'), (req, res, next) => {
  try {
    if (!canViewAgentMissions(req.params.agentId, req.principal)) {
      throw new HttpError(403, 'MISSION_FORBIDDEN', 'You can only view missions for your own agent or owned agents');
    }

    res.json({ missions: guildRuntime.missionEngine.getMissionsByAgent(req.params.agentId) });
  } catch (error) {
    next(error);
  }
});

app.get('/admin-api/missions', requireAdmin, (_req, res, next) => {
  try {
    const missions = guildRuntime.missionEngine.getAllActiveMissions();
    res.json({ missions, count: missions.length });
  } catch (error) {
    next(error);
  }
});

app.post('/api/quests/agent-publish', requireRole('AGENT', 'ADMIN'), agentActionRateLimit(10), (req, res, next) => {
  try {
    const actorDid = req.principal?.did;
    if (!actorDid) {
      throw new HttpError(403, 'DID_REQUIRED', 'Authenticated identity must include a guild DID');
    }

    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
    const triggeredBy = req.body?.triggeredBy;
    if (!title || !description || !['MISSION', 'BEACON_RESPONSE', 'A2A_REQUEST'].includes(triggeredBy)) {
      throw new HttpError(400, 'INVALID_SCHEMA', 'title, description, and a valid triggeredBy are required');
    }

    const agent = guildRuntime.getGuildSnapshot().agents.find((candidate) => candidate.did === actorDid);
    if (!agent) {
      throw new HttpError(403, 'AGENT_DID_REQUIRED', 'Authenticated DID must belong to a guild agent');
    }
    if (!guildRuntime.checkAgentActionRateLimit(agent.id)) {
      throw new HttpError(429, 'AGENT_RATE_LIMIT', 'Agent action rate limit exceeded: 10 per hour');
    }

    const sourceMissionId = typeof req.body?.sourceMissionId === 'string' ? req.body.sourceMissionId : undefined;
    if (sourceMissionId) {
      const mission = guildRuntime.missionEngine.getMission(sourceMissionId);
      if (!mission || mission.agentId !== agent.id) {
        throw new HttpError(403, 'MISSION_FORBIDDEN', 'sourceMissionId must belong to the authenticated agent');
      }
    }

    const quest = guildRuntime.publishAgentInitiatedQuest({
      title,
      description,
      tags: Array.isArray(req.body?.tags) ? req.body.tags.filter((tag: unknown): tag is string => typeof tag === 'string') : [],
      publisherDid: actorDid,
      requiredMembers: normalizeRequiredMembers(req.body?.requiredMembers),
      triggeredBy,
      sourceMissionId,
    });

    res.status(201).json({ quest, note: 'Quest created by autonomous agent action' });
  } catch (error) {
    next(error);
  }
});

app.post('/admin-api/revoke-agent-action/:questId', requireAdmin, (req, res, next) => {
  try {
    const quest = guildRuntime.revokeAgentInitiatedQuest(req.params.questId, req.principal?.did, req.principal?.role);
    if (!quest) {
      res.status(404).json({ error: 'QUEST_NOT_FOUND', message: 'Quest not found' });
      return;
    }

    res.json({ quest, message: `Quest "${quest.title}" has been revoked by admin` });
  } catch (error) {
    next(error);
  }
});

app.post('/api/agent/applications', (req, res, next) => {
  try {
    const payload = validateJoinGuild(req.body);
    const application = guildRuntime.getDatabase().createAgentApplication(payload);
    guildRuntime.getDatabase().audit({
      action: 'SUBMIT_AGENT_APPLICATION',
      targetType: 'agent_application',
      targetId: application.id,
      metadata: {
        memberHandle: payload.member?.handle,
        agentHandle: payload.agent.handle,
        agentDisplayName: payload.agent.displayName,
      },
    });
    res.status(202).json({ status: 'PENDING_REVIEW', applicationId: application.id, snapshot: guildRuntime.getPublicGuildSnapshot() });
  } catch (error) {
    next(error);
  }
});

app.get('/api/agent/applications/:applicationId', (req, res, next) => {
  try {
    const application = guildRuntime.getDatabase().getAgentApplication(req.params.applicationId);
    if (!application) {
      res.status(404).json({ error: 'APPLICATION_NOT_FOUND', message: 'Agent application not found' });
      return;
    }
    res.json(application);
  } catch (error) {
    next(error);
  }
});

app.get('/admin-api/agent/applications', requireAdmin, (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const allowedStatuses = ['PENDING_REVIEW', 'APPROVED', 'DECLINED'];
  res.json({
    applications: guildRuntime
      .getDatabase()
      .listAgentApplications(allowedStatuses.includes(status || '') ? status as any : undefined),
  });
});

app.post('/admin-api/agent/join', requireAdmin, (req, res, next) => {
  try {
    const result = guildRuntime.joinGuildFromApi(validateJoinGuild(req.body));
    const applicationId = typeof req.body?.applicationId === 'string' ? req.body.applicationId : undefined;
    if (applicationId) {
      const application = guildRuntime.getDatabase().getAgentApplication(applicationId);
      if (application?.status === 'PENDING_REVIEW') {
        guildRuntime.getDatabase().updateAgentApplicationReview(applicationId, {
          status: 'APPROVED',
          reviewerDid: req.principal?.did,
          reviewNote: 'approved through admin agent join endpoint',
          resultAgentId: result.agent.id,
          credentials: result.credentials,
        });
      }
    }
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

app.post('/admin-api/agent/applications/:applicationId/review', requireAdmin, (req, res, next) => {
  try {
    const application = guildRuntime.getDatabase().getAgentApplication(req.params.applicationId);
    if (!application) {
      res.status(404).json({ error: 'APPLICATION_NOT_FOUND', message: 'Agent application not found' });
      return;
    }
    if (application.status !== 'PENDING_REVIEW') {
      res.status(409).json({ error: 'APPLICATION_ALREADY_REVIEWED', message: 'Agent application has already been reviewed' });
      return;
    }

    const approved = req.body?.approved !== false;
    const reviewNote = typeof req.body?.reviewNote === 'string' ? req.body.reviewNote : undefined;
    if (!approved) {
      const reviewed = guildRuntime.getDatabase().updateAgentApplicationReview(application.id, {
        status: 'DECLINED',
        reviewerDid: req.principal?.did,
        reviewNote,
      });
      guildRuntime.getDatabase().audit({
        actorDid: req.principal?.did,
        actorRole: req.principal?.role,
        action: 'DECLINE_AGENT_APPLICATION',
        targetType: 'agent_application',
        targetId: application.id,
        metadata: { agentHandle: application.payload.agent.handle, reviewNote },
      });
      res.json({ application: reviewed });
      return;
    }

    const result = guildRuntime.joinGuildFromApi(application.payload);
    const reviewed = guildRuntime.getDatabase().updateAgentApplicationReview(application.id, {
      status: 'APPROVED',
      reviewerDid: req.principal?.did,
      reviewNote,
      resultAgentId: result.agent.id,
      credentials: result.credentials,
    });
    guildRuntime.getDatabase().audit({
      actorDid: req.principal?.did,
      actorRole: req.principal?.role,
      action: 'APPROVE_AGENT_APPLICATION',
      targetType: 'agent_application',
      targetId: application.id,
      metadata: { agentId: result.agent.id, agentHandle: result.agent.handle, reviewNote },
    });
    res.status(201).json({ application: reviewed, result });
  } catch (error) {
    next(error);
  }
});

// 静态文件服务 - 提供前端构建产物
const distPath = path.join(__dirname, '../../dist');
app.use(express.static(distPath, {
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-store');
  },
}));

function canViewAgentMissions(agentId: string, principal: Express.Request['principal']): boolean {
  if (principal?.role === 'ADMIN') {
    return true;
  }

  if (!principal?.did) {
    return false;
  }

  const snapshot = guildRuntime.getGuildSnapshot();
  const agent = snapshot.agents.find((candidate) => candidate.id === agentId);
  if (!agent) {
    return false;
  }

  if (agent.did === principal.did) {
    return true;
  }

  const owner = agent.ownerMemberId
    ? snapshot.members.find((member) => member.id === agent.ownerMemberId)
    : undefined;
  return owner?.did === principal.did;
}

// SPA 路由 - 所有路由都返回 index.html
app.get('*', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(distPath, 'index.html'));
});

app.use(expressErrorHandler);

// 启动 HTTP 服务器（前端）
httpServer.listen(UI_PORT, BIND_HOST, () => {
  console.log(`🎨 UI runtime bound on http://${BIND_HOST}:${UI_PORT}`);
  console.log(`🎨 Local UI: http://localhost:${UI_PORT}`);
  console.log(`🎨 Network UI: http://${NETWORK_HOST}:${UI_PORT}`);
  console.log(`📜 Recruitment API: http://${NETWORK_HOST}:${UI_PORT}/api/recruitment-book`);
  console.log(`🪪 Agent Application API: http://${NETWORK_HOST}:${UI_PORT}/api/agent/applications`);
  console.log(`🛡️ Admin API: http://${NETWORK_HOST}:${UI_PORT}/admin-api`);
  console.log(`🔵 Node Protocol API: http://${NETWORK_HOST}:${UI_PORT}/api/node-protocol`);
});

// 优雅关闭
const shutdown = () => {
  console.log('\n👋 Shutting down gracefully...');
  guildRuntime.close();
  httpServer.close(() => {
    console.log('✅ HTTP runtime closed');
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log('🚀 Adventurers Guild runtime is ready!');
console.log(`🎨 UI: http://${NETWORK_HOST}:${UI_PORT}`);
console.log(`📡 WebSocket: ws://${NETWORK_HOST}:${PORT}`);
