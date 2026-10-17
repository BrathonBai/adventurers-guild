/**
 * RFC 6962 (Certificate Transparency) style Merkle tree over identity log
 * entries.
 *
 * The guild operates the log and publishes a root; members hold inclusion
 * proofs. Anchoring that root elsewhere (a chain, or a third-party witness) is
 * what turns "the guild says so" into "the guild cannot rewrite history without
 * being caught".
 *
 *   leaf  = SHA-256(0x00 || data)
 *   node  = SHA-256(0x01 || left || right)
 *   empty = SHA-256("")
 */
import { createHash } from 'node:crypto';

const LEAF_PREFIX = Buffer.from([0x00]);
const NODE_PREFIX = Buffer.from([0x01]);

export function leafHash(leaf: Buffer): Buffer {
  return createHash('sha256').update(LEAF_PREFIX).update(leaf).digest();
}

export function nodeHash(left: Buffer, right: Buffer): Buffer {
  return createHash('sha256').update(NODE_PREFIX).update(left).update(right).digest();
}

export function emptyRoot(): Buffer {
  return createHash('sha256').digest();
}

/** Largest power of two strictly below `n`; `n` must be >= 2. */
function splitPoint(n: number): number {
  let k = 1;
  while (k * 2 < n) k *= 2;
  return k;
}

function subtreeRoot(hashes: Buffer[], start: number, end: number): Buffer {
  const count = end - start;

  if (count === 0) return emptyRoot();
  if (count === 1) return hashes[start] as Buffer;

  const k = splitPoint(count);
  return nodeHash(
    subtreeRoot(hashes, start, start + k),
    subtreeRoot(hashes, start + k, end),
  );
}

export function merkleRoot(leaves: Buffer[]): Buffer {
  if (leaves.length === 0) return emptyRoot();
  return subtreeRoot(leaves.map(leafHash), 0, leaves.length);
}

/**
 * Audit path for `index`, ordered from the leaf's sibling upward — the shape
 * RFC 9162 calls `PATH`. Throws when the index is out of range.
 */
export function inclusionProof(leaves: Buffer[], index: number): Buffer[] {
  if (index < 0 || index >= leaves.length) {
    throw new RangeError(`inclusionProof: index ${index} out of range for ${leaves.length} leaves`);
  }

  const hashes = leaves.map(leafHash);
  const proof: Buffer[] = [];

  const walk = (start: number, end: number, target: number): void => {
    const count = end - start;
    if (count === 1) return;

    const k = splitPoint(count);

    if (target < k) {
      walk(start, start + k, target);
      proof.push(subtreeRoot(hashes, start + k, end));
    } else {
      walk(start + k, end, target - k);
      proof.push(subtreeRoot(hashes, start, start + k));
    }
  };

  walk(0, hashes.length, index);
  return proof;
}

/** Verification algorithm from RFC 9162 §2.1.3.2. */
export function verifyInclusion(
  leaf: Buffer,
  index: number,
  size: number,
  proof: Buffer[],
  root: Buffer,
): boolean {
  if (size <= 0 || index < 0 || index >= size) return false;

  let fn = index;
  let sn = size - 1;
  let r = leafHash(leaf);

  for (const sibling of proof) {
    if (sn === 0) return false;

    if ((fn & 1) === 1 || fn === sn) {
      r = nodeHash(sibling, r);
      while ((fn & 1) === 0 && fn !== 0) {
        fn >>>= 1;
        sn >>>= 1;
      }
    } else {
      r = nodeHash(r, sibling);
    }

    fn >>>= 1;
    sn >>>= 1;
  }

  return sn === 0 && r.equals(root);
}

export function proofToHex(proof: Buffer[]): string[] {
  return proof.map((node) => node.toString('hex'));
}

export function proofFromHex(proof: string[]): Buffer[] {
  return proof.map((node) => Buffer.from(node, 'hex'));
}
