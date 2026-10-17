import { createHash } from 'node:crypto';
import {
  emptyRoot,
  inclusionProof,
  leafHash,
  merkleRoot,
  nodeHash,
  verifyInclusion,
} from '../log/merkle';

function leaves(count: number): Buffer[] {
  return Array.from({ length: count }, (_unused, index) => Buffer.from(`leaf-${index}`, 'utf8'));
}

describe('merkle hashing', () => {
  it('uses RFC 6962 domain separation', () => {
    const data = Buffer.from('abc', 'utf8');

    expect(leafHash(data)).toEqual(
      createHash('sha256').update(Buffer.from([0x00])).update(data).digest(),
    );
    expect(nodeHash(data, data)).toEqual(
      createHash('sha256').update(Buffer.from([0x01])).update(data).update(data).digest(),
    );
  });

  it('defines the empty tree as SHA-256 of the empty string', () => {
    expect(merkleRoot([])).toEqual(emptyRoot());
    expect(emptyRoot()).toEqual(createHash('sha256').digest());
  });

  it('hashes a single leaf without an extra node layer', () => {
    const one = leaves(1);
    expect(merkleRoot(one)).toEqual(leafHash(one[0] as Buffer));
  });
});

describe('inclusion proofs', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 15, 16, 17])(
    'verifies every index for a tree of %i leaves',
    (count) => {
      const data = leaves(count);
      const root = merkleRoot(data);

      for (let index = 0; index < count; index += 1) {
        const proof = inclusionProof(data, index);
        expect(verifyInclusion(data[index] as Buffer, index, count, proof, root)).toBe(true);
      }
    },
  );

  it('keeps proofs within ceil(log2(n)) siblings', () => {
    const data = leaves(17);
    for (let index = 0; index < data.length; index += 1) {
      expect(inclusionProof(data, index).length).toBeLessThanOrEqual(5);
    }
  });

  it('rejects a proof presented for the wrong index', () => {
    const data = leaves(8);
    const root = merkleRoot(data);
    const proof = inclusionProof(data, 3);

    expect(verifyInclusion(data[3] as Buffer, 3, 8, proof, root)).toBe(true);
    expect(verifyInclusion(data[3] as Buffer, 4, 8, proof, root)).toBe(false);
  });

  it('rejects a tampered leaf', () => {
    const data = leaves(8);
    const root = merkleRoot(data);
    const proof = inclusionProof(data, 5);

    expect(verifyInclusion(Buffer.from('leaf-5-tampered'), 5, 8, proof, root)).toBe(false);
  });

  it('rejects a proof bound to a different tree', () => {
    const data = leaves(8);
    const other = merkleRoot(leaves(9));
    const proof = inclusionProof(data, 2);

    expect(verifyInclusion(data[2] as Buffer, 2, 8, proof, other)).toBe(false);
  });

  it('refuses to build a proof for an out-of-range index', () => {
    expect(() => inclusionProof(leaves(3), 3)).toThrow(RangeError);
    expect(() => inclusionProof(leaves(3), -1)).toThrow(RangeError);
  });
});

describe('root determinism', () => {
  it('changes when any leaf changes', () => {
    const original = leaves(6);
    const mutated = [...original];
    mutated[4] = Buffer.from('leaf-4-mutated', 'utf8');

    expect(merkleRoot(mutated)).not.toEqual(merkleRoot(original));
  });

  it('does not depend on cosigning state between calls', () => {
    const data = leaves(5);
    expect(merkleRoot(data)).toEqual(merkleRoot([...data]));
  });
});
