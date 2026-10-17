/**
 * Identity log entries.
 *
 * Every entry is signed by the identity it describes. That is the whole point:
 * the guild can order and serve entries, but it cannot forge one for somebody
 * else — it does not hold their private key.
 *
 * `prevEntryHash` chains an identity's entries together, so a member can prove
 * continuity of their key history even if the guild's log is later split.
 */
import { createHash } from 'node:crypto';
import { canonicalBytes } from '../crypto/canonical';
import {
  sign,
  thumbprint,
  verify,
  type PrivateKeyJwk,
  type PublicKeyJwk,
} from '../crypto/ed25519';

export const IDENTITY_LOG_ENTRY_TYPE = 'guild.identity.log.entry';
export const IDENTITY_LOG_ENTRY_VERSION = 1;

export interface IdentityLogPayload {
  type: typeof IDENTITY_LOG_ENTRY_TYPE;
  version: typeof IDENTITY_LOG_ENTRY_VERSION;
  /** The identity this entry is about, e.g. `did:web:guild.example.com:alice`. */
  did: string;
  /** RFC 7638 thumbprint of the public key being registered or rotated in. */
  keyThumbprint: string;
  /** Monotonic per DID; starts at 1 and never reuses a number. */
  keyVersion: number;
  /** Position in the log, assigned by the operator when the entry is appended. */
  seq: number;
  /** Client-declared; informational only, never used for ordering or expiry. */
  issuedAt: number;
  /** SHA-256 of the previous signed entry for this DID, base64url. */
  prevEntryHash?: string;
}

export interface SignedIdentityLogEntry extends IdentityLogPayload {
  /** base64url Ed25519 signature over `entrySigningBytes`. */
  signature: string;
}

export function entrySigningBytes(payload: IdentityLogPayload): Buffer {
  return canonicalBytes({
    type: payload.type,
    version: payload.version,
    did: payload.did,
    keyThumbprint: payload.keyThumbprint,
    keyVersion: payload.keyVersion,
    seq: payload.seq,
    issuedAt: payload.issuedAt,
    ...(payload.prevEntryHash === undefined ? {} : { prevEntryHash: payload.prevEntryHash }),
  });
}

export function createEntryPayload(
  input: Omit<IdentityLogPayload, 'type' | 'version'>,
): IdentityLogPayload {
  return {
    type: IDENTITY_LOG_ENTRY_TYPE,
    version: IDENTITY_LOG_ENTRY_VERSION,
    ...input,
  };
}

export function signEntry(
  privateJwk: PrivateKeyJwk,
  payload: IdentityLogPayload,
): SignedIdentityLogEntry {
  return {
    ...payload,
    signature: sign(privateJwk, entrySigningBytes(payload)),
  };
}

/**
 * Verifies the signature *and* that the entry actually names the key that
 * signed it. Without the second check a valid signature over somebody else's
 * thumbprint would pass.
 */
export function verifyEntry(entry: SignedIdentityLogEntry, publicJwk: PublicKeyJwk): boolean {
  if (entry.type !== IDENTITY_LOG_ENTRY_TYPE) return false;
  if (entry.version !== IDENTITY_LOG_ENTRY_VERSION) return false;
  if (!Number.isSafeInteger(entry.keyVersion) || entry.keyVersion < 1) return false;
  if (!Number.isSafeInteger(entry.seq) || entry.seq < 0) return false;
  if (entry.keyThumbprint !== thumbprint(publicJwk)) return false;

  return verify(publicJwk, entrySigningBytes(entry), entry.signature);
}

/** Content hash of a signed entry, used as the next entry's `prevEntryHash`. */
export function entryHash(entry: SignedIdentityLogEntry): string {
  const bytes = canonicalBytes({
    type: entry.type,
    version: entry.version,
    did: entry.did,
    keyThumbprint: entry.keyThumbprint,
    keyVersion: entry.keyVersion,
    seq: entry.seq,
    issuedAt: entry.issuedAt,
    ...(entry.prevEntryHash === undefined ? {} : { prevEntryHash: entry.prevEntryHash }),
    signature: entry.signature,
  });

  return createHash('sha256').update(bytes).digest('base64url');
}
