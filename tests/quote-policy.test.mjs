import test from 'node:test';
import assert from 'node:assert/strict';
import {loadData,profile,quote} from '../src/catalogue.mjs';
import {createApp} from '../server.mjs';
import {translateMessage} from '../public/locale.js';
import {conversationAdvisor} from '../src/conversation-advisor.mjs';
import {freshMemory,publicRequirements} from '../src/conversation-memory.mjs';
const data=loadData('YTL_TrackA_Udyam_Digital_Data');
const p=profile({businessName:'Demo Office',segment:'prof',employees:5,sites:1,cityTier:1,budget:5000,needs:['internet','email']});
test('fixed demo quote derives from catalogue minimums and reprices quantity changes',()=>{
 const items=[{productId:'P01',quantity:1},{productId:'P16',quantity:5}];
 const q=quote(p,items,data);
 assert.equal(q.checkoutMonthly,q.items.reduce((s,x)=>s+x.quantity*data.products.find(p=>p.id===x.productId).price,0));
 assert.equal(q.pricingPolicy,'catalogue_minimum_demo_v1');assert.ok(q.monthlyMax>q.checkoutMonthly);
 const changed=quote(p,[items[0],{productId:'P16',quantity:3}],data);
 assert.equal(q.checkoutMonthly-changed.checkoutMonthly,2*data.products.find(x=>x.id==='P16').price);
 assert.ok(q.pricingNote.includes('real provider'));
});
test('quote distinguishes requested services, catalogue dependencies and selected add-ons',()=>{
 const business=profile({...p,needs:['cctv']});
 const items=[{productId:'P23',quantity:2},{productId:'P01',quantity:1},{productId:'P16',quantity:3,selectionType:'requested'}];
 const result=quote(business,items,data);
 assert.deepEqual(result.items.map(line=>line.selectionType),['requested','supporting','addon']);
 assert.deepEqual(result.breakdown,{requested:{monthly:398,setup:3600},supporting:{monthly:999,setup:0},addon:{monthly:375,setup:0}});
 assert.equal(Object.values(result.breakdown).reduce((sum,group)=>sum+group.monthly,0),result.checkoutMonthly);
 assert.equal(Object.values(result.breakdown).reduce((sum,group)=>sum+group.setup,0),result.setup);
 assert.throws(()=>quote(business,items.filter(item=>item.productId!=='P01'),data),error=>error.code==='MISSING_DEPENDENCY');
 const removed=quote(business,items.slice(0,2),data);
 assert.equal(removed.breakdown.addon.monthly,0);
 assert.equal(result.monthly-removed.monthly,375);
 const requestedEmail=quote(profile({...business,needs:['cctv','email']}),items,data);
 assert.equal(requestedEmail.items.find(item=>item.productId==='P16').selectionType,'requested');
});
test('HTTP quote and saved order ignore client prices and preserve the pricing policy',async t=>{
 const app=createApp({requireCustomerAuth:false,data,dbPath:':memory:',apiKey:''});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 t.after(()=>{app.server.closeAllConnections();app.server.close();app.store.close();});
 const base='http://127.0.0.1:'+app.server.address().port;
 const cookie=(await fetch(base+'/api/session')).headers.get('set-cookie').split(';')[0];
 const call=(path,input)=>fetch(base+'/api'+path,{method:input?'POST':'GET',headers:{cookie,origin:base,'content-type':'application/json'},body:input?JSON.stringify(input):undefined});
 const items=[{productId:'P01',quantity:1,unitPrice:1}],expected=quote(p,items,data);
 const q=await (await call('/quote',{profile:p,items,checkoutMonthly:1,pricingPolicy:'free'})).json();
 assert.equal(q.checkoutMonthly,expected.monthly);assert.equal(q.pricingPolicy,expected.pricingPolicy);
 const contact={name:'Demo Owner',phone:'9876543210',address:'10 Demo Road, Demo City 400001'};
 const v=await (await call('/verify',{profile:p,contact,consent:true,documents:[]})).json();
 const o=await (await call('/orders',{profile:p,contact,consent:true,items,verificationId:v.id,requestKey:crypto.randomUUID(),checkoutMonthly:1})).json();
 assert.equal(o.quote.checkoutMonthly,expected.monthly);assert.equal(o.quote.pricingPolicy,expected.pricingPolicy);
 const saved=await (await call('/orders/'+o.id)).json();assert.equal(saved.quote.checkoutMonthly,expected.monthly);
 assert.deepEqual(saved.quote.breakdown,expected.breakdown);
 const changedItems=[...items,{productId:'P19',quantity:2,unitPrice:1,selectionType:'requested'}];
 const changed=await (await call('/quote',{profile:p,items:changedItems})).json();
 assert.equal(changed.breakdown.addon.monthly,1198);assert.equal(changed.breakdown.addon.setup,5000);
 assert.equal(changed.checkoutMonthly,expected.checkoutMonthly+1198);
 const updatedOrder=await (await call('/orders',{profile:p,contact,consent:true,items:changedItems,verificationId:v.id,requestKey:crypto.randomUUID()})).json();
 assert.deepEqual(updatedOrder.quote,changed);
 assert.deepEqual((await (await call('/orders/'+o.id)).json()).quote,saved.quote);
 const limitedProfile={...p,budget:100};
 const limitedVerification=await (await call('/verify',{profile:limitedProfile,contact,consent:true,documents:[]})).json();
 assert.equal((await call('/orders',{profile:limitedProfile,contact,consent:true,items:changedItems,verificationId:limitedVerification.id,requestKey:crypto.randomUUID()})).status,400);
});
test('Hindi covers quote policy, current KYC results and support while English is preserved',()=>{
 for(const text of ['Fixed demo monthly quote','Checks passed','Action required','Preview document','Refresh saved KYC results','Installation or activation','Document preview','Certificate GSTIN differs from the entered GSTIN.','Upload the missing document.','Fixed demo quote uses catalogue minimums. Setup is one-time; taxes are excluded.']){
   assert.match(translateMessage(text,'hi'),/[\u0900-\u097f]/);assert.equal(translateMessage(text,'en'),text);
 }
 assert.equal(translateMessage('Selected: demo.pdf','hi'),'चुनी फ़ाइल: demo.pdf');
 assert.match(translateMessage('Reader: local · Storage: temporary','hi'),/रीडर: स्थानीय/);
});
test('Hindi no-key conversations preserve stated counts and ask the missing question in Hindi',async()=>{
 const result=await conversationAdvisor({apiKey:''},freshMemory(),[{role:'user',content:'मेरे क्लिनिक में ५ कर्मचारी हैं। इंटरनेट और ईमेल चाहिए। बजट ३००० है।'}],data,'hi');
 const requirements=publicRequirements(result.conversationState);
 assert.equal(requirements.business_type,'prof');assert.equal(requirements.employee_count,5);assert.equal(requirements.budget,3000);
 assert.deepEqual(new Set(requirements.requested_services),new Set(['internet','email']));
 assert.match(result.reply,/कितने स्थान/);assert.ok(!result.reply.includes('How many'));assert.equal(result.mode,'guided');
});
