import { generateKeyPair, thumbprint } from '../crypto/ed25519';
import {
  createEntryPayload,
  entryHash,
  signEntry,
  verifyEntry,
  type SignedIdentityLogEntry,
} from '../log/entry';
import { inclusionProof, merkleRoot, verifyInclusion } from '../log/merkle';

const DID = 'did:web:guild.example.com:alice';

function makeEntry(seq: number, prevEntryHash?: string): SignedIdentityLogEntry {
  const { privateJwk, publicJwk } = generateKeyPair();

  return signEntry(
    privateJwk,
    createEntryPayload({
      did: DID,
      keyThumbprint: thumbprint(publicJwk),
      keyVersion: 1,
      seq,
      issuedAt: 1_790_000_000_000,
      ...(prevEntryHash === undefined ? {} : { prevEntryHash }),
    }),
  );
}

describe('identity log entries', () => {
  it('signs and verifies with the registered key', () => {
    const { privateJwk, publicJwk } = generateKeyPair();
    const entry = signEntry(
      privateJwk,
      createEntryPayload({
        did: DID,
        keyThumbprint: thumbprint(publicJwk),
        keyVersion: 1,
        seq: 0,
        issuedAt: 1_790_000_000_000,
      }),
    );

    expect(verifyEntry(entry, publicJwk)).toBe(true);
  });

  it('rejects an entry whose payload was edited after signing', () => {
    const { privateJwk, publicJwk } = generateKeyPair();
    const entry = signEntry(
      privateJwk,
      createEntryPayload({
        did: DID,
        keyThumbprint: thumbprint(publicJwk),
        keyVersion: 1,
        seq: 0,
        issuedAt: 1_790_000_000_000,
      }),
    );

    expect(verifyEntry({ ...entry, seq: 1 }, publicJwk)).toBe(false);
    expect(verifyEntry({ ...entry, did: 'did:web:guild.example.com:mallory' }, publicJwk)).toBe(false);
  });

  it('rejects an entry that claims a different key than the one that signed it', () => {
    const alice = generateKeyPair();
    const mallory = generateKeyPair();

    const forged = signEntry(
      mallory.privateJwk,
      createEntryPayload({
        did: DID,
        // Claims Alice's key while signing with Mallory's.
        keyThumbprint: thumbprint(alice.publicJwk),
        keyVersion: 1,
        seq: 0,
        issuedAt: 1_790_000_000_000,
      }),
    );

    expect(verifyEntry(forged, alice.publicJwk)).toBe(false);
    expect(verifyEntry(forged, mallory.publicJwk)).toBe(false);
  });

  it('chains entries through prevEntryHash', () => {
    const first = makeEntry(0);
    const second = makeEntry(1, entryHash(first));

    expect(second.prevEntryHash).toBe(entryHash(first));
    expect(entryHash(first)).not.toBe(entryHash(second));
  });

  it('anchors entries into the Merkle log', () => {
    const entries = [makeEntry(0), makeEntry(1), makeEntry(2)];
    const leaves = entries.map((entry) => Buffer.from(entryHash(entry), 'utf8'));
    const root = merkleRoot(leaves);

    entries.forEach((entry, index) => {
      const proof = inclusionProof(leaves, index);
      expect(verifyInclusion(leaves[index] as Buffer, index, leaves.length, proof, root)).toBe(true);
    });
  });
});
