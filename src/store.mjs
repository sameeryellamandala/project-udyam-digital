import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes, createHash, randomUUID } from 'node:crypto';

export const hash = value => createHash('sha256').update(value).digest('hex');
export const profileHash = p => hash(JSON.stringify(p));
export function createStore(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS sessions(id_hash TEXT PRIMARY KEY, created_at TEXT NOT NULL, expires_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS verifications(id TEXT PRIMARY KEY, session_hash TEXT NOT NULL REFERENCES sessions(id_hash) ON DELETE CASCADE, profile_hash TEXT NOT NULL, result_json TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY, session_hash TEXT NOT NULL REFERENCES sessions(id_hash) ON DELETE CASCADE, request_key TEXT NOT NULL, profile_json TEXT NOT NULL, contact_json TEXT NOT NULL, quote_json TEXT NOT NULL, verification_json TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(session_hash,request_key));`);
  return {
    db,
    cleanup() { db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(new Date().toISOString()); },
    session(token) {
      this.cleanup();
      if (token && /^[a-f0-9]{64}$/.test(token)) { const found = db.prepare('SELECT id_hash FROM sessions WHERE id_hash=?').get(hash(token)); if (found) return { hash: found.id_hash }; }
      const fresh = randomBytes(32).toString('hex'), now = new Date();
      db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(fresh), now.toISOString(), new Date(+now + 7 * 86400000).toISOString());
      return { hash: hash(fresh), token: fresh };
    },
    verification(session, p, result) {
      const id = randomUUID(); db.prepare('INSERT INTO verifications VALUES(?,?,?,?,?)').run(id, session, profileHash(p), JSON.stringify(result), new Date().toISOString()); return id;
    },
    getVerification(session, p, id) {
      const row = db.prepare('SELECT result_json FROM verifications WHERE id=? AND session_hash=? AND profile_hash=?').get(id, session, profileHash(p)); return row ? JSON.parse(row.result_json) : null;
    },
    createOrder(session, requestKey, p, contact, quote, verification) {
      const previous = db.prepare('SELECT id FROM orders WHERE session_hash=? AND request_key=?').get(session, requestKey);
      if (previous) return this.getOrder(session, previous.id);
      const id = 'AB-' + randomUUID(), created = new Date().toISOString(), status = verification.status === 'passed' ? 'ready_for_scheduling' : 'review_required';
      const safeProfile = { ...p, gstin: verification.gstin, udyam: verification.udyam };
      db.prepare('INSERT INTO orders VALUES(?,?,?,?,?,?,?,?,?)').run(id, session, requestKey, JSON.stringify(safeProfile), JSON.stringify(contact), JSON.stringify(quote), JSON.stringify(verification), status, created);
      return this.getOrder(session, id);
    },
    getOrder(session, id) {
      const row = db.prepare('SELECT * FROM orders WHERE session_hash=? AND id=?').get(session, id); if (!row) return null;
      return { id: row.id, createdAt: row.created_at, status: row.status, profile: JSON.parse(row.profile_json), contact: JSON.parse(row.contact_json), quote: JSON.parse(row.quote_json), verification: JSON.parse(row.verification_json) };
    },
    orders(session) { return db.prepare('SELECT id, status, created_at FROM orders WHERE session_hash=? ORDER BY created_at DESC').all(session).map(r => ({ id: r.id, status: r.status, createdAt: r.created_at })); },
    deleteOrder(session, id) { return db.prepare('DELETE FROM orders WHERE session_hash=? AND id=?').run(session, id).changes > 0; },
    close() { db.close(); }
  };
}
