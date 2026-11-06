import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createApp} from '../server.mjs';
import {loadData,gstFormat,AppError} from '../src/catalogue.mjs';
import {formRequirements} from '../src/journey.mjs';

const data=loadData('YTL_TrackA_Udyam_Digital_Data');
const active=[...data.gst].find(([id,row])=>gstFormat(id)&&row.status==='Active');
const business={businessName:active[1].trade_name||active[1].legal_name,segment:'prof',employees:5,sites:1,cityTier:1,budget:10000,needs:['internet','whatsapp'],gstin:active[0]};
async function fixture(t,options={}){
 const app=createApp({dbPath:':memory:',apiKey:'',data,requireCustomerAuth:false,...options});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 t.after(()=>{app.server.closeAllConnections();app.server.close();app.store.close();});
 const base='http://127.0.0.1:'+app.server.address().port;
 const cookie=(await fetch(base+'/api/session')).headers.get('set-cookie').split(';')[0];
 const call=(input,owner=cookie)=>fetch(base+'/api/registration-check',{method:'POST',headers:{cookie:owner,origin:base,'content-type':'application/json'},body:JSON.stringify(input)});
 return {app,base,cookie,call};
}
test('pre-quote lookup requires consent, masks the response and never grants KYC verification',async t=>{
 const {call,app}=await fixture(t);
 assert.equal((await call({profile:business})).status,403);
 const response=await call({profile:{...business,gstin:' '+active[0].toLowerCase()+' '},consent:true});
 assert.equal(response.status,200);const result=await response.json();
 assert.equal(result.registration.status,'matched');assert.ok(result.recommendation.quote.items.some(x=>x.productId==='P15'));
 assert.ok(!JSON.stringify(result).includes(active[0]));
 assert.equal(result.verificationId,undefined);assert.equal(result.id,undefined);
 assert.equal(app.store.db.prepare('SELECT count(*) AS count FROM verifications').get().count,0);
});
test('invalid or inactive registrations and wrong business names cannot unlock a bundle',async t=>{
 const {call}=await fixture(t);
 for(const [changed,status] of [[{gstin:'INVALID'},'invalid_format'],[{businessName:'Unrelated example business'},'business_name_mismatch']]){
  const response=await call({profile:{...business,...changed},consent:true});const result=await response.json();
  assert.equal(result.registration.status,status);assert.equal(result.recommendation,null);
 }
 const inactive=[...data.gst].find(([id,row])=>gstFormat(id)&&row.status!=='Active');assert.ok(inactive);
 const result=await(await call({profile:{...business,gstin:inactive[0]},consent:true})).json();
 assert.equal(result.registration.status,'inactive');assert.equal(result.recommendation,null);
});
test('session lookup uses canonical requirements, rejects stale revisions and enforces ownership',async t=>{
 const state=formRequirements(business),id=randomUUID();let owner;
 const conversations={withState:async(hash,sessionId,fn)=>{if(sessionId!==id||owner&&owner!==hash)throw new AppError('Session not found.',404);owner=hash;return fn(state,3,{});}};
 const {call,base}=await fixture(t,{conversations});
 const request={sessionId:id,revision:3,profile:{...business,employees:99,needs:['internet'],businessName:'Tampered name'},consent:true};
 const result=await(await call(request)).json();
 assert.equal(result.registration.status,'matched');assert.ok(result.recommendation.quote.items.some(x=>x.productId==='P15'));
 assert.equal((await call({...request,revision:2})).status,409);
 const other=(await fetch(base+'/api/session')).headers.get('set-cookie').split(';')[0];
 assert.equal((await call(request,other)).status,404);
 assert.ok(!JSON.stringify(state).includes(active[0]));
});
test('registration lookup fails closed for signed-out customers',async t=>{
 const {call}=await fixture(t,{requireCustomerAuth:true});
 assert.equal((await call({profile:business,consent:true})).status,401);
});
