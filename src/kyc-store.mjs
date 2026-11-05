import {readFileSync} from 'node:fs';
import {randomUUID,randomBytes,createCipheriv,createDecipheriv,createHash} from 'node:crypto';
import {AppError} from './catalogue.mjs';
import {redact} from './ai.mjs';
const hash=v=>createHash('sha256').update(v).digest('hex');
const retainedFields=fields=>{
 if(!fields)return null;
 const {rawText,...necessary}=fields;
 return necessary;
};
export function createKycStore(store,keyString){
 const db=store.db,key=Buffer.from(keyString,'base64');if(key.length!==32)throw new Error('KYC encryption configuration is invalid.');
 db.exec('CREATE TABLE IF NOT EXISTS kyc_migrations(name TEXT PRIMARY KEY,checksum TEXT NOT NULL,applied_at TEXT NOT NULL)');
 const name='001_smart_kyc.sql',sql=readFileSync(new URL('../migrations/sqlite/'+name,import.meta.url),'utf8'),checksum=hash(sql),applied=db.prepare('SELECT checksum FROM kyc_migrations WHERE name=?').get(name);
 if(applied&&applied.checksum!==checksum)throw new Error('Applied KYC migration was modified.');
 if(!applied){db.exec('BEGIN IMMEDIATE');try{db.exec(sql);db.prepare('INSERT INTO kyc_migrations VALUES(?,?,?)').run(name,checksum,new Date().toISOString());db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}}
 const seal=(value,aad)=>{const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv);c.setAAD(Buffer.from(aad));const bytes=Buffer.concat([c.update(JSON.stringify(value),'utf8'),c.final()]);return Buffer.concat([iv,c.getAuthTag(),bytes]);};
 const open=(bytes,aad)=>{const b=Buffer.from(bytes),d=createDecipheriv('aes-256-gcm',key,b.subarray(0,12));d.setAAD(Buffer.from(aad));d.setAuthTag(b.subarray(12,28));return JSON.parse(Buffer.concat([d.update(b.subarray(28)),d.final()]).toString('utf8'));};
 const minimization='002_drop_raw_ocr_text_v1';
 if(!db.prepare('SELECT 1 FROM kyc_migrations WHERE name=?').get(minimization)){
  db.exec('BEGIN IMMEDIATE');
  try{
   for(const row of db.prepare('SELECT id,payload_cipher FROM kyc_uploads').all()){
    const payload=open(row.payload_cipher,'upload:'+row.id);
    if(payload.fields&&Object.hasOwn(payload.fields,'rawText')){
     payload.fields=retainedFields(payload.fields);
     db.prepare('UPDATE kyc_uploads SET payload_cipher=? WHERE id=?').run(seal(payload,'upload:'+row.id),row.id);
    }
   }
   db.prepare('INSERT INTO kyc_migrations VALUES(?,?,?)').run(minimization,hash(minimization),new Date().toISOString());
   db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
 }
 const own=(owner,id)=>{const r=db.prepare('SELECT c.* FROM kyc_cases c JOIN sessions s ON s.id_hash=c.session_hash WHERE c.id=? AND c.session_hash=? AND s.expires_at>?').get(id,owner,new Date().toISOString());if(!r)throw new AppError('KYC case not found.',404,'NOT_FOUND');return r;};
 const details=r=>({id:r.id,journeyId:r.journey_id,result:open(r.result_json,'result:'+r.id),verificationId:r.verification_id,createdAt:r.created_at,updatedAt:r.updated_at,uploads:db.prepare('SELECT id,kind,version,mime,filename,size,created_at AS createdAt FROM kyc_uploads WHERE case_id=? ORDER BY kind,version DESC').all(r.id),decisions:db.prepare('SELECT id,decision,comment,decided_at AS decidedAt FROM kyc_decisions WHERE case_id=? ORDER BY decided_at').all(r.id).map(d=>({...d,comment:open(d.comment,'decision:'+d.id)})),runs:db.prepare('SELECT id,created_at AS createdAt FROM kyc_runs WHERE case_id=? ORDER BY created_at DESC').all(r.id)});
 return {
  cleanup(){db.prepare('DELETE FROM kyc_cases WHERE created_at<=?').run(new Date(Date.now()-7*86400000).toISOString());},
  async save(owner,journeyId,caseId,context,documents,result,rows){
   if(caseId){const c=own(owner,caseId);if(c.journey_id!==journeyId)throw new AppError('This KYC case belongs to another journey.',409,'WRONG_JOURNEY');}
   const id=caseId||randomUUID(),now=new Date().toISOString();result.caseId=id;db.exec('BEGIN IMMEDIATE');
   try{
    if(!caseId)db.prepare('INSERT INTO kyc_cases VALUES(?,?,?,?,?,?,?,?)').run(id,owner,journeyId,seal(context,'context:'+id),seal(result,'result:'+id),null,now,now);
    else db.prepare('UPDATE kyc_cases SET context_cipher=?,result_json=?,verification_id=NULL,updated_at=? WHERE id=?').run(seal(context,'context:'+id),seal(result,'result:'+id),now,id);
    for(const doc of documents){const bytes=Buffer.from(doc.dataUrl.split(',')[1],'base64'),contentHash=hash(bytes),previous=db.prepare('SELECT id,version,content_hash FROM kyc_uploads WHERE case_id=? AND kind=? ORDER BY version DESC LIMIT 1').get(id,doc.kind);
     let uploadId=previous?.id,version=previous?.version||0;
     if(!previous||previous.content_hash!==contentHash){uploadId=randomUUID();version++;const mime=/^data:([^;]+)/.exec(doc.dataUrl)[1],row=rows.find(r=>r.kind===doc.kind);db.prepare('INSERT INTO kyc_uploads VALUES(?,?,?,?,?,?,?,?,?,?)').run(uploadId,id,doc.kind,version,contentHash,mime,redact((doc.name||doc.kind+(mime==='application/pdf'?'.pdf':'.png')).slice(0,160)),bytes.length,seal({dataUrl:doc.dataUrl,fields:retainedFields(row?.fields),preview:row?.preview||null,confidence:row?.confidence??null},'upload:'+uploadId),now);}
     // The file version tracks bytes; a rerun must still refresh its extraction.
     if(previous&&previous.content_hash===contentHash){const row=rows.find(r=>r.kind===doc.kind);db.prepare('UPDATE kyc_uploads SET payload_cipher=? WHERE id=?').run(seal({dataUrl:doc.dataUrl,fields:retainedFields(row?.fields),preview:row?.preview||null,confidence:row?.confidence??null},'upload:'+uploadId),uploadId);}
     const d=result.documents.find(d=>d.kind===doc.kind);if(d){d.documentId=uploadId;d.version=version;d.filename=redact((doc.name||doc.kind).slice(0,160));}
    }
    db.prepare('UPDATE kyc_cases SET result_json=? WHERE id=?').run(seal(result,'result:'+id),id);
    const runId=randomUUID();db.prepare('INSERT INTO kyc_runs VALUES(?,?,?,?)').run(runId,id,seal(result,'run:'+runId),now);db.exec('COMMIT');
    return details(own(owner,id));
   }catch(e){db.exec('ROLLBACK');throw e;}
  },
  get(owner,id){return details(own(owner,id));},
  context(owner,id){const r=own(owner,id);return open(r.context_cipher,'context:'+id);},
  list(owner,journeyId){return db.prepare('SELECT c.id FROM kyc_cases c JOIN sessions s ON s.id_hash=c.session_hash WHERE c.session_hash=? AND c.journey_id=? AND s.expires_at>? ORDER BY c.updated_at DESC').all(owner,journeyId,new Date().toISOString()).map(r=>details(own(owner,r.id)));},
  file(owner,id,journeyId){const row=db.prepare('SELECT u.*,c.session_hash,c.journey_id FROM kyc_uploads u JOIN kyc_cases c ON c.id=u.case_id JOIN sessions s ON s.id_hash=c.session_hash WHERE u.id=? AND c.session_hash=? AND s.expires_at>?').get(id,owner,new Date().toISOString());if(!row||journeyId!==undefined&&row.journey_id!==journeyId)throw new AppError('Document not found.',404,'NOT_FOUND');return {...row,payload:open(row.payload_cipher,'upload:'+id)};},
  removeJourney(owner,journeyId){db.prepare('DELETE FROM kyc_cases WHERE session_hash=? AND journey_id=?').run(owner,journeyId);},
  remove(owner,id){own(owner,id);db.prepare('DELETE FROM kyc_cases WHERE id=?').run(id);return {deleted:true};},
  bind(owner,id,verificationId){own(owner,id);db.prepare('UPDATE kyc_cases SET verification_id=? WHERE id=?').run(verificationId,id);},
  requestReview(owner,id){
   const found=own(owner,id),result=details(found).result;
   if(result.status!=='review_required')throw new AppError('Automatic checks passed. A review request is not needed.',409,'REVIEW_NOT_NEEDED');
   if(result.reviewRequest?.status==='pending')return details(found);
   const now=new Date().toISOString(),runId=randomUUID();
   result.reviewRequest={status:'pending',requestedAt:now,simulated:true};
   db.exec('BEGIN IMMEDIATE');
   try{
    db.prepare('UPDATE kyc_cases SET result_json=?,updated_at=? WHERE id=?').run(seal(result,'result:'+id),now,id);
    db.prepare('INSERT INTO kyc_runs VALUES(?,?,?,?)').run(runId,id,seal(result,'run:'+runId),now);
    db.exec('COMMIT');
   }catch(error){db.exec('ROLLBACK');throw error;}
   return this.get(owner,id);
  },
  queue(){return db.prepare('SELECT c.id,c.session_hash FROM kyc_cases c JOIN sessions s ON s.id_hash=c.session_hash WHERE s.expires_at>? ORDER BY c.updated_at DESC LIMIT 100').all(new Date().toISOString()).map(r=>{const d=details(own(r.session_hash,r.id));return {id:d.id,status:d.result.overallStatus,issues:d.result.issues,updatedAt:d.updatedAt,reviewRequest:d.result.reviewRequest||null};}).sort((a,b)=>Number(b.reviewRequest?.status==='pending')-Number(a.reviewRequest?.status==='pending'));},
  reviewGet(id){const r=db.prepare('SELECT session_hash FROM kyc_cases WHERE id=?').get(id);if(!r)throw new AppError('KYC case not found.',404);return {owner:r.session_hash,detail:details(own(r.session_hash,id)),context:this.context(r.session_hash,id)};},
  reviewFile(id){const r=db.prepare('SELECT c.session_hash FROM kyc_uploads u JOIN kyc_cases c ON c.id=u.case_id WHERE u.id=?').get(id);if(!r)throw new AppError('Document not found.',404);return this.file(r.session_hash,id);},
  decide(id,decision,comment){
   const found=this.reviewGet(id),result=found.detail.result;
   if(!['approved','rejected','correction_requested'].includes(decision))throw new AppError('Choose an approved, rejected or correction-requested decision.');
   if(decision==='approved'&&result.findings.some(f=>f.severity==='error'))throw new AppError('Correct deterministic validation failures before approving this case.',409,'BLOCKING_VALIDATION');
   if(decision==='approved'&&result.documents.some(d=>d.required&&!d.uploaded))throw new AppError('Required documents must be uploaded before approval.',409);
   const now=new Date().toISOString();result.reviewerDecision={decision,comment:redact(comment),decidedAt:now,simulated:true};result.status=decision==='approved'?'passed':'review_required';result.overallStatus=decision==='approved'?'checks_passed':decision==='rejected'?'unable_to_verify':'action_required';result.note='Simulated reviewer decision; this does not establish government authentication or document authenticity.';
   if(result.reviewRequest)result.reviewRequest={...result.reviewRequest,status:'completed',completedAt:now};
   db.exec('BEGIN IMMEDIATE');try{const decisionId=randomUUID();db.prepare('INSERT INTO kyc_decisions VALUES(?,?,?,?,?)').run(decisionId,id,decision,seal(redact(comment),'decision:'+decisionId),now);db.prepare('UPDATE kyc_cases SET result_json=?,updated_at=? WHERE id=?').run(seal(result,'result:'+id),now,id);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}return this.reviewGet(id);
  },
  login(){const token=randomBytes(32).toString('hex');db.prepare('DELETE FROM kyc_reviewer_sessions WHERE expires_at<=?').run(new Date().toISOString());db.prepare('INSERT INTO kyc_reviewer_sessions VALUES(?,?)').run(hash(token),new Date(Date.now()+3600000).toISOString());return token;},
  authorized(token){return typeof token==='string'&&!!db.prepare('SELECT 1 FROM kyc_reviewer_sessions WHERE token_hash=? AND expires_at>?').get(hash(token),new Date().toISOString());},
  logout(token){if(token)db.prepare('DELETE FROM kyc_reviewer_sessions WHERE token_hash=?').run(hash(token));}
 };
}
