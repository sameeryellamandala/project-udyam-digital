import { redact } from './ai.mjs';
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
    CREATE TABLE IF NOT EXISTS advisor_conversations(session_hash TEXT PRIMARY KEY REFERENCES sessions(id_hash) ON DELETE CASCADE, state_json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS verifications(id TEXT PRIMARY KEY, session_hash TEXT NOT NULL REFERENCES sessions(id_hash) ON DELETE CASCADE, profile_hash TEXT NOT NULL, result_json TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY, session_hash TEXT NOT NULL REFERENCES sessions(id_hash) ON DELETE CASCADE, request_key TEXT NOT NULL, profile_json TEXT NOT NULL, contact_json TEXT NOT NULL, quote_json TEXT NOT NULL, verification_json TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(session_hash,request_key));
    CREATE TABLE IF NOT EXISTS support_requests(id TEXT PRIMARY KEY, session_hash TEXT NOT NULL REFERENCES sessions(id_hash) ON DELETE CASCADE, order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE, topic TEXT NOT NULL, message TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS hidden_support_requests(request_id TEXT PRIMARY KEY REFERENCES support_requests(id) ON DELETE CASCADE,hidden_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS fulfillment_history(event_id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,previous_status TEXT,new_status TEXT,actor TEXT,expected_date TEXT);
    CREATE TABLE IF NOT EXISTS order_events(id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE, event_type TEXT NOT NULL, detail TEXT NOT NULL, occurred_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS lead_handoffs(lead_id TEXT PRIMARY KEY, priority_score INTEGER NOT NULL, reason TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS support_replies(id TEXT PRIMARY KEY,request_id TEXT NOT NULL REFERENCES support_requests(id) ON DELETE CASCADE,message TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS order_kyc_updates(id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,verification_json TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS customer_notification_reads(session_hash TEXT NOT NULL REFERENCES sessions(id_hash) ON DELETE CASCADE,notification_id TEXT NOT NULL,read_at TEXT NOT NULL,PRIMARY KEY(session_hash,notification_id));`);
  return {
    db,
    advisorConversation(session) { const row=db.prepare('SELECT state_json FROM advisor_conversations WHERE session_hash=?').get(session);return row?JSON.parse(row.state_json):{}; },
    saveAdvisorConversation(session,state) { db.prepare('INSERT INTO advisor_conversations VALUES(?,?) ON CONFLICT(session_hash) DO UPDATE SET state_json=excluded.state_json').run(session,JSON.stringify(state)); },
    cleanup() { db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(new Date().toISOString()); },
    session(token) {
      this.cleanup();
      if (token && /^[a-f0-9]{64}$/.test(token)) { const found = db.prepare('SELECT id_hash,expires_at FROM sessions WHERE id_hash=?').get(hash(token)); if (found) return { hash: found.id_hash, expiresAt:found.expires_at }; }
      const fresh = randomBytes(32).toString('hex'), now = new Date();
      db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(fresh), now.toISOString(), new Date(+now + 7 * 86400000).toISOString());
      return { hash: hash(fresh), token: fresh, expiresAt:new Date(+now + 7 * 86400000).toISOString() };
    },
    accountSession(owner){
      const now=new Date(),expiresAt=new Date(+now+7*86400000).toISOString();
      db.prepare('INSERT INTO sessions VALUES(?,?,?) ON CONFLICT(id_hash) DO UPDATE SET expires_at=excluded.expires_at').run(owner,now.toISOString(),expiresAt);
      return {hash:owner,expiresAt};
    },
    notificationReadIds(owner){return new Set(db.prepare('SELECT notification_id FROM customer_notification_reads WHERE session_hash=?').all(owner).map(row=>row.notification_id));},
    markNotificationsRead(owner,ids){const now=new Date().toISOString(),insert=db.prepare('INSERT OR IGNORE INTO customer_notification_reads VALUES(?,?,?)');db.exec('BEGIN IMMEDIATE');try{for(const id of ids)insert.run(owner,id,now);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}},
    claimGuest(from,to){
      if(from===to)return;
      db.exec('BEGIN IMMEDIATE');try{
        const collisions=db.prepare('SELECT id FROM orders WHERE session_hash=? AND request_key IN (SELECT request_key FROM orders WHERE session_hash=?)').all(from,to);
        for(const row of collisions)db.prepare('UPDATE orders SET request_key=? WHERE id=?').run(randomUUID(),row.id);
        for(const table of ['orders','verifications','support_requests',...(db.prepare("SELECT name FROM sqlite_master WHERE name='kyc_cases'").get()?['kyc_cases']:[])])db.prepare(`UPDATE ${table} SET session_hash=? WHERE session_hash=?`).run(to,from);
        const legacy=this.advisorConversation(from);if(Object.keys(legacy).length&&!Object.keys(this.advisorConversation(to)).length)this.saveAdvisorConversation(to,legacy);
        db.prepare('DELETE FROM advisor_conversations WHERE session_hash=?').run(from);db.exec('COMMIT');
      }catch(e){db.exec('ROLLBACK');throw e;}
    },
    verification(session, p, result) {
      const id = randomUUID(); db.prepare('INSERT INTO verifications VALUES(?,?,?,?,?)').run(id, session, profileHash(p), JSON.stringify(result), new Date().toISOString()); return id;
    },
    verificationByOwner(session,id) {const row=db.prepare('SELECT result_json FROM verifications WHERE id=? AND session_hash=?').get(id,session);return row?JSON.parse(row.result_json):null;},
    getVerification(session, p, id) {
      const row = db.prepare('SELECT result_json FROM verifications WHERE id=? AND session_hash=? AND profile_hash=?').get(id, session, profileHash(p)); return row ? JSON.parse(row.result_json) : null;
    },
    createOrder(session, requestKey, p, contact, quote, verification) {
      const previous = db.prepare('SELECT id FROM orders WHERE session_hash=? AND request_key=?').get(session, requestKey);
      if (previous) return this.getOrder(session, previous.id);
      const id = 'AB-' + randomUUID(), created = new Date().toISOString(), status = verification.status === 'passed' ? 'ready_for_scheduling' : 'review_required';
      const safeProfile = { ...p, gstin: verification.gstin, udyam: verification.udyam };
      db.prepare('INSERT INTO orders VALUES(?,?,?,?,?,?,?,?,?)').run(id, session, requestKey, JSON.stringify(safeProfile), JSON.stringify(contact), JSON.stringify(quote), JSON.stringify(verification), status, created);
      const event=db.prepare('INSERT INTO order_events VALUES(?,?,?,?,?)');
      event.run(randomUUID(),id,'quote_accepted','Quote accepted and order saved.',created);
      event.run(randomUUID(),id,verification.status==='passed'?'kyc_complete':'kyc_review',verification.status==='passed'?(verification.reviewerDecision?'Simulated reviewer approved the assessed evidence; not government authentication.':'Automated mock-registry and document field checks passed; not authenticity verification.'):'Business checks need correction or simulated assisted review.',created);
      event.run(randomUUID(),id,'installation_estimate',`Typical installation estimate: ${quote.installDays} days after availability confirmation.`,created);
      return this.getOrder(session, id);
    },
    getOrder(session, id) {
      const row = db.prepare('SELECT * FROM orders WHERE session_hash=? AND id=?').get(session, id); if (!row) return null;
      const supportRequests=db.prepare('SELECT id,topic,message,status,created_at AS createdAt FROM support_requests WHERE session_hash=? AND order_id=? ORDER BY created_at DESC').all(session,id);
      for(const r of supportRequests)r.replies=this.supportReplies(r.id);
      const update=db.prepare('SELECT verification_json,created_at FROM order_kyc_updates WHERE order_id=? ORDER BY rowid DESC LIMIT 1').get(id);
      const events=db.prepare('SELECT event_type AS type,detail,occurred_at AS occurredAt,h.expected_date AS expectedDate,h.previous_status AS previousStatus,h.new_status AS newStatus,h.actor FROM order_events e LEFT JOIN fulfillment_history h ON h.event_id=e.id WHERE e.order_id=? ORDER BY occurred_at,e.rowid').all(id);
      return { id: row.id, createdAt: row.created_at, status: row.status, profile: JSON.parse(row.profile_json), contact: JSON.parse(row.contact_json), quote: JSON.parse(row.quote_json), originalVerification:JSON.parse(row.verification_json),verification: JSON.parse(update?.verification_json||row.verification_json),lastKycSubmissionAt:update?.created_at||null,supportRequests, events };
    },
    orders(session) { return db.prepare("SELECT id, status, created_at, json_extract(quote_json,'$.sessionId') AS journey_id FROM orders WHERE session_hash=? ORDER BY created_at DESC").all(session).map(r => ({ id: r.id, status: r.status, createdAt: r.created_at, sessionId:r.journey_id||null })); },
    addSupportRequest(session,orderId,topic,message) {
      if(!this.getOrder(session,orderId))return null;
      const id=randomUUID(),createdAt=new Date().toISOString();
      db.prepare('INSERT INTO support_requests VALUES(?,?,?,?,?,?,?)').run(id,session,orderId,topic,message,'received',createdAt);
      return {id,topic,message,status:'received',createdAt};
    },
    getSupportQueue() {
      return db.prepare(`SELECT r.id,r.order_id AS orderId,r.topic,r.message,r.status,r.created_at AS createdAt,o.status AS orderStatus,o.profile_json AS profileJson,o.quote_json AS quoteJson,o.verification_json AS verificationJson FROM support_requests r JOIN orders o ON o.id=r.order_id WHERE NOT EXISTS (SELECT 1 FROM hidden_support_requests h WHERE h.request_id=r.id) ORDER BY CASE r.status WHEN 'received' THEN 0 ELSE 1 END,r.created_at`).all().map(r=>{
        const p=JSON.parse(r.profileJson),q=JSON.parse(r.quoteJson),v=JSON.parse(r.verificationJson);
        return {id:r.id,orderId:r.orderId,topic:r.topic,message:redact(r.message),status:r.status,replies:this.supportReplies(r.id),createdAt:r.createdAt,orderStatus:r.orderStatus,segment:p.segment,employees:p.employees,sites:p.sites,monthlyMin:q.monthly,monthlyMax:q.monthlyMax??q.monthly,kycStatus:v.status};
      });
    },
    hideSupportRequest(id) {
      if(!db.prepare('SELECT 1 FROM support_requests WHERE id=?').get(id))return false;
      db.prepare('INSERT OR IGNORE INTO hidden_support_requests VALUES(?,?)').run(id,new Date().toISOString());
      return true;
    },
    resolveSupportRequest(id) { return db.prepare("UPDATE support_requests SET status='reviewed' WHERE id=?").run(id).changes>0; },
    supportReplies(id){return db.prepare('SELECT id,message,status,created_at AS createdAt FROM support_replies WHERE request_id=? ORDER BY rowid').all(id);},
    replySupport(id,message,status){
      if(!db.prepare('SELECT 1 FROM support_requests WHERE id=?').get(id))return null;
      const reply={id:randomUUID(),message:redact(message),status,createdAt:new Date().toISOString()};
      db.exec('BEGIN IMMEDIATE');try{db.prepare('INSERT INTO support_replies VALUES(?,?,?,?,?)').run(reply.id,id,reply.message,status,reply.createdAt);db.prepare('UPDATE support_requests SET status=? WHERE id=?').run(status,id);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}return reply;
    },
    submitOrderKyc(owner,id,verification){
      const order=this.getOrder(owner,id);if(!order)return null;
      const now=new Date().toISOString();db.exec('BEGIN IMMEDIATE');try{
       db.prepare('INSERT INTO order_kyc_updates VALUES(?,?,?,?)').run(randomUUID(),id,JSON.stringify(verification),now);
       if(['review_required','ready_for_scheduling'].includes(order.status))db.prepare('UPDATE orders SET status=? WHERE id=?').run(verification.status==='passed'?'ready_for_scheduling':'review_required',id);
       db.prepare('INSERT INTO order_events VALUES(?,?,?,?,?)').run(randomUUID(),id,'kyc_resubmitted','Customer submitted updated document checks for the existing order.',now);db.exec('COMMIT');
      }catch(e){db.exec('ROLLBACK');throw e;}return this.getOrder(owner,id);
    },
    approveOrdersForCase(owner,caseId,verification){
      if(verification?.status!=='passed'||verification?.reviewerDecision?.decision!=='approved')return 0;
      const rows=db.prepare("SELECT id FROM orders WHERE session_hash=? AND status NOT IN ('activated','order_cancelled') AND json_extract(verification_json,'$.caseId')=?").all(owner,caseId);
      let updated=0;db.exec('BEGIN IMMEDIATE');try{for(const row of rows){
        const order=this.getOrder(owner,row.id);
        if(order.verification.reviewerDecision?.decidedAt===verification.reviewerDecision.decidedAt)continue;
        const now=verification.reviewerDecision.decidedAt||new Date().toISOString();
        db.prepare('INSERT INTO order_kyc_updates VALUES(?,?,?,?)').run(randomUUID(),row.id,JSON.stringify(verification),now);
        if(order.status==='review_required')db.prepare("UPDATE orders SET status='ready_for_scheduling' WHERE id=?").run(row.id);
        db.prepare('INSERT INTO order_events VALUES(?,?,?,?,?)').run(randomUUID(),row.id,'kyc_complete','Simulated reviewer approved the assessed evidence; this does not establish government authentication.',now);
        updated++;
      }db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}return updated;
    },
    holdOrdersForCase(owner,caseId){
      const rows=db.prepare("SELECT id FROM orders WHERE session_hash=? AND status NOT IN ('activated','order_cancelled') AND json_extract(verification_json,'$.caseId')=?").all(owner,caseId);
      db.exec('BEGIN IMMEDIATE');try{for(const row of rows){
        const current=this.getOrder(owner,row.id),{sourceVerificationId,addressedDecisionId,...snapshot}=current.verification,now=new Date().toISOString();
        db.prepare('INSERT INTO order_kyc_updates VALUES(?,?,?,?)').run(randomUUID(),row.id,JSON.stringify({...snapshot,status:'review_required',issues:['The reviewer requested document corrections or rejected the evidence. Review the document messages before continuing.']}),now);
        db.prepare("UPDATE orders SET status='review_required' WHERE id=?").run(row.id);
        db.prepare('INSERT INTO order_events VALUES(?,?,?,?,?)').run(randomUUID(),row.id,'kyc_review_requested','The reviewer requested document corrections or further review.',now);
      }db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
    },
    operationsOrders() {
      return db.prepare(`SELECT id,status,created_at AS createdAt,
        (SELECT count(*) FROM order_events WHERE order_id=orders.id) AS version
        FROM orders ORDER BY created_at DESC`).all();
    },
    updateFulfillment(id, {action, version, description, expectedDate}, actor) {
      const fail=(message,status=409)=>{throw Object.assign(new Error(message),{status});};
      const transitions={
        ready_for_scheduling:{schedule:'installation_scheduled'},
        installation_scheduled:{start:'installation_in_progress',delay:'installation_scheduled'},
        installation_in_progress:{complete:'activation_pending',delay:'installation_in_progress'},
        activation_pending:{activate:'activated'},installed:{activate:'activated'}
      };
      if(typeof description!=='string'||description.trim().length<3||description.length>500)fail('Enter an update description (3–500 characters).',400);
      const dated=['schedule','delay'].includes(action);
      if(dated && (!/^\d{4}-\d{2}-\d{2}$/.test(expectedDate)||!Number.isFinite(Date.parse(expectedDate))||new Date(expectedDate).toISOString().slice(0,10)!==expectedDate||expectedDate<new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'})))fail('Choose today or a future date.',400);
      db.exec('BEGIN IMMEDIATE');
      try {
        const row=db.prepare('SELECT session_hash FROM orders WHERE id=?').get(id);
        if(!row)fail('Order not found.',404);
        const order=this.getOrder(row.session_hash,id);
        if(order.events.length!==version)fail('This order changed. Reload the staff queue.');
        if(['activated','order_cancelled'].includes(order.status))fail('This order is closed.');
        const next=action==='cancel'?'order_cancelled':transitions[order.status]?.[action];
        if(typeof next!=='string'||(action!=='cancel'&&order.verification.status!=='passed'))fail('This update is unavailable at the current order or KYC stage.');
        const now=new Date().toISOString(),eventId=randomUUID();
        db.prepare('UPDATE orders SET status=? WHERE id=?').run(next,id);
        db.prepare('INSERT INTO order_events VALUES(?,?,?,?,?)').run(eventId,id,action==='delay'?'installation_delayed':next,redact(description.trim()),now);
        db.prepare('INSERT INTO fulfillment_history VALUES(?,?,?,?,?,?)').run(eventId,id,order.status,next,actor,dated?expectedDate:null);
        db.exec('COMMIT');
        return {status:next,version:version+1};
      } catch(error){db.exec('ROLLBACK');throw error;}
    },
    handoffLead(leadId,priorityScore,reason) {
      const createdAt=new Date().toISOString();
      db.prepare(`INSERT INTO lead_handoffs VALUES(?,?,?,?,?) ON CONFLICT(lead_id) DO UPDATE SET priority_score=excluded.priority_score,reason=excluded.reason,status='queued',created_at=excluded.created_at`).run(leadId,priorityScore,reason,'queued',createdAt);
      return {leadId,priorityScore,reason,status:'queued',createdAt};
    },
    getLeadHandoffs() { return db.prepare('SELECT lead_id AS leadId,priority_score AS priorityScore,reason,status,created_at AS createdAt FROM lead_handoffs ORDER BY priority_score DESC,created_at DESC').all(); },
    deleteOrder(session, id) { return db.prepare('DELETE FROM orders WHERE session_hash=? AND id=?').run(session, id).changes > 0; },
    close() { db.close(); }
  };
}
