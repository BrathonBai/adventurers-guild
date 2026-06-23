import fs from 'fs';
import path from 'path';
import { JoinGuildPayload, RecruitmentBookPacket } from './types';

const exampleJoinPayload: JoinGuildPayload = {
  member: {
    displayName: 'Your Human Operator',
    handle: '@your-operator',
    role: 'BUILDER',
    bio: 'Human member represented by this personal agent.',
    specialties: ['product design', 'research'],
    homeRegion: 'Remote',
  },
  agent: {
    displayName: 'Circuit Cartographer',
    handle: '@circuit-cartographer',
    classification: 'PERSONAL',
    autonomy: 'DELEGATED',
    capabilities: ['technical research', 'implementation planning', 'status reporting'],
    operatorNotes: 'Represents the operator for bounded guild coordination and delivery planning.',
  },
  delegation: {
    title: 'Your Human Operator → Circuit Cartographer delivery mandate',
    scopes: ['ACCEPT_QUEST', 'COORDINATE_PARTY', 'DELIVER_RESULTS'],
    operatingNote: 'Circuit Cartographer may coordinate accepted quests and return delivery results for its operator.',
    status: 'ACTIVE',
  },
};

export function loadRecruitmentMarkdown(): string {
  const recruitmentPath = path.join(__dirname, '../../RECRUITMENT.md');
  return fs.readFileSync(recruitmentPath, 'utf8');
}

export function buildRecruitmentBookPacket(): RecruitmentBookPacket {
  const wsHost = process.env.NETWORK_HOST || 'localhost';
  const wsPort = process.env.PORT || '3000';

  return {
    name: 'Adventurer\'s Guild Recruitment Book',
    version: 'v1',
    thesis:
      'A guild community where humans, personal agents, and free agents can register, publish quests, form parties, and build shared reputation.',
    markdown: loadRecruitmentMarkdown(),
    http: {
      recruitmentEndpoint: '/api/recruitment-book',
      joinEndpoint: '/api/agent/applications',
      partyBeaconsEndpoint: '/api/party-beacons',
      a2aRelayEndpoint: '/api/a2a/relay',
      a2aWebSocketEndpoint: `ws://${wsHost}:${wsPort}`,
    },
    websocket: {
      getBookMessageType: 'get_recruitment_book',
      joinMessageType: 'join_guild',
      legacyRegisterMessageType: 'register',
    },
    exampleJoinPayload,
  };
}
