import { createPrivateKey } from 'node:crypto';
import { canonicalize } from '../crypto/canonical';
import {
  generateKeyPair,
  publicKeyFromPrivate,
  sign,
  thumbprint,
  verify,
  type PublicKeyJwk,
} from '../crypto/ed25519';

describe('canonicalize', () => {
  it('sorts object keys at every depth', () => {
    expect(canonicalize({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });

  it('omits undefined object members but keeps null', () => {
    expect(canonicalize({ a: undefined, b: null })).toBe('{"b":null}');
  });

  it('rejects undefined inside arrays', () => {
    expect(() => canonicalize([1, undefined, 2])).toThrow(TypeError);
  });

  it('rejects non-finite numbers instead of coercing to null', () => {
    expect(() => canonicalize(Number.NaN)).toThrow(TypeError);
    expect(() => canonicalize(Number.POSITIVE_INFINITY)).toThrow(TypeError);
  });

  it('is byte-stable regardless of insertion order', () => {
    expect(canonicalize({ x: 1, y: 2 })).toBe(canonicalize({ y: 2, x: 1 }));
  });
});

describe('ed25519', () => {
  it('exports an OKP JWK pair', () => {
    const { publicJwk, privateJwk } = generateKeyPair();

    expect(publicJwk.kty).toBe('OKP');
    expect(publicJwk.crv).toBe('Ed25519');
    expect(typeof publicJwk.x).toBe('string');
    expect(typeof privateJwk.d).toBe('string');
    expect(publicKeyFromPrivate(privateJwk)).toEqual(publicJwk);
  });

  it('round-trips a signature', () => {
    const { publicJwk, privateJwk } = generateKeyPair();
    const signature = sign(privateJwk, 'hello guild');

    expect(signature).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(verify(publicJwk, 'hello guild', signature)).toBe(true);
  });

  it('rejects a tampered payload', () => {
    const { publicJwk, privateJwk } = generateKeyPair();
    const signature = sign(privateJwk, 'hello guild');

    expect(verify(publicJwk, 'hello guild!', signature)).toBe(false);
  });

  it('rejects a signature from another key', () => {
    const alice = generateKeyPair();
    const eve = generateKeyPair();
    const signature = sign(alice.privateJwk, 'hello guild');

    expect(verify(eve.publicJwk, 'hello guild', signature)).toBe(false);
  });

  it('produces a stable RFC 7638 thumbprint', () => {
    const { publicJwk } = generateKeyPair();
    const withOptionalMembers: PublicKeyJwk = { ...publicJwk, kid: 'ignored', use: 'sig' } as PublicKeyJwk;

    expect(thumbprint(publicJwk)).toBe(thumbprint(withOptionalMembers));
    expect(thumbprint(publicJwk)).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

describe('RFC 8032 test vector 1', () => {
  const seedHex = '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60';
  const publicHex = 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a';
  const signatureHex =
    'e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e06522490155' +
    '5fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b';

  const privateJwk = {
    kty: 'OKP' as const,
    crv: 'Ed25519' as const,
    d: Buffer.from(seedHex, 'hex').toString('base64url'),
    x: Buffer.from(publicHex, 'hex').toString('base64url'),
  };

  it('derives the expected public key from the seed', () => {
    const key = createPrivateKey({ key: privateJwk, format: 'jwk' });
    expect(key.asymmetricKeyType).toBe('ed25519');
  });

  it('signs the empty message to the expected bytes', () => {
    const signature = sign(privateJwk, '');
    expect(Buffer.from(signature, 'base64url').toString('hex')).toBe(signatureHex);
  });

  it('verifies with the vector public key', () => {
    const publicJwk: PublicKeyJwk = { kty: 'OKP', crv: 'Ed25519', x: privateJwk.x };
    expect(verify(publicJwk, '', Buffer.from(signatureHex, 'hex').toString('base64url'))).toBe(true);
  });
});
