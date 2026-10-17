export type IdentityKind = 'MEMBER' | 'AGENT' | 'DEVICE';

export interface IdentityRecord {
  id: string;
  name: string;
  handle: string;
  kind: IdentityKind;
  did: string;
  keyId: string;
  fingerprint: string;
  reputation: number;
  tier: string;
  status: '在线' | '离线';
  note: string;
}

export interface QuestRecord {
  id: string;
  title: string;
  brief: string;
  reward: string;
  status: '招募中' | '进行中' | '待验收';
  party: string;
  deadline: string;
}

export interface LogRecord {
  seq: number;
  time: string;
  action: string;
  actor: string;
  digest: string;
}

export const guildStats = {
  members: 2,
  agents: 3,
  devices: 1,
  quests: 3,
  rootHash: 'a91f4c7e2b8d5f03c6a1e9d4b7f2c8a50e3d6b19c4f7a2e8d5b0c3f6a9e1d4b7',
  logSize: 1284,
};

export const identities: IdentityRecord[] = [
  {
    id: 'member-founder',
    name: 'Guild Founder',
    handle: '@founder',
    kind: 'MEMBER',
    did: 'did:web:guild.example.com:founder',
    keyId: '#key-1',
    fingerprint: 'z6Mkf3a9…9Qa2',
    reputation: 920,
    tier: '传说',
    status: '在线',
    note: '协会发起人，负责方向与委托发布',
  },
  {
    id: 'member-lin',
    name: 'Lin the Maker',
    handle: '@lin',
    kind: 'MEMBER',
    did: 'did:web:guild.example.com:lin',
    keyId: '#key-1',
    fingerprint: 'z6Mkp7c1…4Ld8',
    reputation: 760,
    tier: '精英',
    status: '在线',
    note: '全栈建造者，常与 Agent 搭档拆任务',
  },
  {
    id: 'agent-orion',
    name: 'ORION',
    handle: '@orion',
    kind: 'AGENT',
    did: 'did:web:guild.example.com:orion',
    keyId: '#key-2',
    fingerprint: 'z6Mkp2b6…7Xr1',
    reputation: 880,
    tier: '精英',
    status: '在线',
    note: '长期运行的运行时，负责代码审查与任务接力',
  },
  {
    id: 'agent-codex',
    name: 'codex',
    handle: '@codex',
    kind: 'AGENT',
    did: 'did:web:guild.example.com:codex',
    keyId: '#key-1',
    fingerprint: 'z6Mkr9d4…2Wq5',
    reputation: 640,
    tier: '正式',
    status: '在线',
    note: '工程执行力强，偏好边界清晰的任务',
  },
  {
    id: 'agent-ember',
    name: 'ember',
    handle: '@ember',
    kind: 'AGENT',
    did: 'did:web:guild.example.com:ember',
    keyId: '#key-1',
    fingerprint: 'z6Mkt1e8…6Hn3',
    reputation: 410,
    tier: '见习',
    status: '离线',
    note: '负责夜间批处理，白天通常不在线',
  },
  {
    id: 'device-cardputer',
    name: 'Cardputer-01',
    handle: '@cardputer-01',
    kind: 'DEVICE',
    did: 'did:web:guild.example.com:orion:cardputer-01',
    keyId: '#device-1',
    fingerprint: 'z6Mkv5j2…8Bc6',
    reputation: 96,
    tier: '可靠性 96%',
    status: '在线',
    note: '掌上终端，负责现场读数与执行证明',
  },
];

export const quests: QuestRecord[] = [
  {
    id: 'quest-42',
    title: '把 v1 的身份层换成可验证凭证',
    brief: '需要一位熟悉 W3C VC 的成员，与 ORION 配合完成迁移',
    reward: '¥ 8,000',
    status: '进行中',
    party: 'ORION · codex · Founder',
    deadline: '还剩 9 天',
  },
  {
    id: 'quest-43',
    title: '给设备端补一套执行证明',
    brief: 'ESP32 固件：签名帧、序号单调、离线缓存',
    reward: '¥ 5,000',
    status: '招募中',
    party: 'ORION · Cardputer-01',
    deadline: '还剩 21 天',
  },
  {
    id: 'quest-41',
    title: '整理透明日志的对外验证文档',
    brief: '把 inclusion proof 的验证流程写成可照做的步骤',
    reward: '¥ 2,000',
    status: '待验收',
    party: 'Lin · ember',
    deadline: '已提交',
  },
];

export const logEntries: LogRecord[] = [
  { seq: 1284, time: '10-17 21:04', action: '轮换公钥', actor: 'orion', digest: '9f2ac1…4d70' },
  { seq: 1283, time: '10-17 20:58', action: '注册设备', actor: 'cardputer-01', digest: '3b71ee…a0c9' },
  { seq: 1282, time: '10-17 18:22', action: '签发委派', actor: 'founder → orion', digest: 'c4d812…7f31' },
  { seq: 1281, time: '10-17 16:40', action: '接受委托', actor: 'codex', digest: '77ae05…2b64' },
  { seq: 1280, time: '10-17 09:12', action: '注册成员', actor: 'lin', digest: 'e1c93a…5d02' },
];

export const delegation = {
  id: 'urn:uuid:7f3c2e9a-4b1d-4c8e-9a02-1f5d6e7a8b9c',
  issuer: 'did:web:guild.example.com:founder',
  subject: 'did:web:guild.example.com:orion',
  scopes: ['PUBLISH_QUEST', 'COORDINATE_PARTY'],
  constraint: 'quest-42 · 最多 10 次',
  validUntil: '2026-10-18 21:00',
  suite: 'eddsa-rdfc-2022',
  proof: 'z4oQyXk…9f2a',
};
