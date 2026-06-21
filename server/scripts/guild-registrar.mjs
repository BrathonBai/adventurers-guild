import fs from 'node:fs';

const BASE_URL = process.env.GUILD_BASE_URL || 'http://127.0.0.1:3001';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const GUILD_REGISTRAR_API_KEY = process.env.GUILD_REGISTRAR_API_KEY;
const RUNTIME_CREDENTIALS_PATH = process.env.GUILD_RUNTIME_CREDENTIALS_PATH || '../data/agent-runtime-credentials.json';
const POLL_MS = Number(process.env.REGISTRAR_POLL_MS || 15000);

const RESERVED_HANDLES = new Set(['@guild-guide', '@scout', '@ember', '@guild-steward', '@guild-registrar']);
const HIGH_RISK_SCOPES = new Set(['PUBLISH_QUEST']);

if (!GUILD_REGISTRAR_API_KEY && (!ADMIN_USERNAME || !ADMIN_PASSWORD)) {
  throw new Error('GUILD_REGISTRAR_API_KEY or ADMIN_USERNAME/ADMIN_PASSWORD are required');
}

let token = '';
let tokenExpiresAt = 0;

async function main() {
  console.log(`Guild Registrar Agent watching ${BASE_URL}`);
  await tick();
  setInterval(() => {
    tick().catch((error) => console.error('registrar tick failed:', error.message));
  }, POLL_MS);
}

async function tick() {
  const applications = await listPendingApplications();
  if (applications.length === 0) {
    console.log('No pending agent applications.');
    return;
  }

  for (const application of applications) {
    const decision = evaluateApplication(application);
    if (!decision.approved) {
      console.log(`Escalate ${application.id}: ${decision.reason}`);
      continue;
    }

    const reviewed = await reviewApplication(application.id, true, decision.reason);
    const agent = reviewed.result?.agent;
    saveIssuedCredentials(reviewed);
    console.log(`Approved ${application.id}: ${agent?.handle || application.payload.agent.handle} (${agent?.did || 'pending did'})`);
  }
}

function evaluateApplication(application) {
  const payload = application.payload;
  const agent = payload.agent;
  const handle = agent.handle || '';
  const scopes = payload.delegation?.scopes || [];

  if (!agent.displayName || !handle.startsWith('@')) {
    return { approved: false, reason: 'agent displayName and @handle are required' };
  }
  if (RESERVED_HANDLES.has(handle)) {
    return { approved: false, reason: `reserved guild handle ${handle}` };
  }
  if (!Array.isArray(agent.capabilities) || agent.capabilities.length === 0) {
    return { approved: false, reason: 'agent capabilities are empty' };
  }
  if (agent.autonomy === 'AUTONOMOUS') {
    return { approved: false, reason: 'autonomous agents require human review' };
  }
  if (agent.classification === 'GUILD_SERVICE') {
    return { approved: false, reason: 'guild-service agents require human review' };
  }
  if (scopes.some((scope) => HIGH_RISK_SCOPES.has(scope))) {
    return { approved: false, reason: 'publish delegation requires human review' };
  }
  if (payload.member && (!payload.member.handle || !payload.member.displayName)) {
    return { approved: false, reason: 'member displayName and handle are required for delegated personal agents' };
  }

  return { approved: true, reason: 'auto-approved low-risk delegated or free-agent application' };
}

async function listPendingApplications() {
  const res = await fetch(`${BASE_URL}/admin-api/agent/applications?status=PENDING_REVIEW`, {
    headers: await adminHeaders(),
  });
  if (!res.ok) {
    throw new Error(`list applications failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()).applications || [];
}

async function reviewApplication(applicationId, approved, reviewNote) {
  const res = await fetch(`${BASE_URL}/admin-api/agent/applications/${encodeURIComponent(applicationId)}/review`, {
    method: 'POST',
    headers: {
      ...(await adminHeaders()),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ approved, reviewNote }),
  });
  if (!res.ok) {
    throw new Error(`review ${applicationId} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function adminHeaders() {
  if (GUILD_REGISTRAR_API_KEY) {
    return { 'X-API-Key': GUILD_REGISTRAR_API_KEY };
  }
  return { Authorization: `Bearer ${await getToken()}` };
}

function saveIssuedCredentials(reviewed) {
  const result = reviewed.result;
  if (!result?.agent || !result.credentials) {
    return;
  }

  let runtime;
  try {
    runtime = JSON.parse(fs.readFileSync(RUNTIME_CREDENTIALS_PATH, 'utf8'));
  } catch {
    runtime = { warning: 'Local runtime secrets. Do not commit or paste publicly.', agents: [] };
  }

  const record = {
    position: 'Auto-approved Adventurer Agent',
    agentId: result.agent.id,
    displayName: result.agent.displayName,
    handle: result.agent.handle,
    did: result.agent.did,
    connectionUri: result.agent.connectionUri,
    classification: result.agent.classification,
    autonomy: result.agent.autonomy,
    capabilities: result.agent.capabilities,
    delegation: result.delegation
      ? { id: result.delegation.id, title: result.delegation.title, scopes: result.delegation.scopes, status: result.delegation.status }
      : undefined,
    credentials: result.credentials,
  };

  const index = runtime.agents.findIndex((agent) => agent.handle === record.handle || agent.did === record.did);
  if (index >= 0) runtime.agents[index] = record;
  else runtime.agents.push(record);
  runtime.updatedAt = new Date().toISOString();
  fs.writeFileSync(RUNTIME_CREDENTIALS_PATH, JSON.stringify(runtime, null, 2));
}

async function getToken() {
  if (token && tokenExpiresAt > Date.now() + 60000) {
    return token;
  }

  const res = await fetch(`${BASE_URL}/admin-api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
  });
  if (!res.ok) {
    throw new Error(`admin login failed: ${res.status} ${await res.text()}`);
  }

  const body = await res.json();
  token = body.token;
  tokenExpiresAt = readTokenExpiry(token);
  return token;
}

function readTokenExpiry(value) {
  try {
    const [encoded] = value.split('.');
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    return Number(payload.exp || 0);
  } catch {
    return Date.now() + 5 * 60 * 1000;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
