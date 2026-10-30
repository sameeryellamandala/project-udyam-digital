import test from 'node:test';
import assert from 'node:assert/strict';
import {aiConfig} from '../src/ai-config.mjs';
import {structured,advisor,checkedReply,conforms} from '../src/ai.mjs';
import {profile,loadData,recommend} from '../src/catalogue.mjs';
import {quote,eligibility} from '../src/catalogue.mjs';
import {translateMessage} from '../locale.js';
const data=loadData('YTL_TrackA_Udyam_Digital_Data');
const p=profile({businessName:'Test Clinic',segment:'prof',employees:5,sites:1,cityTier:1,budget:3000,needs:['internet','email']});

test('Groq is the explicit default and an OpenAI key never silently enables paid fallback',()=>{
 assert.equal(aiConfig({OPENAI_API_KEY:'test-openai'}).provider,'groq');assert.equal(aiConfig({OPENAI_API_KEY:'test-openai'}).apiKey,'');
 assert.equal(aiConfig({AI_PROVIDER:'openai',OPENAI_API_KEY:'test-openai'}).apiKey,'test-openai');
 assert.throws(()=>aiConfig({AI_PROVIDER:'unknown'}),/AI_PROVIDER/);
});
test('advisor currency stays INR and invented monetary amounts are rejected',()=>{
 const q=recommend(p,data).quote;
 assert.equal(checkedReply('The quote is $'+q.monthly,q),'The quote is ₹'+q.monthly);
 assert.equal(checkedReply('The package covers 8 users.',q),'The package covers 8 users.');
 assert.equal(checkedReply('This fits your Rs 3000 budget.',q,p.budget),'This fits your Rs 3000 budget.');
 assert.throws(()=>checkedReply('The quote is ₹123456',q),/differ/);
});
test('Groq adapter sends a strict schema and minimizes private identifiers',async t=>{
 let requested=false;
 t.mock.method(globalThis,'fetch',async(url,init)=>{
   requested=true;assert.equal(url,'https://api.groq.com/openai/v1/chat/completions');
   const body=JSON.parse(init.body);assert.equal(body.response_format.json_schema.strict,true);assert.equal(body.model,'openai/gpt-oss-120b');
   assert.ok(!init.body.includes('9876543210'));assert.ok(!init.body.includes('private@example.com'));
   return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({reply:'A suitable package is ready.',segment:'prof',employees:5,sites:1,cityTier:1,budget:3000,needs:['internet','email'],currentTools:''})}}]});
 });
 const result=await advisor({provider:'groq',apiKey:'test-key',model:'openai/gpt-oss-120b'},p,[{role:'user',content:'Contact 9876543210 private@example.com'}],recommend(p,data),data);
 assert.ok(requested);assert.equal(result.mode,'ai');assert.equal(result.proposedProfile.employees,5);
});
test('Groq rate limits and invalid JSON fall back without another paid provider call',async t=>{
 let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json({error:'limited'},{status:429});});
 const config={provider:'groq',apiKey:'test-key',model:'openai/gpt-oss-120b'};
 const result=await advisor(config,p,[{role:'user',content:'Explain my internet plan'}],recommend(p,data),data);
 assert.equal(result.mode,'guided');assert.equal(result.fallbackReason,'AI_RATE_LIMIT');assert.equal(calls,1);
 t.mock.restoreAll();t.mock.method(globalThis,'fetch',async()=>Response.json({choices:[{finish_reason:'stop',message:{content:'invalid json'}}]}));
 await assert.rejects(structured(config,'test',{},'Return JSON',[]),/unreadable/);
});
test('multilingual strict-decoder failures retry once in JSON mode and validate locally',async t=>{
 let calls=0;const schema={type:'object',properties:{reply:{type:'string'}},required:['reply'],additionalProperties:false};
 t.mock.method(globalThis,'fetch',async(url,init)=>{calls++;assert.equal(url,'https://api.groq.com/openai/v1/chat/completions');if(calls===1)return Response.json({error:{code:'json_validate_failed'}},{status:400});assert.equal(JSON.parse(init.body).response_format.type,'json_object');return Response.json({choices:[{finish_reason:'stop',message:{content:'{"reply":"नमस्ते"}'}}]});});
 const result=await structured({provider:'groq',apiKey:'test-key',model:'openai/gpt-oss-120b'},'test',schema,'Reply in Hindi',[]);
 assert.equal(calls,2);assert.equal(result.reply,'नमस्ते');assert.equal(conforms({reply:12},schema),false);assert.equal(conforms({reply:'ok',extra:true},schema),false);
});
test('Hindi localization covers service controls, messages and English round-trip',()=>{
 assert.equal(translateMessage('Address proof','hi'),'पते का प्रमाण');
 assert.ok(translateMessage('address: document is missing.','hi').includes('दस्तावेज़'));
 assert.ok(translateMessage('Quantity must be a whole number from 1 to 10000.','hi').includes('पूरी संख्या'));
 assert.equal(translateMessage('Address proof','en'),'Address proof');
});

test('all business segments, tiers and budget bands produce valid eligible quotes or clear no-fit outcomes',()=>{
 const active=[...data.gst.values()].find(r=>r.status==='Active');
 for(const segment of ['micro','prof','multi','mfg'])for(const cityTier of [1,2])for(const budget of [10,1000,2500,15000])for(const registered of [false,true]){
   const p=profile({businessName:'Test Business',segment,employees:12,sites:segment==='multi'?3:1,cityTier,budget,needs:['internet','email','backup','security'],gstin:registered?active.gstin:''});
   const r=recommend(p,data);
   if(!r.quote){assert.ok(r.warnings.length);continue;}
   assert.ok(r.quote.monthly<=budget);
   const priced=quote(p,r.quote.items.map(x=>({productId:x.productId,quantity:x.quantity})),data);
   assert.equal(priced.monthly,r.quote.monthly);
   for(const item of priced.items)assert.deepEqual(eligibility(data.products.find(x=>x.id===item.productId),p,data),[]);
 }
});
