import test from 'node:test';
import assert from 'node:assert/strict';
import {aiConfig} from '../src/ai-config.mjs';
import {structured,advisor,checkedReply,conforms} from '../src/ai.mjs';
import {conversationAdvisor} from '../src/conversation-advisor.mjs';
import {profile,loadData,recommend} from '../src/catalogue.mjs';
import {quote,eligibility} from '../src/catalogue.mjs';
import {translateMessage} from '../public/locale.js';
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
 assert.throws(()=>checkedReply('The quote is ₹'+q.monthly+'–123456',q),/differ/);
});
const extracted=(extra={})=>({intent:'requirements',segment:'prof',employees:5,sites:1,cityTier:1,budget:3000,needs:['internet','email'],currentTools:'',city:'Test City',gstStatus:'no',cameraCount:0,knownFields:['segment','city','employees','sites','cityTier','budget','needs','gstStatus'],mobileLines:0,emailAccounts:0,internetPreference:'any',action:'recommend',selectedProductIds:[],...extra});
const groqResponse=value=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}]});
test('Groq validates requirements before generating a catalogue explanation',async t=>{
 let calls=0;
 t.mock.method(globalThis,'fetch',async(url,init)=>{
  calls++;assert.equal(url,'https://api.groq.com/openai/v1/chat/completions');
  const body=JSON.parse(init.body);assert.equal(body.response_format.json_schema.strict,true);
  assert.ok(!init.body.includes('9876543210'));assert.ok(!init.body.includes('private@example.com'));
  if(body.response_format.json_schema.name==='advisor_requirements')return groqResponse(extracted());
  const context=JSON.parse(body.messages[1].content);assert.ok(context.validated.quote);return groqResponse({reply:'A suitable package is ready to review.'});
 });
 const result=await advisor({provider:'groq',apiKey:'test-key',model:'openai/gpt-oss-120b'},p,[{role:'user',content:'Contact 9876543210 private@example.com'}],recommend(p,data),data);
 assert.equal(calls,2);assert.equal(result.mode,'ai');assert.equal(result.proposedProfile.employees,5);assert.ok(result.options.length);
});
test('5G selection is repriced and preserves email instead of returning a fixed echo',async t=>{
 let calls=0;t.mock.method(globalThis,'fetch',async(url,init)=>{calls++;return groqResponse(JSON.parse(init.body).response_format.json_schema.name==='advisor_requirements'?extracted({internetPreference:'5g'}):{reply:'Your 5G option and email package are ready to review.'});});
 const result=await advisor({provider:'groq',apiKey:'test-key',model:'openai/gpt-oss-120b'},p,[{role:'assistant',content:'Do you prefer fibre or 5G?'},{role:'user',content:'5G AirFiber option'}],recommend(p,data),data);
 assert.equal(calls,2);assert.equal(result.mode,'ai');assert.ok(result.quote.items.some(x=>x.productId==='P04'));assert.ok(result.quote.items.some(x=>x.productId==='P16'));
});
test('Groq rate limits and invalid JSON fall back without another paid provider call',async t=>{
 let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json({error:'limited'},{status:429});});
 const config={provider:'groq',apiKey:'test-key',model:'openai/gpt-oss-120b'};
 const saved={memoryVersion:2,details:{knownFields:['employees','budget'],employees:5,budget:3000,needs:['internet']},items:[]};
 const result=await advisor(config,p,[{role:'user',content:'Explain my internet plan'}],recommend(p,data),data,saved);
 assert.equal(result.mode,'unavailable');assert.equal(result.reply,undefined);assert.equal(result.fallbackReason,'AI_RATE_LIMIT');assert.equal(calls,3);
 assert.deepEqual(result.conversationState,saved);
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
   assert.equal(r.coverage.covered.length,r.coverage.requested.length);
   if(r.quote.monthly>budget)assert.ok(r.quote.warnings.some(x=>/exceeds your monthly budget/.test(x)));
   const priced=quote(p,r.quote.items.map(x=>({productId:x.productId,quantity:x.quantity})),data);
   assert.equal(priced.monthly,r.quote.monthly);
   for(const item of priced.items)assert.deepEqual(eligibility(data.products.find(x=>x.id===item.productId),p,data),[]);
 }
});

 test('Ollama uses local schema output without cloud credentials',async t=>{
 const config=aiConfig({AI_PROVIDER:'ollama',OPENAI_MODEL:'cloud-model'});
 assert.equal(config.model,'qwen3.5:4b');
 t.mock.method(globalThis,'fetch',async(url,init)=>{
 assert.equal(url,'http://127.0.0.1:11434/api/chat');
 assert.equal(init.headers.Authorization,undefined);
 const body=JSON.parse(init.body);assert.equal(body.think,false);assert.equal(body.stream,false);
 return Response.json({done:true,done_reason:'stop',message:{content:'{"reply":"Hello"}'}});
 });
 const schema={type:'object',properties:{reply:{type:'string'}},required:['reply'],additionalProperties:false};
 assert.deepEqual(await structured(config,'test',schema,'Reply briefly',[]),{reply:'Hello'});
 });

 test('Groq retries one malformed schema response and validates the recovery',async t=>{
 let calls=0;t.mock.method(globalThis,'fetch',async(url,init)=>{calls++;return groqResponse(calls===1?{wrong:'field'}:{reply:'Recovered'});});
 const schema={type:'object',properties:{reply:{type:'string'}},required:['reply'],additionalProperties:false};
 const r=await structured({provider:'groq',apiKey:'test-key',model:'openai/gpt-oss-120b'},'test',schema,'Return JSON',[]);
 assert.equal(calls,2);assert.deepEqual(r,{reply:'Recovered'});
 });

test('nullable unknown discovery fields normalize without accepting invalid confirmed facts',async t=>{
 const config={provider:'groq',apiKey:'test-key',model:'openai/gpt-oss-120b'};
 t.mock.method(globalThis,'fetch',async()=>groqResponse(extracted({knownFields:['segment','internetPreference'],employees:null,emailAccounts:null})));
 const r=await advisor(config,p,[{role:'user',content:'Recommend options for my clinic'}],recommend(p,data),data);
 assert.equal(r.mode,'ai');assert.equal(r.proposedProfile.employees,p.employees);assert.deepEqual(r.conversationState.details.knownFields,['segment']);
 t.mock.restoreAll();let calls=0;
 t.mock.method(globalThis,'fetch',async()=>{calls++;return groqResponse(extracted({knownFields:['employees'],employees:null}));});
 const invalid=await advisor(config,p,[{role:'user',content:'I have five employees'}],recommend(p,data),data);
 assert.equal(invalid.mode,'unavailable');assert.equal(invalid.fallbackReason,'AI_INVALID_REPLY');assert.equal(calls,2);
});

test('Groq honours a bounded 429 retry and records safe usage telemetry',async t=>{
 let calls=0;const logs=[];t.mock.method(console,'info',line=>logs.push(String(line)));
 t.mock.method(globalThis,'fetch',async()=>{calls++;if(calls===1)return new Response(JSON.stringify({error:{code:'rate_limit_exceeded'}}),{status:429,headers:{'content-type':'application/json','retry-after':'0'}});return Response.json({choices:[{finish_reason:'stop',message:{content:'{"reply":"Ready"}'}}],usage:{prompt_tokens:23,completion_tokens:4}});});
 const schema={type:'object',properties:{reply:{type:'string'}},required:['reply'],additionalProperties:false};
 const r=await structured({provider:'groq',apiKey:'never-log-this-secret',model:'openai/gpt-oss-120b'},'test',schema,'Return JSON',[],{requestId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',sessionId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'});
 assert.deepEqual(r,{reply:'Ready'});assert.equal(calls,2);assert.ok(logs.some(line=>line.includes('"statusCode":429')&&line.includes('rate_limit_exceeded')));assert.ok(logs.some(line=>line.includes('"inputTokens":23')&&line.includes('"outputTokens":4')));assert.ok(logs.every(line=>!line.includes('never-log-this-secret')));assert.ok(logs.every(line=>line.includes('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')&&line.includes('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')));
});

test('rate-limit failure is explained safely and does not lose requirements',async t=>{
 let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return new Response('{}',{status:429,headers:{'content-type':'application/json','retry-after':'0'}});});
 const saved={memoryVersion:2,profile:p,details:{knownFields:['employees','budget'],employees:5,budget:3000,needs:['internet']},items:[]};
 const result=await conversationAdvisor({provider:'groq',apiKey:'test-key',model:'openai/gpt-oss-120b'},saved,[{role:'user',content:'Explain my internet plan'}],data,'en',{}, {requestId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',sessionId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'});
 assert.equal(calls,3);assert.equal(result.mode,'unavailable');assert.equal(result.reply,'Our AI advisor is receiving many requests. Please try again shortly.');assert.equal(result.fallbackReason,undefined);assert.deepEqual(result.conversationState.details,saved.details);
});

test('temporary provider failure retries once and concurrent model calls are bounded',async t=>{
 const schema={type:'object',properties:{reply:{type:'string'}},required:['reply'],additionalProperties:false};let calls=0,active=0,peak=0;
 t.mock.method(globalThis,'fetch',async()=>{const call=++calls;active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,15));active--;if(call===1)return Response.json({error:{code:'temporary_unavailable'}},{status:503});return groqResponse({reply:'Ready'});});
 const config={provider:'groq',apiKey:'test-key',model:'openai/gpt-oss-120b'};
 const values=await Promise.all(Array.from({length:5},()=>structured(config,'test',schema,'Return JSON',[])));
 assert.equal(values.length,5);assert.ok(values.every(value=>value.reply==='Ready'));assert.ok(calls>=6);assert.ok(peak<=2);
});

test('structured correction prompt names missing fields and wrong JSON types',async t=>{
 let calls=0;const schema={type:'object',properties:{reply:{type:'string'},complete:{type:'boolean'}},required:['reply','complete'],additionalProperties:false};
 t.mock.method(globalThis,'fetch',async(url,init)=>{calls++;if(calls===2){const prompt=JSON.parse(init.body).messages[0].content;assert.match(prompt,/\$\.reply:expected_string/);assert.match(prompt,/\$\.complete:missing/);return groqResponse({reply:'fixed',complete:true});}return groqResponse({reply:12});});
 const result=await structured({provider:'groq',apiKey:'test-key',model:'openai/gpt-oss-120b'},'test',schema,'Return JSON',[]);
 assert.deepEqual(result,{reply:'fixed',complete:true});assert.equal(calls,2);
});
