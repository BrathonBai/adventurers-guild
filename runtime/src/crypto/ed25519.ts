/**
 * Ed25519 signing primitives.
 *
 * Keys are exchanged as JWK (`{ kty: "OKP", crv: "Ed25519", x }`), which is the
 * shape a DID document's `verificationMethod.publicKeyJwk` and a VC's
 * `verificationMethod` reference both need. Private keys never leave the
 * holder; the guild only ever stores the public half.
 */
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as nodeSign,
  verify as nodeVerify,
} from 'node:crypto';

export interface PublicKeyJwk {
  kty: 'OKP';
  crv: 'Ed25519';
  x: string;
  [member: string]: unknown;
}

export interface PrivateKeyJwk extends PublicKeyJwk {
  d: string;
}

export interface Ed25519KeyPair {
  publicJwk: PublicKeyJwk;
  privateJwk: PrivateKeyJwk;
}

export function generateKeyPair(): Ed25519KeyPair {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');

  return {
    publicJwk: publicKey.export({ format: 'jwk' }) as PublicKeyJwk,
    privateJwk: privateKey.export({ format: 'jwk' }) as PrivateKeyJwk,
  };
}

export function publicKeyFromPrivate(privateJwk: PrivateKeyJwk): PublicKeyJwk {
  return {
    kty: privateJwk.kty,
    crv: privateJwk.crv,
    x: privateJwk.x,
  };
}

function toBytes(payload: string | Uint8Array): Buffer {
  return typeof payload === 'string' ? Buffer.from(payload, 'utf8') : Buffer.from(payload);
}

/** Returns a base64url-encoded 64-byte signature. */
export function sign(privateJwk: PrivateKeyJwk, payload: string | Uint8Array): string {
  const key = createPrivateKey({ key: privateJwk, format: 'jwk' });
  return nodeSign(null, toBytes(payload), key).toString('base64url');
}

export function verify(
  publicJwk: PublicKeyJwk,
  payload: string | Uint8Array,
  signature: string,
): boolean {
  try {
    const key = createPublicKey({ key: publicJwk, format: 'jwk' });
    return nodeVerify(null, toBytes(payload), key, Buffer.from(signature, 'base64url'));
  } catch {
    return false;
  }
}

/**
 * RFC 7638 JWK thumbprint: SHA-256 over the required members in lexicographic
 * order (`crv`, `kty`, `x` for OKP), base64url encoded.
 *
 * This is the stable identifier for a key inside the identity log — it does not
 * change when optional JWK members (`kid`, `use`, `alg`) are added.
 */
export function thumbprint(publicJwk: PublicKeyJwk): string {
  const required = JSON.stringify({
    crv: publicJwk.crv,
    kty: publicJwk.kty,
    x: publicJwk.x,
  });

  return createHash('sha256').update(required, 'utf8').digest('base64url');
}
