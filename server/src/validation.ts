import { HttpError } from './errors';
import { CreatePartyBeaconPayload, JoinGuildPayload, RespondToPartyBeaconPayload } from './types';

const MAX_TEXT = 4000;
const ALLOWED_DELEGATION_SCOPES = ['PUBLISH_QUEST', 'ACCEPT_QUEST', 'NEGOTIATE', 'COORDINATE_PARTY', 'DELIVER_RESULTS'] as const;

function stringField(value: unknown, name: string, required = true): string | undefined {
  if (typeof value !== 'string' || value.length === 0) {
    if (required) throw new HttpError(400, 'INVALID_SCHEMA', `${name} is required`);
    return undefined;
  }
  if (value.length > MAX_TEXT) throw new HttpError(400, 'INVALID_SCHEMA', `${name} is too long`);
  return value;
}

function requiredString(value: unknown, name: string): string {
  return stringField(value, name, true) as string;
}

function stringArray(value: unknown, name: string): string[] | undefined {
  if (typeof value === 'undefined') return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.length > 200)) {
    throw new HttpError(400, 'INVALID_SCHEMA', `${name} must be a string array`);
  }
  return value.slice(0, 50);
}

export function validateCreatePartyBeacon(input: any): CreatePartyBeaconPayload {
  return {
    publisherDid: requiredString(input?.publisherDid, 'publisherDid'),
    title: requiredString(input?.title, 'title'),
    intent: requiredString(input?.intent, 'intent'),
    questId: stringField(input?.questId, 'questId', false),
    partyId: stringField(input?.partyId, 'partyId', false),
    lookingFor: stringArray(input?.lookingFor, 'lookingFor'),
    requiredSkills: stringArray(input?.requiredSkills, 'requiredSkills'),
    visibility: ['PUBLIC', 'GUILD_ONLY', 'INVITE_ONLY'].includes(input?.visibility) ? input.visibility : undefined,
    ttlHours: typeof input?.ttlHours === 'number' && input.ttlHours > 0 && input.ttlHours <= 720 ? input.ttlHours : undefined,
  };
}

export function validateBeaconResponse(input: any): RespondToPartyBeaconPayload {
  return {
    responderDid: requiredString(input?.responderDid, 'responderDid'),
    message: requiredString(input?.message, 'message'),
    offeredSkills: stringArray(input?.offeredSkills, 'offeredSkills'),
    contactPolicy: ['AGENT_RELAY', 'DIRECT_AFTER_ACCEPT', 'PUBLIC'].includes(input?.contactPolicy) ? input.contactPolicy : undefined,
  };
}

export function validateJoinGuild(input: any): JoinGuildPayload {
  if (!input?.agent || !Array.isArray(input.agent.capabilities)) {
    throw new HttpError(400, 'INVALID_SCHEMA', 'agent.displayName and agent.capabilities are required');
  }

  const delegationScopes = Array.isArray(input.delegation?.scopes)
    ? input.delegation.scopes.filter((scope: string) => ALLOWED_DELEGATION_SCOPES.includes(scope as any))
    : [];

  return {
    member: input.member
      ? {
          displayName: requiredString(input.member.displayName, 'member.displayName'),
          handle: stringField(input.member.handle, 'member.handle', false),
          role: ['CLIENT', 'BUILDER', 'HYBRID', 'MODERATOR'].includes(input.member.role) ? input.member.role : undefined,
          bio: stringField(input.member.bio, 'member.bio', false),
          specialties: stringArray(input.member.specialties, 'member.specialties'),
          homeRegion: stringField(input.member.homeRegion, 'member.homeRegion', false),
        }
      : undefined,
    agent: {
      displayName: requiredString(input.agent.displayName, 'agent.displayName'),
      handle: stringField(input.agent.handle, 'agent.handle', false),
      classification: ['PERSONAL', 'FREE_AGENT', 'GUILD_SERVICE'].includes(input.agent.classification) ? input.agent.classification : undefined,
      autonomy: ['SUPERVISED', 'DELEGATED', 'AUTONOMOUS'].includes(input.agent.autonomy) ? input.agent.autonomy : undefined,
      availability: ['ONLINE', 'IDLE', 'OFFLINE'].includes(input.agent.availability) ? input.agent.availability : undefined,
      capabilities: stringArray(input.agent.capabilities, 'agent.capabilities') || [],
      operatorNotes: stringField(input.agent.operatorNotes, 'agent.operatorNotes', false),
    },
    delegation: delegationScopes.length > 0 ? { scopes: delegationScopes, operatingNote: stringField(input.delegation?.operatingNote, 'delegation.operatingNote', false), status: 'ACTIVE' } : undefined,
  };
}
