/**
 * Deterministic JSON serialization used for signing.
 *
 * This is a deliberately small subset of RFC 8785 (JCS): sorted keys, no
 * whitespace, `undefined` object members omitted. It is NOT a full JCS
 * implementation — numbers are emitted via `JSON.stringify`, which matches
 * ECMAScript `Number::toString` for the values we sign, but rejects
 * `NaN`/`Infinity` instead of coercing them to `null`.
 *
 * Two consumers rely on this being byte-stable:
 *   - identity log entries (see `log/entry.ts`)
 *   - key thumbprints (RFC 7638 uses the same sorted-key form)
 */

export function canonicalize(value: unknown): string {
  if (value === null) return 'null';

  const type = typeof value;

  if (type === 'boolean') return value ? 'true' : 'false';

  if (type === 'number') {
    const num = value as number;
    if (!Number.isFinite(num)) {
      throw new TypeError('canonicalize: non-finite numbers are not representable');
    }
    return JSON.stringify(num);
  }

  if (type === 'string') return JSON.stringify(value);

  if (Array.isArray(value)) {
    const parts = value.map((item) => {
      if (item === undefined) {
        throw new TypeError('canonicalize: undefined is not representable in an array');
      }
      return canonicalize(item);
    });
    return `[${parts.join(',')}]`;
  }

  if (type === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort();

    const parts = keys.map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`);
    return `{${parts.join(',')}}`;
  }

  throw new TypeError(`canonicalize: unsupported type "${type}"`);
}

export function canonicalBytes(value: unknown): Buffer {
  return Buffer.from(canonicalize(value), 'utf8');
}
