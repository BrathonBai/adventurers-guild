export type GuildDidKind = 'member' | 'agent';

export function createGuildDid(kind: GuildDidKind, source: string): string {
  return `did:guild:${kind}:${normalizeDidSegment(source)}`;
}

export function createGuildConnectionUri(kind: GuildDidKind, source: string): string {
  return `guild://${kind}/${normalizeDidSegment(source)}`;
}

export function normalizeDidSegment(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'unknown';
}
