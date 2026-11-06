import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep,basename} from 'node:path';
import {createStore} from '../src/store.mjs';
import {createKycStore} from '../src/kyc-store.mjs';
import {loadData,profile} from '../src/catalogue.mjs';
import {verify,privateKyc} from '../src/kyc.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createCipheriv} from 'node:crypto';
import {createApp} from '../server.mjs';
import {textPdf} from './helpers/pdf-fixtures.mjs';
const p={businessName:'Synthetic Security Test',segment:'micro',employees:5,sites:1,cityTier:1,budget:3000,needs:['internet']};
const contact={name:'Test Signatory',phone:'9876543210',address:'12 Demo Road, Synthetic City'};
const pdf=(kind,lines)=>({kind,name:kind+'.pdf',dataUrl:'data:application/pdf;base64,'+textPdf(lines).toString('base64')});
const address=date=>pdf('address',['Billed to: '+p.businessName,'Supply address: '+contact.address,'Bill date: '+date]);
const signatory=()=>pdf('signatory',['Name: '+contact.name,'For business: '+p.businessName,'Valid till: 2030-01-01']);
test('private KYC files, encrypted retention, correction history and authorized reviewer decisions',async t=>{
 const app=createApp({requireCustomerAuth:false,dbPath:':memory:',apiKey:'',kycKey:randomBytes(32).toString('base64'),reviewerToken:'synthetic-test-reviewer-access'});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>{app.server.closeAllConnections();app.server.close();app.store.close();});
 const base='http://127.0.0.1:'+app.server.address().port;
 const session=await fetch(base+'/api/session'),owner=session.headers.get('set-cookie').split(';')[0];const strangerResponse=await fetch(base+'/api/session'),stranger=strangerResponse.headers.get('set-cookie').split(';')[0];
 const req=(path,method='GET',input,cookie=owner)=>fetch(base+'/api'+path,{method,headers:{cookie,origin:base,'Content-Type':'application/json'},body:input?JSON.stringify(input):undefined});
 const input={profile:p,contact,consent:true,consentVersion:'2026-10-smart-kyc-v3',extractionMethod:'local',documents:[address('2026-07-01'),signatory()]};
 assert.equal((await req('/verify','POST',{...input,consent:false})).status,403);assert.equal((await req('/kyc/preview','POST',{consent:false,document:input.documents[0]})).status,403);
 assert.equal((await req('/verify','POST',{...input,consentVersion:'old-policy'})).status,409);
 const firstResponse=await req('/verify','POST',input);assert.equal(firstResponse.status,200);const first=await firstResponse.json();assert.equal(first.status,'passed');assert.ok(first.caseId);assert.equal(first.storageMode,'encrypted_local');
 assert.ok(Number.isFinite(first.processingMs)&&first.processingMs>=0);
 assert.ok(first.documents.filter(d=>d.uploaded).every(d=>Number.isFinite(d.processingMs)));
 assert.equal((await req('/kyc/cases/'+first.caseId+'/review-request','POST',{consent:true})).status,409);
 const file=first.documents.find(d=>d.kind==='address').documentId,signatoryId=first.documents.find(d=>d.kind==='signatory').documentId;
 assert.equal((await req('/kyc/documents/'+file+'/download')).status,200);const preview=await req('/kyc/documents/'+file+'/preview');assert.equal(preview.status,200);assert.ok(preview.headers.get('content-type').startsWith('image/'));
 for(const path of ['/kyc/cases/'+first.caseId,'/kyc/documents/'+file+'/download','/kyc/documents/'+file+'/preview'])assert.equal((await req(path,'GET',undefined,stranger)).status,404);
 assert.equal((await req('/kyc/cases/'+first.caseId,'DELETE',undefined,stranger)).status,404);
 const cipher=app.store.db.prepare('SELECT payload_cipher FROM kyc_uploads WHERE id=?').get(file).payload_cipher;assert.ok(!Buffer.from(cipher).includes(Buffer.from('%PDF-')));assert.ok(!Buffer.from(cipher).includes(Buffer.from('Synthetic Security Test')));
 const current=await (await req('/kyc/cases/'+first.caseId)).json();assert.equal(current.uploads.length,2);assert.equal(current.contact.name,contact.name);
 assert.equal((await req('/kyc/reviewer/cases')).status,401);assert.equal((await req('/kyc/reviewer/login','POST',{token:'wrong'})).status,401);
 const login=await req('/kyc/reviewer/login','POST',{token:'synthetic-test-reviewer-access'});assert.equal(login.status,200);const reviewer=login.headers.get('set-cookie').split(';')[0];
 assert.equal((await req('/kyc/reviewer/cases','GET',undefined,reviewer)).status,200);
 const decide=(decision,comment)=>req('/kyc/reviewer/cases/'+first.caseId+'/decision','POST',{decision,comment},reviewer);
 assert.equal((await decide('approved','Evidence assessed in a simulated review.')).status,200);let saved=await (await req('/kyc/cases/'+first.caseId)).json();assert.equal(saved.decisions.length,1);assert.equal(saved.result.reviewerDecision.simulated,true);
 // A replacement versions only the affected file; an owned reference preserves the other file.
 const corrected=await req('/verify','POST',{...input,caseId:first.caseId,documents:[address('2026-01-01'),{kind:'signatory',documentId:signatoryId}]});assert.equal(corrected.status,200);const second=await corrected.json();assert.equal(second.caseId,first.caseId);assert.equal(second.documents.find(d=>d.kind==='address').version,2);assert.equal(second.documents.find(d=>d.kind==='signatory').documentId,signatoryId);assert.equal(second.overallStatus,'action_required');
 const reviewPath='/kyc/cases/'+first.caseId+'/review-request';
 assert.equal((await req(reviewPath,'POST',{consent:false})).status,403);
 assert.equal((await req(reviewPath,'POST',{consent:true},stranger)).status,404);
 const requested=await (await req(reviewPath,'POST',{consent:true})).json();
 assert.equal(requested.result.reviewRequest.status,'pending');
 const repeated=await (await req(reviewPath,'POST',{consent:true})).json();
 assert.equal(repeated.result.reviewRequest.requestedAt,requested.result.reviewRequest.requestedAt);
 assert.equal(repeated.runs.length,requested.runs.length);
 const reviewQueue=await (await req('/kyc/reviewer/cases','GET',undefined,reviewer)).json();
 assert.equal(reviewQueue.cases[0].id,first.caseId);assert.equal(reviewQueue.cases[0].reviewRequest.status,'pending');
 assert.equal((await decide('approved','Attempt to override the outdated proof.')).status,409);assert.equal((await decide('correction_requested','Please upload a proof dated within ninety days.')).status,200);
 saved=await (await req('/kyc/cases/'+first.caseId)).json();assert.equal(saved.uploads.length,3);assert.ok(saved.runs.length>=2);
 assert.equal(saved.result.reviewRequest.status,'completed');
 const now=Date.now();t.mock.method(Date,'now',()=>now+61000);
 const thirdResponse=await req('/verify','POST',{...input,caseId:first.caseId,documents:[address('2026-07-01'),{kind:'signatory',documentId:signatoryId}]});const third=await thirdResponse.json();assert.equal(third.status,'passed');
 const order={profile:p,contact,consent:true,items:[{productId:'P01',quantity:1}],verificationId:third.id,requestKey:randomUUID()};assert.equal((await req('/orders','POST',order)).status,403);assert.equal((await req('/orders','POST',{...order,fieldsReviewed:true})).status,201);
 assert.equal((await req('/kyc/cases/'+first.caseId,'DELETE')).status,200);assert.equal((await req('/kyc/documents/'+file+'/download')).status,404);assert.equal(app.store.db.prepare('SELECT count(*) AS n FROM kyc_uploads').get().n,0);
 assert.equal((await req('/orders','POST',{...order,requestKey:randomUUID(),fieldsReviewed:true})).status,404);
});

test('raw OCR text stays transient and legacy cleanup preserves original files and versions',async()=>{
 const store=createStore(':memory:'),key=randomBytes(32).toString('base64');
 try{
  let kyc=createKycStore(store,key);const owner=store.session(),docs=[address('2026-07-01'),signatory()];
  const result=await verify(loadData('YTL_TrackA_Udyam_Digital_Data'),{},profile(p),{consent:true,contact,contactName:contact.name,documents:docs});
  assert.ok(privateKyc(result).rows[0].fields.rawText);
  const saved=await kyc.save(owner.hash,'',null,{profile:p,contact},docs,result,privateKyc(result).rows);
  const upload=saved.result.documents.find(d=>d.kind==='address').documentId;
  const clean=kyc.file(owner.hash,upload).payload;
  assert.ok(!Object.hasOwn(clean.fields,'rawText'));
  const legacy={...clean,fields:{...clean.fields,rawText:'Synthetic legacy OCR text'}};
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(key,'base64'),iv);
  cipher.setAAD(Buffer.from('upload:'+upload));
  const bytes=Buffer.concat([cipher.update(JSON.stringify(legacy),'utf8'),cipher.final()]);
  store.db.prepare('UPDATE kyc_uploads SET payload_cipher=? WHERE id=?').run(Buffer.concat([iv,cipher.getAuthTag(),bytes]),upload);
  store.db.prepare('DELETE FROM kyc_migrations WHERE name=?').run('002_drop_raw_ocr_text_v1');
  kyc=createKycStore(store,key);
  assert.deepEqual(kyc.file(owner.hash,upload).payload,clean);
  assert.equal(kyc.get(owner.hash,saved.id).uploads.find(row=>row.id===upload).version,1);
  assert.equal(kyc.get(owner.hash,saved.id).uploads.length,2);
 }finally{store.close();}
});

test('encrypted KYC records survive restart and expire with the owning session',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'udyam-kyc-retention-')),file=join(dir,'test.sqlite'),key=randomBytes(32).toString('base64');let store;
 try{store=createStore(file);let kyc=createKycStore(store,key);const owner=store.session();const docs=[address('2026-07-01'),signatory()];const result=await verify(loadData('YTL_TrackA_Udyam_Digital_Data'),{},profile(p),{consent:true,extractionMethod:'local',contact,contactName:contact.name,documents:docs});const saved=await kyc.save(owner.hash,'',null,{profile:p,contact},docs,result,privateKyc(result).rows);const upload=saved.result.documents.find(d=>d.kind==='address').documentId;
  const changedRows=privateKyc(result).rows.map(r=>({...r,fields:{...r.fields,businessName:'Stale extraction fixture'}}));await kyc.save(owner.hash,'',saved.id,{profile:p,contact},docs,result,changedRows);assert.equal(kyc.file(owner.hash,upload).payload.fields.businessName,'Stale extraction fixture');
  await kyc.save(owner.hash,'',saved.id,{profile:p,contact},docs,result,privateKyc(result).rows);assert.equal(kyc.file(owner.hash,upload).payload.fields.businessName,p.businessName);assert.equal(kyc.get(owner.hash,saved.id).uploads.length,2);
  store.close();store=createStore(file);kyc=createKycStore(store,key);assert.equal(kyc.get(owner.hash,saved.id).result.status,'passed');assert.ok(kyc.file(owner.hash,upload).payload.dataUrl===docs[0].dataUrl);
  const bytes=readFileSync(file);assert.ok(!bytes.includes(Buffer.from('Test Signatory')));assert.ok(!bytes.includes(Buffer.from('%PDF-')));
  store.db.prepare('UPDATE sessions SET expires_at=? WHERE id_hash=?').run('2000-01-01',owner.hash);store.cleanup();assert.equal(store.db.prepare('SELECT count(*) AS n FROM kyc_uploads').get().n,0);assert.equal(store.db.prepare('SELECT count(*) AS n FROM kyc_cases').get().n,0);
 }finally{store?.close();assert.ok(resolve(dir).startsWith(resolve(tmpdir())+sep)&&basename(dir).startsWith('udyam-kyc-retention-'));rmSync(dir,{recursive:true,force:true});}
});

test('retained verification resumes with masked registration inputs without exposing full identifiers',async t=>{
 const data=loadData('YTL_TrackA_Udyam_Digital_Data'),reg=[...data.gst.values()].find(r=>r.status==='Active');
 const business={...p,businessName:reg.legal_name,gstin:reg.gstin};
 const person={...contact,address:reg.principal_place_of_business};
 const docs=[pdf('gst',['GSTIN: '+reg.gstin,'Legal name: '+reg.legal_name,'Registration status: Active']),pdf('address',['Billed to: '+reg.legal_name,'Supply address: '+person.address,'Bill date: 2026-07-01']),pdf('signatory',['Name: '+person.name,'For business: '+reg.legal_name,'Valid till: 2030-01-01'])];
 const app=createApp({requireCustomerAuth:false,dbPath:':memory:',apiKey:'',kycKey:randomBytes(32).toString('base64')});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>{app.server.closeAllConnections();app.server.close();app.store.close();});
 const base='http://127.0.0.1:'+app.server.address().port,session=await fetch(base+'/api/session'),cookie=session.headers.get('set-cookie').split(';')[0];
 const post=(path,input)=>fetch(base+'/api'+path,{method:'POST',headers:{cookie,origin:base,'Content-Type':'application/json'},body:JSON.stringify(input)});
 const response=await post('/verify',{profile:business,contact:person,consent:true,consentVersion:'2026-10-smart-kyc-v3',documents:docs});assert.equal(response.status,200);const checked=await response.json();assert.equal(checked.status,'passed');assert.ok(!JSON.stringify(checked).includes(reg.gstin));
 const resumed={...business,gstin:'',udyam:''},items=[{productId:'P01',quantity:1}];
 assert.equal((await post('/quote',{profile:resumed,consent:true,verificationId:checked.id,items})).status,200);
 assert.equal((await post('/quote',{profile:{...resumed,budget:4000},consent:true,verificationId:checked.id,items})).status,409);
 const ordered=await post('/orders',{profile:resumed,contact:person,consent:true,verificationId:checked.id,fieldsReviewed:true,items,requestKey:randomUUID()});assert.equal(ordered.status,201);assert.ok(!JSON.stringify(await ordered.json()).includes(reg.gstin));
});
