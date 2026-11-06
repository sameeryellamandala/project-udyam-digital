import test from 'node:test';
import assert from 'node:assert/strict';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {createConversationStore} from '../src/conversation-store.mjs';
import {conversationAdvisor} from '../src/conversation-advisor.mjs';
import {publicRequirements} from '../src/conversation-memory.mjs';
import {loadData} from '../src/catalogue.mjs';
import {createApp} from '../server.mjs';
const connectionString=process.env.TEST_DATABASE_URL;
test('PostgreSQL sessions: migrations, memory, history, ownership, HTTP, retries and deletion',{skip:!connectionString},async t=>{
 const admin=new Pool({connectionString}),name='udyam_test_'+randomUUID().replaceAll('-','');
 assert.match(name,/^udyam_test_[a-f0-9]{32}$/);
 await admin.query('CREATE DATABASE '+name);
 const url=new URL(connectionString);url.pathname='/'+name;
 let store=createConversationStore(url.href),app;
 try{
  await store.migrate();await store.migrate();
  const owner='a'.repeat(64),other='b'.repeat(64),expiry=new Date(Date.now()+86400000).toISOString();
  const first=await store.create(owner,expiry),second=await store.create(owner,expiry);
  const data=loadData('YTL_TrackA_Udyam_Digital_Data');
  const send=(id,message,key=randomUUID())=>store.turn(owner,id,key,message,(state,messages)=>conversationAdvisor({},state,messages,data));
  await send(first.id,'I need internet for five employees.');const key=randomUUID();await send(first.id,'I also need three postpaid SIM connections.',key);await send(first.id,'I also need three postpaid SIM connections.',key);
  const saved=await store.get(owner,first.id);assert.equal(saved.messages.length,4);assert.equal(publicRequirements(saved.state).mobile_sim_count,3);assert.equal(publicRequirements(saved.state).employee_count,5);
  await send(second.id,'I need CCTV for a retail store');await send(second.id,'I need 3 cameras in Vijayawada and 2 cameras in Guntur.');
  const cameraMemory=publicRequirements((await store.get(owner,second.id)).state);assert.deepEqual(cameraMemory.requested_services,['cctv']);assert.equal(cameraMemory.camera_count,5);assert.deepEqual(cameraMemory.locations,[{name:'Vijayawada',camera_count:3},{name:'Guntur',camera_count:2}]);
  await assert.rejects(store.get(other,first.id),e=>e.status===404);await assert.rejects(store.remove(other,first.id),e=>e.status===404);
  await store.close();store=createConversationStore(url.href);assert.equal((await store.get(owner,first.id)).messages.length,4);
  // The row lock serializes simultaneous edits without lost increments.
  await Promise.all([send(first.id,'Add three more SIMs.'),send(first.id,'Add three more SIMs.')]);assert.equal(publicRequirements((await store.get(owner,first.id)).state).mobile_sim_count,9);
  const before=(await store.get(owner,first.id)).messages[2].id;assert.equal((await store.get(owner,first.id,before)).messages.length,2);
  const failedKey=randomUUID(),failed=await store.turn(owner,first.id,failedKey,'hello',async state=>({mode:'unavailable',reply:'Our AI advisor is receiving many requests. Please try again shortly.',conversationState:state}));assert.equal(failed.mode,'unavailable');
  const historyBeforeRetry=(await store.get(owner,first.id)).messages;assert.equal(historyBeforeRetry.at(-2).content,'hello');assert.equal(historyBeforeRetry.at(-1).role,'assistant');
  const recovered=await store.turn(owner,first.id,failedKey,'hello',async(state,messages)=>{assert.equal(messages.at(-1).content,'hello');return {mode:'ai',reply:'Recovered',conversationState:state};});
  assert.equal(recovered.reply,'Recovered');const historyAfterRetry=(await store.get(owner,first.id)).messages;assert.equal(historyAfterRetry.length,historyBeforeRetry.length);assert.equal(historyAfterRetry.at(-2).content,'hello');assert.equal(historyAfterRetry.at(-1).content,'Recovered');
  assert.equal((await store.turn(owner,first.id,failedKey,'hello',async()=>{throw new Error('duplicate request was executed');})).reply,'Recovered');
  app=createApp({requireCustomerAuth:false,dbPath:':memory:',apiKey:'',conversations:store});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+app.server.address().port;
  const response=await fetch(base+'/api/session'),cookie=response.headers.get('set-cookie').split(';')[0];
  const req=(path,method='GET',input,c=cookie)=>fetch(base+'/api'+path,{method,headers:{cookie:c,origin:base,'Content-Type':'application/json'},body:input?JSON.stringify(input):undefined});
  const created=await req('/sessions','POST',{});assert.equal(created.status,201);const chat=await created.json();
  let r=await req('/sessions/'+chat.id+'/chat','POST',{requestId:randomUUID(),message:'I need internet for five employees. My email is test@example.com'});assert.equal(r.status,200);
  r=await req('/sessions/'+chat.id);const detail=await r.json();assert.equal(detail.requirements.employee_count,5);assert.ok(!JSON.stringify(detail).includes('test@example.com'));
  assert.equal((await req('/sessions/'+chat.id+'/chat','POST',{requestId:'bad',message:'hello'})).status,400);
  const otherResponse=await fetch(base+'/api/session'),otherCookie=otherResponse.headers.get('set-cookie').split(';')[0];assert.equal((await req('/sessions/'+chat.id,'GET',undefined,otherCookie)).status,404);
  const form={businessName:'Synthetic Retail',segment:'micro',employees:5,sites:2,cityTier:1,budget:5000,cameraCount:1,needs:['internet','mobile','email','backup','pos','cctv'],currentTools:'Existing card terminal'};
  const creationKey=randomUUID();
  const [createA,createB]=await Promise.all([req('/sessions','POST',{profile:form,requestId:creationKey}),req('/sessions','POST',{profile:form,requestId:creationKey})]);
  const journeyA=await createA.json(),journeyB=await createB.json();assert.equal(journeyA.id,journeyB.id);assert.equal(journeyA.requirements.business_name,form.businessName);
  const journeyId=journeyA.id;
  let journey=(await (await req('/sessions/'+journeyId)).json());assert.equal(journey.requirements.site_count,2);assert.equal(journey.requirements.budget,5000);assert.equal(journey.requirements.current_tools,form.currentTools);
  // Chat edits update the same canonical form state; absent model/default fields cannot remove other services.
  await req('/sessions/'+journeyId+'/chat','POST',{requestId:randomUUID(),message:"I don't need CCTV anymore. Also, increase my budget to ₹7,000."});
  journey=await (await req('/sessions/'+journeyId)).json();
  assert.equal(journey.requirements.budget,7000);assert.equal(journey.requirements.site_count,2);assert.equal(journey.requirements.employee_count,5);assert.equal(journey.requirements.business_name,form.businessName);assert.equal(journey.requirements.current_tools,form.currentTools);
  assert.deepEqual(journey.requirements.requested_services.sort(),['backup','email','internet','mobile','pos']);assert.ok(journey.revision>journeyA.revision);
  const pricing=await req('/recommend','POST',{sessionId:journeyId,revision:journey.revision,profile:{...form,budget:1,needs:['cctv']}});assert.equal(pricing.status,200);const priced=await pricing.json();assert.ok(priced.quote);assert.ok(!priced.quote.items.some(x=>x.productId==='P23'));
  assert.equal((await req('/sessions/'+journeyId+'/requirements','POST',{requestId:randomUUID(),revision:journeyA.revision,profile:form})).status,409);
  assert.equal((await req('/recommend','POST',{sessionId:journeyId,revision:journeyA.revision,profile:form})).status,409);
  assert.equal((await req('/sessions/'+journeyId+'/requirements','POST',{requestId:randomUUID(),revision:journey.revision,profile:form},otherCookie)).status,404);
  assert.equal((await req('/recommend','POST',{sessionId:journeyId,revision:journey.revision,profile:form},otherCookie)).status,404);
  const submitKey=randomUUID(),submitBody={requestId:submitKey,revision:journey.revision,profile:{...form,budget:8000,needs:['internet','mobile']}};
  const updateA=await (await req('/sessions/'+journeyId+'/requirements','POST',submitBody)).json(),updateB=await (await req('/sessions/'+journeyId+'/requirements','POST',submitBody)).json();assert.equal(updateA.revision,updateB.revision);assert.equal(updateA.sessionId,journeyId);
  const latest=await (await req('/sessions/'+journeyId+'/recommendation')).json();assert.equal(latest.requirements.budget,8000);assert.deepEqual(latest.requirements.requested_services.sort(),['internet','mobile']);
  const quotedItems=latest.recommendation.quote.items.map(x=>({productId:x.productId,quantity:x.productId==='P07'?3:x.quantity}));
  const repriced=await req('/quote','POST',{sessionId:journeyId,revision:latest.revision,profile:form,items:quotedItems});assert.equal(repriced.status,200);
  const persistedSelection=await (await req('/sessions/'+journeyId+'/recommendation')).json();assert.equal(persistedSelection.recommendation.quote.items.find(x=>x.productId==='P07').quantity,3);assert.equal(persistedSelection.requirements.selected_products.find(x=>x.productId==='P07').quantity,3);
  await req('/sessions/'+journeyId+'/chat','POST',{requestId:randomUUID(),message:'Thanks!'});
  const courtesySelection=await (await req('/sessions/'+journeyId+'/recommendation')).json();assert.equal(courtesySelection.revision,latest.revision);assert.equal(courtesySelection.recommendation.quote.items.find(x=>x.productId==='P07').quantity,3);
  await req('/sessions/'+journeyId+'/chat','POST',{requestId:randomUUID(),message:'Remove mobile SIMs. I only need internet.'});
  const removedSelection=await (await req('/sessions/'+journeyId+'/recommendation')).json();assert.deepEqual(removedSelection.requirements.selected_products,[]);assert.deepEqual(removedSelection.requirements.requested_services,['internet']);assert.ok(!removedSelection.recommendation.quote.items.some(x=>x.productId==='P07'));
  // Verification from a different journey is never reusable, even for identical profiles.
  const sameFormJourney=await (await req('/sessions','POST',{profile:form,requestId:randomUUID()})).json();
  const person={name:'Synthetic Owner',phone:'9876543210',address:'Synthetic installation address'};
  const verifyResponse=await req('/verify','POST',{sessionId:sameFormJourney.id,revision:sameFormJourney.revision,profile:form,consent:true,consentVersion:'2026-10-smart-kyc-v3',contact:person,documents:[],extractionMethod:'manual'});assert.equal(verifyResponse.status,200);const verification=await verifyResponse.json();
  const sameAgain=await (await req('/sessions','POST',{profile:form,requestId:randomUUID()})).json();
  const crossOrder=await req('/orders','POST',{sessionId:sameAgain.id,revision:sameAgain.revision,profile:form,consent:true,contact:person,verificationId:verification.id,items:sameAgain.recommendation.quote.items.map(x=>({productId:x.productId,quantity:x.quantity})),requestKey:randomUUID()});assert.equal(crossOrder.status,409);
  // Mixed city tiers and camera splits persist in the same PostgreSQL journey.
  const branches={...form,needs:['internet','cctv'],cameraCount:3,locations:[
    {id:'north',name:'North branch',city:'Demo North',cityTier:1,cameraCount:2},
    {id:'south',name:'South branch',city:'Demo South',cityTier:2,cameraCount:1}]};
  const branchCreation=await req('/sessions','POST',{profile:branches,requestId:randomUUID()});assert.equal(branchCreation.status,201);
  const branchJourney=await branchCreation.json();
  const branchReload=await (await req('/sessions/'+branchJourney.id+'/recommendation')).json();
  assert.deepEqual(branchReload.requirements.locations.map(location=>location.city_tier),[1,2]);
  assert.deepEqual(branchReload.requirements.locations.map(location=>location.camera_count),[2,1]);
  const branchItems=branchReload.recommendation.quote.items.map(({productId,quantity,locationId})=>({productId,quantity,...(locationId?{locationId}:{})}));
  assert.equal((await req('/quote','POST',{sessionId:branchJourney.id,revision:branchReload.revision,items:branchItems})).status,200);
  const branchSaved=await (await req('/sessions/'+branchJourney.id+'/recommendation')).json();
  assert.ok(branchSaved.requirements.selected_products.every(item=>item.locationId));
  assert.equal((await req('/sessions/'+branchJourney.id,'GET',undefined,otherCookie)).status,404);
  assert.equal((await req('/sessions/'+chat.id,'DELETE')).status,200);assert.equal((await req('/sessions/'+chat.id)).status,404);
  await store.remove(owner,first.id);assert.equal(Number((await store.pool.query('SELECT count(*) FROM advisor_messages WHERE session_id=$1',[first.id])).rows[0].count),0);
  await store.pool.query("UPDATE advisor_owners SET expires_at=now()-interval '1 second' WHERE id=$1",[owner]);assert.deepEqual(await store.list(owner),[]);await assert.rejects(store.get(owner,second.id),e=>e.status===404);
  const guest='c'.repeat(64),account='d'.repeat(64),accountOther='e'.repeat(64),claimCreationKey=randomUUID();
  const guestChat=await store.create(guest,expiry,'Guest chat',undefined,claimCreationKey);
  await store.turn(guest,guestChat.id,randomUUID(),'I need email for five employees.',(state,messages)=>conversationAdvisor({},state,messages,data));
  await store.create(account,expiry,'Account chat',undefined,claimCreationKey);
  await store.touchOwner(account,expiry);await store.claimGuest(guest,account,expiry);await store.claimGuest(guest,account,expiry);
  assert.equal((await store.list(guest)).length,0);assert.equal((await store.list(account)).length,2);
  assert.equal((await store.get(account,guestChat.id)).messages.length,2);
  await assert.rejects(store.get(guest,guestChat.id),e=>e.status===404);await assert.rejects(store.get(accountOther,guestChat.id),e=>e.status===404);
 }finally{
  if(app){app.server.closeAllConnections();await new Promise(r=>app.server.close(r));app.store.close();}
  await store.close();await admin.query('DROP DATABASE '+name+' WITH (FORCE)');await admin.end();
 }
});
