import * as fs from 'fs';
import * as path from 'path';
import { randomSecret, sha256Hmac, safeEqual } from './cryptoUtils';
import { AgentApplicationRecord, JoinGuildPayload } from './types';

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
        CREATE TABLE IF NOT EXISTS agent_applications (
          id TEXT PRIMARY KEY,
          payload_json TEXT NOT NULL,
          status TEXT NOT NULL,
          submitted_at INTEGER NOT NULL,
          reviewed_at INTEGER,
          reviewer_did TEXT,
          review_note TEXT,
          result_agent_id TEXT,
          credentials_json TEXT
        );
      `);
      this.ensureColumn('agent_applications', 'credentials_json', 'TEXT');
      this.db.prepare('INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (?, ?)').run(1, Date.now());
    });
  }

  private ensureColumn(tableName: string, columnName: string, definition: string): void {
    const columns = this.db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
    if (!columns.some((column) => column.name === columnName)) {
      this.db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
    }
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

  createAgentApplication(payload: JoinGuildPayload): AgentApplicationRecord {
    const record: AgentApplicationRecord = {
      id: `app_${randomSecret(12)}`,
      payload,
      status: 'PENDING_REVIEW',
      submittedAt: Date.now(),
    };

    this.db.prepare(`
      INSERT INTO agent_applications(id, payload_json, status, submitted_at, reviewed_at, reviewer_did, review_note, result_agent_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(record.id, JSON.stringify(payload), record.status, record.submittedAt, null, null, null, null);

    return record;
  }

  listAgentApplications(status?: AgentApplicationRecord['status']): AgentApplicationRecord[] {
    const rows = status
      ? this.db.prepare('SELECT * FROM agent_applications WHERE status = ? ORDER BY submitted_at ASC').all(status)
      : this.db.prepare('SELECT * FROM agent_applications ORDER BY submitted_at DESC').all();
    return rows.map((row: Record<string, any>) => this.toAgentApplicationRecord(row));
  }

  getAgentApplication(id: string): AgentApplicationRecord | undefined {
    const row = this.db.prepare('SELECT * FROM agent_applications WHERE id = ?').get(id) as Record<string, any> | undefined;
    return row ? this.toAgentApplicationRecord(row) : undefined;
  }

  updateAgentApplicationReview(
    id: string,
    input: {
      status: Extract<AgentApplicationRecord['status'], 'APPROVED' | 'DECLINED'>;
      reviewerDid?: string;
      reviewNote?: string;
      resultAgentId?: string;
      credentials?: AgentApplicationRecord['credentials'];
    },
  ): AgentApplicationRecord | undefined {
    this.db.prepare(`
      UPDATE agent_applications
      SET status = ?, reviewed_at = ?, reviewer_did = ?, review_note = ?, result_agent_id = ?, credentials_json = ?
      WHERE id = ?
    `).run(
      input.status,
      Date.now(),
      input.reviewerDid ?? null,
      input.reviewNote ?? null,
      input.resultAgentId ?? null,
      input.credentials ? JSON.stringify(input.credentials) : null,
      id,
    );
    return this.getAgentApplication(id);
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

  private toAgentApplicationRecord(row: Record<string, any>): AgentApplicationRecord {
    return {
      id: row.id,
      payload: JSON.parse(row.payload_json),
      status: row.status,
      submittedAt: row.submitted_at,
      reviewedAt: row.reviewed_at ?? undefined,
      reviewerDid: row.reviewer_did ?? undefined,
      reviewNote: row.review_note ?? undefined,
      resultAgentId: row.result_agent_id ?? undefined,
      credentials: row.credentials_json ? JSON.parse(row.credentials_json) : undefined,
    };
  }
}
