import { GuildAgentProfile, IncomingMessage, RequiredMember } from './types';

export function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string');
}

export function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function readOptionalClassification(
  value: unknown,
): GuildAgentProfile['classification'] | undefined {
  return value === 'PERSONAL' || value === 'FREE_AGENT' || value === 'GUILD_SERVICE'
    ? value
    : undefined;
}

export function readOptionalAutonomy(value: unknown): GuildAgentProfile['autonomy'] | undefined {
  return value === 'SUPERVISED' || value === 'DELEGATED' || value === 'AUTONOMOUS'
    ? value
    : undefined;
}

export function readOptionalExecutionUnit(value: unknown): RequiredMember['preferredUnit'] | undefined {
  return value === 'HUMAN' || value === 'AGENT' || value === 'HYBRID' ? value : undefined;
}

export function normalizeRequiredMembers(input: unknown): RequiredMember[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input.map((entry) => {
    const item = typeof entry === 'object' && entry ? (entry as Record<string, unknown>) : {};
    return {
      role: readString(item.role) || 'contributor',
      count: readNumber(item.count) ?? 1,
      filled: readNumber(item.filled) ?? 0,
      skills: readStringArray(item.skills),
      preferredUnit: readOptionalExecutionUnit(item.preferredUnit),
    };
  });
}

export function readMessageData(message: IncomingMessage): Record<string, any> {
  return message.data ?? {};
}
