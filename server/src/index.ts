import { GuildServer } from './GuildServer';
import express from 'express';
import path from 'path';
import { createServer } from 'http';
import { loginWithPassword, authMiddleware, expressErrorHandler, requireAdmin, requireRole } from './auth';
import { rateLimit, securityHeaders } from './security';
import { HttpError } from './errors';
import { validateBeaconResponse, validateCreatePartyBeacon, validateJoinGuild } from './validation';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
const UI_PORT = process.env.UI_PORT ? parseInt(process.env.UI_PORT) : 3001;
const BIND_HOST = process.env.BIND_HOST || '0.0.0.0';
const NETWORK_HOST = process.env.NETWORK_HOST || 'localhost';

// 创建 Express 应用（用于静态文件服务）
const app = express();
const httpServer = createServer(app);
const guildServer = new GuildServer(PORT, BIND_HOST, NETWORK_HOST);

app.use(securityHeaders);
app.use(rateLimit());
app.use(express.json({ limit: '64kb' }));
app.use(authMiddleware(guildServer.getDatabase()));

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
  res.json(guildServer.getRecruitmentBookPacket());
});

app.get('/api/guild-snapshot', (req, res) => {
  res.json(guildServer.getPublicGuildSnapshot());
});

app.get('/admin-api/guild-snapshot', requireAdmin, (_req, res) => {
  res.json(guildServer.getGuildSnapshot());
});

app.get('/admin-api/audit-logs', requireAdmin, (_req, res) => {
  res.json({ auditLogs: guildServer.getDatabase().listAuditLogs() });
});

app.post('/admin-api/backup', requireAdmin, (_req, res) => {
  res.json({ backupPath: guildServer.getDatabase().backup() });
});

app.get('/api/node-protocol', (_req, res) => {
  res.json(guildServer.getGuildNodeProtocolPacket());
});

app.get('/api/did/:did', (req, res) => {
  const publicBaseUrl = `${req.protocol}://${req.get('host')}`;
  const document = guildServer.resolveDidDocument(req.params.did, publicBaseUrl);
  if (!document) {
    res.status(404).json({ error: 'DID_NOT_FOUND', message: 'Guild DID not found' });
    return;
  }

  res.json(document);
});

app.get('/api/connections/resolve', (req, res) => {
  const connectionUri = typeof req.query.uri === 'string' ? req.query.uri : '';
  if (!connectionUri) {
    res.status(400).json({ error: 'CONNECTION_URI_REQUIRED', message: 'uri query parameter is required' });
    return;
  }

  const publicBaseUrl = `${req.protocol}://${req.get('host')}`;
  const resolution = guildServer.resolveConnectionUri(connectionUri, publicBaseUrl);
  if (!resolution) {
    res.status(404).json({ error: 'CONNECTION_NOT_FOUND', message: 'Guild connection URI not found' });
    return;
  }

  res.json(resolution);
});

app.get('/api/party-beacons', (_req, res) => {
  res.json({ beacons: guildServer.listPartyBeacons() });
});

app.post('/api/party-beacons', requireRole('MEMBER', 'AGENT'), (req, res, next) => {
  try {
    const payload = validateCreatePartyBeacon(req.body);
    if (req.principal?.did !== payload.publisherDid) {
      throw new HttpError(403, 'DID_MISMATCH', 'publisherDid must match the authenticated identity');
    }
    res.status(201).json({ beacon: guildServer.createPartyBeacon(payload) });
  } catch (error) {
    next(error);
  }
});

app.post('/api/party-beacons/:beaconId/respond', requireRole('MEMBER', 'AGENT'), (req, res, next) => {
  try {
    const payload = validateBeaconResponse(req.body);
    if (req.principal?.did !== payload.responderDid) {
      throw new HttpError(403, 'DID_MISMATCH', 'responderDid must match the authenticated identity');
    }
    const response = guildServer.respondToPartyBeacon(req.params.beaconId, payload);
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
  const reviewerDid = req.body?.reviewerDid;
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
    const response = guildServer.reviewPartyBeaconResponse(req.params.beaconId, req.params.responseId, status, reviewerDid);
    if (!response) {
      res.status(404).json({ error: 'RESPONSE_NOT_FOUND', message: 'Beacon response not found' });
      return;
    }

    res.json({ response });
  } catch (error) {
    next(error);
  }
});

app.post('/api/agent/applications', (req, res, next) => {
  try {
    const payload = validateJoinGuild(req.body);
    guildServer.getDatabase().audit({
      action: 'SUBMIT_AGENT_APPLICATION',
      targetType: 'agent_application',
      metadata: {
        memberHandle: payload.member?.handle,
        agentHandle: payload.agent.handle,
        agentDisplayName: payload.agent.displayName,
      },
    });
    res.status(202).json({ status: 'PENDING_REVIEW', snapshot: guildServer.getPublicGuildSnapshot() });
  } catch (error) {
    next(error);
  }
});

app.post('/admin-api/agent/join', requireAdmin, (req, res, next) => {
  try {
    const result = guildServer.joinGuildFromApi(validateJoinGuild(req.body));
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

// 静态文件服务 - 提供前端构建产物
const distPath = path.join(__dirname, '../../dist');
app.use(express.static(distPath));

// SPA 路由 - 所有路由都返回 index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.use(expressErrorHandler);

// 启动 HTTP 服务器（前端）
httpServer.listen(UI_PORT, BIND_HOST, () => {
  console.log(`🎨 UI Server bound on http://${BIND_HOST}:${UI_PORT}`);
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
  guildServer.close();
  httpServer.close(() => {
    console.log('✅ HTTP server closed');
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log('🚀 Adventurer\'s Guild Server is ready!');
console.log(`🎨 UI: http://${NETWORK_HOST}:${UI_PORT}`);
console.log(`📡 WebSocket: ws://${NETWORK_HOST}:${PORT}`);
