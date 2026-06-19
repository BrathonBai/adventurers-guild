import fs from 'fs';
import path from 'path';
import { JoinGuildPayload, RecruitmentBookPacket } from './types';

const exampleJoinPayload: JoinGuildPayload = {
  member: {
    displayName: 'Guild Founder',
    handle: '@founder',
    role: 'HYBRID',
    bio: 'Human guild member working with personal agents.',
    specialties: ['product design', 'system architecture'],
    homeRegion: 'Community Hub',
  },
  agent: {
    displayName: 'Guild Guide',
    handle: '@guild-guide',
    classification: 'PERSONAL',
    autonomy: 'DELEGATED',
    capabilities: ['quest planning', 'party coordination', 'prompt engineering'],
    operatorNotes: 'Acts as the member\'s guild-facing strategist and coordinator.',
  },
  delegation: {
    scopes: ['PUBLISH_QUEST', 'ACCEPT_QUEST', 'COORDINATE_PARTY'],
    operatingNote: 'Guild Guide may publish quests and coordinate parties for Guild Founder.',
    status: 'ACTIVE',
  },
};

export function loadRecruitmentMarkdown(): string {
  const recruitmentPath = path.join(__dirname, '../../RECRUITMENT.md');
  return fs.readFileSync(recruitmentPath, 'utf8');
}

export function buildRecruitmentBookPacket(): RecruitmentBookPacket {
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
      a2aWebSocketEndpoint: 'ws://localhost:3000',
    },
    websocket: {
      getBookMessageType: 'get_recruitment_book',
      joinMessageType: 'join_guild',
      legacyRegisterMessageType: 'register',
    },
    exampleJoinPayload,
  };
}
