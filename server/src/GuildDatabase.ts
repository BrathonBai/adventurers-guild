import * as fs from 'fs';
import * as path from 'path';
import { randomSecret, sha256Hmac, safeEqual } from './cryptoUtils';

type DatabaseSync = any;

export type StoredApiKey = {
  id: string;
  secretHash: string;
  subjectDid: string;
  subjectType: 'MEMBER' | 'AGENT' | 'ADMIN';
  role: 'MEMBER' | 'AGENT' | 'ADMIN';
  scopes: string[];
  createdAt: number;
  revokedAt?: number;
};

export type AuditLogInput = {
  actorDid?: string;
  actorRole?: string;
  action: string;
  targetType: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
};

export class GuildDatabase {
  private readonly db: DatabaseSync;

  constructor(private readonly filePath = process.env.GUILD_DB_PATH || path.join(__dirname, '../../data/guild.sqlite')) {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const sqlite = require('node:sqlite') as { DatabaseSync: new (path: string) => DatabaseSync };
    this.db = new sqlite.DatabaseSync(this.filePath);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    this.migrate();
  }

  private migrate(): void {
    this.transaction(() => {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          applied_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS guild_documents (
          key TEXT PRIMARY KEY,
          json TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS api_keys (
          id TEXT PRIMARY KEY,
          secret_hash TEXT NOT NULL,
          subject_did TEXT NOT NULL,
          subject_type TEXT NOT NULL,
          role TEXT NOT NULL,
          scopes_json TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          revoked_at INTEGER
        );
        CREATE TABLE IF NOT EXISTS audit_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          actor_did TEXT,
          actor_role TEXT,
          action TEXT NOT NULL,
          target_type TEXT NOT NULL,
          target_id TEXT,
          metadata_json TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );
      `);
      this.db.prepare('INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (?, ?)').run(1, Date.now());
    });
  }

  transaction<T>(work: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  readDocument<T>(key: string): T | undefined {
    const row = this.db.prepare('SELECT json FROM guild_documents WHERE key = ?').get(key) as { json: string } | undefined;
    return row ? JSON.parse(row.json) as T : undefined;
  }

  writeDocument(key: string, value: unknown): void {
    this.db.prepare(`
      INSERT INTO guild_documents(key, json, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at
    `).run(key, JSON.stringify(value), Date.now());
  }

  createApiKey(input: Omit<StoredApiKey, 'id' | 'secretHash' | 'createdAt'>): { id: string; secret: string; record: StoredApiKey } {
    const id = `gak_${randomSecret(12)}`;
    const secret = randomSecret(32);
    const record: StoredApiKey = {
      ...input,
      id,
      secretHash: sha256Hmac(process.env.AUTH_PEPPER || 'guild-local-pepper', secret),
      createdAt: Date.now(),
    };

    this.db.prepare(`
      INSERT INTO api_keys(id, secret_hash, subject_did, subject_type, role, scopes_json, created_at, revoked_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(record.id, record.secretHash, record.subjectDid, record.subjectType, record.role, JSON.stringify(record.scopes), record.createdAt, record.revokedAt ?? null);

    return { id, secret, record };
  }

  verifyApiKey(raw: string): StoredApiKey | undefined {
    const rows = this.db.prepare('SELECT * FROM api_keys WHERE revoked_at IS NULL').all() as Array<Record<string, any>>;
    const hash = sha256Hmac(process.env.AUTH_PEPPER || 'guild-local-pepper', raw);
    const row = rows.find((item) => safeEqual(item.secret_hash, hash));
    if (!row) {
      return undefined;
    }

    return {
      id: row.id,
      secretHash: row.secret_hash,
      subjectDid: row.subject_did,
      subjectType: row.subject_type,
      role: row.role,
      scopes: JSON.parse(row.scopes_json),
      createdAt: row.created_at,
      revokedAt: row.revoked_at ?? undefined,
    };
  }

  audit(input: AuditLogInput): void {
    this.db.prepare(`
      INSERT INTO audit_logs(actor_did, actor_role, action, target_type, target_id, metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.actorDid ?? null,
      input.actorRole ?? null,
      input.action,
      input.targetType,
      input.targetId ?? null,
      JSON.stringify(input.metadata ?? {}),
      Date.now(),
    );
  }

  listAuditLogs(limit = 200): Array<Record<string, unknown>> {
    return this.db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?').all(limit);
  }

  backup(destination = `${this.filePath}.${new Date().toISOString().replace(/[:.]/g, '-')}.bak`): string {
    this.db.exec('PRAGMA wal_checkpoint(FULL)');
    fs.copyFileSync(this.filePath, destination);
    return destination;
  }
}
