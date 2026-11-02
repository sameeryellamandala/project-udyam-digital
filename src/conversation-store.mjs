import {Pool} from 'pg';
import {randomUUID,createHash} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {freshMemory} from './conversation-memory.mjs';
import {AppError} from './catalogue.mjs';

export async function migrateConversations(pool){
 const c=await pool.connect();
 try{await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(812617305)');
  await c.query('CREATE TABLE IF NOT EXISTS advisor_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
  for(const name of (await readdir(new URL('../migrations/',import.meta.url))).filter(n=>/^\d+.*\.sql$/.test(n)).sort()){
   const sql=await readFile(new URL('../migrations/'+name,import.meta.url),'utf8'),checksum=createHash('sha256').update(sql).digest('hex');
   const old=(await c.query('SELECT checksum FROM advisor_migrations WHERE name=$1',[name])).rows[0];
   if(old){if(old.checksum!==checksum)throw new Error('Applied migration was modified.');continue;}
   await c.query(sql);await c.query('INSERT INTO advisor_migrations(name,checksum) VALUES($1,$2)',[name,checksum]);
  }await c.query('COMMIT');
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
const missing=()=>new AppError('Conversation not found in this browser session.',404,'NOT_FOUND');
export function createConversationStore(connectionString,options={}){
 const pool=options.pool||new Pool({connectionString,max:8,connectionTimeoutMillis:5000,idleTimeoutMillis:10000});
 pool.on('error',()=>{}); // Never log connection strings or driver error details.
 const own=async(c,owner,id,lock=false)=>{
  const r=await c.query(`SELECT s.* FROM advisor_sessions s JOIN advisor_owners o ON o.id=s.owner_id WHERE s.id=$1 AND s.owner_id=$2 AND o.expires_at>now() ${lock?'FOR UPDATE OF s':''}`,[id,owner]);
  if(!r.rows.length)throw missing();return r.rows[0];
 };
 const transaction=async action=>{const c=await pool.connect();try{await c.query('BEGIN');const result=await action(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}};
 return {pool, migrate:()=>migrateConversations(pool),close:()=>pool.end(),
  async touchOwner(owner,expiresAt){await pool.query('INSERT INTO advisor_owners(id,expires_at) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET expires_at=excluded.expires_at',[owner,expiresAt]);},
  async claimGuest(from,to,expiresAt){if(from===to)return;return transaction(async c=>{
    await c.query('INSERT INTO advisor_owners(id,expires_at) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET expires_at=excluded.expires_at',[to,expiresAt]);
    await c.query('SELECT id FROM advisor_owners WHERE id=ANY($1::text[]) ORDER BY id FOR UPDATE',[[from,to]]);
    await c.query('UPDATE advisor_sessions s SET creation_key=NULL WHERE owner_id=$1 AND creation_key IN (SELECT creation_key FROM advisor_sessions WHERE owner_id=$2 AND creation_key IS NOT NULL)',[from,to]);
    await c.query('UPDATE advisor_sessions SET owner_id=$2 WHERE owner_id=$1',[from,to]);
  });},
  async create(owner,expiresAt,title='New conversation',initialState=freshMemory(),creationKey=null){
   return transaction(async c=>{
    await c.query('DELETE FROM advisor_owners WHERE expires_at<=now()');
    await c.query('INSERT INTO advisor_owners(id,expires_at) VALUES($1,$2) ON CONFLICT(id) DO NOTHING',[owner,expiresAt]);
    await c.query('SELECT id FROM advisor_owners WHERE id=$1 FOR UPDATE',[owner]);
    if(creationKey){const prior=(await c.query('SELECT id,title,status FROM advisor_sessions WHERE owner_id=$1 AND creation_key=$2',[owner,creationKey])).rows[0];if(prior)return prior;}
    const count=Number((await c.query('SELECT count(*) FROM advisor_sessions WHERE owner_id=$1',[owner])).rows[0].count);if(count>=100)throw new AppError('Conversation limit reached. Delete an old conversation first.');
    const id=randomUUID();await c.query('INSERT INTO advisor_sessions(id,owner_id,title,creation_key) VALUES($1,$2,$3,$4)',[id,owner,title,creationKey]);
    await c.query('INSERT INTO advisor_requirements(session_id,state) VALUES($1,$2)',[id,initialState]);return {id,title,status:'active',messages:[],requirements:{},state:initialState,revision:0};
   });
  },
  async list(owner){await pool.query('DELETE FROM advisor_owners WHERE expires_at<=now()');return (await pool.query(`SELECT s.id,s.title,s.status,s.created_at AS "createdAt",s.updated_at AS "updatedAt",coalesce((SELECT left(content,100) FROM advisor_messages WHERE session_id=s.id ORDER BY id DESC LIMIT 1),'') AS preview FROM advisor_sessions s JOIN advisor_owners o ON o.id=s.owner_id WHERE owner_id=$1 AND o.expires_at>now() ORDER BY s.updated_at DESC`,[owner])).rows;},
  async get(owner,id,before){return transaction(async c=>{const session=await own(c,owner,id);
   const {state,revision}=(await c.query('SELECT state,revision FROM advisor_requirements WHERE session_id=$1',[id])).rows[0];
   const rows=(await c.query('SELECT id::text,role,content,created_at AS "createdAt" FROM advisor_messages WHERE session_id=$1 AND ($2::bigint IS NULL OR id<$2::bigint) ORDER BY advisor_messages.id DESC LIMIT 101',[id,before||null])).rows;
   return {...session,owner_id:undefined,state,revision,messages:rows.slice(0,100).reverse(),hasMore:rows.length>100};
  });},
  async update(owner,id,expectedRevision,requestId,action){return transaction(async c=>{
   await own(c,owner,id,true);
   const old=(await c.query('SELECT response FROM advisor_turns WHERE session_id=$1 AND request_id=$2',[id,requestId])).rows[0];if(old)return old.response;
   const saved=(await c.query('SELECT state,revision FROM advisor_requirements WHERE session_id=$1',[id])).rows[0];
   if(saved.revision!==expectedRevision)throw new AppError('Requirements changed in another request. Reload the session before saving.',409,'STALE_REQUIREMENTS');
   const {state,result}=await action(saved.state,saved.revision+1);
   await c.query('UPDATE advisor_requirements SET state=$2,revision=revision+1,updated_at=now() WHERE session_id=$1',[id,state]);
   await c.query('UPDATE advisor_sessions SET updated_at=now() WHERE id=$1',[id]);
   await c.query('INSERT INTO advisor_turns(session_id,request_id,response) VALUES($1,$2,$3)',[id,requestId,result]);return result;
  });},
  async withState(owner,id,action){return transaction(async c=>{await own(c,owner,id,true);const saved=(await c.query('SELECT state,revision FROM advisor_requirements WHERE session_id=$1',[id])).rows[0];return action(saved.state,saved.revision,c);});},
  async remove(owner,id){return transaction(async c=>{await own(c,owner,id,true);await c.query('DELETE FROM advisor_sessions WHERE id=$1',[id]);return {deleted:true};});},
  async turn(owner,id,requestId,message,action){return transaction(async c=>{
   const session=await own(c,owner,id,true);if(session.status!=='active')throw new AppError('This conversation is closed.',409);
   const prior=(await c.query('SELECT response FROM advisor_turns WHERE session_id=$1 AND request_id=$2',[id,requestId])).rows[0];if(prior)return prior.response;
   const record=(await c.query('SELECT state,revision FROM advisor_requirements WHERE session_id=$1',[id])).rows[0],saved=record.state;
   const history=(await c.query('SELECT role,content FROM advisor_messages WHERE session_id=$1 ORDER BY id DESC LIMIT 10',[id])).rows.reverse();
   const result=await action(saved,[...history,{role:'user',content:message}]);
   const next={...saved,...(result.conversationState||saved)};delete result.conversationState;
   if(JSON.stringify([saved.profile,saved.details])!==JSON.stringify([next.profile,next.details]))next.selectedProducts=[];
   const changed=JSON.stringify([next.profile,next.details,next.form])!==JSON.stringify([saved.profile,saved.details,saved.form]);result.revision=record.revision+(changed?1:0);
   await c.query('INSERT INTO advisor_messages(session_id,role,content) VALUES($1,$2,$3),($1,$4,$5)',[id,'user',message,'assistant',result.reply||'AI is unavailable. Please retry later.']);
   await c.query('UPDATE advisor_requirements SET state=$2,revision=$3,updated_at=now() WHERE session_id=$1',[id,next,result.revision]);
   await c.query("UPDATE advisor_sessions SET updated_at=now(),title=CASE WHEN title='New conversation' THEN $2 ELSE title END WHERE id=$1",[id,message.slice(0,70)]);
   await c.query('INSERT INTO advisor_turns(session_id,request_id,response) VALUES($1,$2,$3)',[id,requestId,result]);
   return result;
  });}
 };
}
