import test from 'node:test';
import assert from 'node:assert/strict';
import {validatedPackages,runAdvisorFlow} from '../src/advisor-flow.mjs';
import {loadData,profile} from '../src/catalogue.mjs';
import {checkedReply,redact} from '../src/ai.mjs';
import {createStore} from '../src/store.mjs';
const data=loadData('YTL_TrackA_Udyam_Digital_Data');
const p=profile({businessName:'Demo Clinic',segment:'prof',employees:8,sites:1,cityTier:2,budget:3000,needs:['internet','email']});
const known=['segment','city','employees','sites','cityTier','budget','needs','gstStatus'];
const details=(extra={})=>({segment:'prof',employees:8,sites:1,cityTier:2,budget:3000,needs:['internet','email'],currentTools:'',city:'Demo City',gstStatus:'no',knownFields:known,mobileLines:0,emailAccounts:0,internetPreference:'any',action:'recommend',selectedProductIds:[],...extra});
const deps=value=>({checkedReply,redact,structured:async(c,name,schema,instructions,input)=>name==='advisor_requirements'?value:{reply:'Your validated package is ready for review.'}});

test('backend rejects Tier-2 1G, two-site SD-WAN and failover without a base connection',()=>{
 for(const id of ['P03','P10','P09']){
  const r=validatedPackages(p,details({selectedProductIds:[id]}),data);
  assert.equal(r.quote,null);assert.ok(r.issues.length);assert.ok(r.options.every(o=>!o.items.some(x=>x.productId===id)));
 }
 const normal=validatedPackages(p,details(),data);assert.ok(normal.quote);assert.ok(normal.quote.items.every(x=>!data.products.find(y=>y.id===x.productId).requiresGst));
});
test('5G preference retains eight emails and explicit connection quantities are backend priced',()=>{
 const b=profile({...p,needs:['internet','email','mobile'],budget:6000});
 const r=validatedPackages(b,details({internetPreference:'5g',emailAccounts:4,mobileLines:3}),data);
 assert.deepEqual(r.quote.items.map(x=>[x.productId,x.quantity]).sort(),[['P04',1],['P07',3],['P16',4]]);
});
test('requested CCTV camera count is retained and priced from the catalogue',()=>{
 const b=profile({...p,segment:'micro',employees:5,sites:1,cityTier:2,budget:5000,needs:['internet','cctv']});
 const r=validatedPackages(b,details({segment:'micro',employees:5,sites:1,cityTier:2,budget:5000,needs:['internet','cctv'],cameraCount:4}),data);
 const cctv=r.quote.items.find(x=>x.productId==='P23');
 assert.equal(cctv.quantity,4);assert.equal(cctv.monthly,4*data.products.find(x=>x.id==='P23').price);assert.equal(cctv.monthlyMax,4*data.products.find(x=>x.id==='P23').maxPrice);
 assert.match(r.quote.items.map(x=>x.name).join(' '),/Cloud CCTV/);
});
test('kirana requirements survive an additive turn and get one complete catalogue-priced bundle',async()=>{
 const business=profile({...p,businessName:'Kirana Shop',segment:'micro',employees:5,sites:1,cityTier:2,budget:3000,needs:['internet','mobile']});
 const savedDetails={...details({segment:'micro',employees:5,sites:1,cityTier:2,budget:3000,needs:['internet','mobile'],city:'Vijayawada',gstStatus:'no',mobileLines:3,mobilePlanType:'postpaid'}),knownFields:['segment','city','employees','sites','cityTier','budget','needs','gstStatus'],selectionMode:'merge'};
 const previous={memoryVersion:1,profile:business,details:savedDetails,postpaidConfirmed:true,items:[{productId:'P01',quantity:1},{productId:'P07',quantity:3}],offers:[]};
 const api={checkedReply,redact,structured:async(_config,name)=>name==='advisor_requirements'?details({segment:'micro',employees:1,sites:1,cityTier:1,budget:1,needs:['cctv','pos'],city:'',gstStatus:'unknown',knownFields:['needs'],mobileLines:0,action:'change'}):{reply:'The selection list is empty. Static IP is mandatory for Cloud CCTV.'}};
 const result=await runAdvisorFlow({},business,[{role:'user',content:'Also add CCTV for one camera and Cloud POS.'}],data,previous,api);
 assert.deepEqual(result.proposedProfile.needs.sort(),['cctv','internet','mobile','pos']);
 assert.equal(result.conversationState.details.city,'Vijayawada');
 assert.equal(result.conversationState.details.gstStatus,'no');
 assert.equal(result.conversationState.details.employees,5);
 assert.equal(result.conversationState.details.sites,1);
 assert.equal(result.conversationState.details.budget,3000);
 assert.deepEqual(result.quote.items.map(x=>[x.productId,x.quantity]).sort(),[['P01',1],['P07',3],['P19',1],['P23',1]]);
 assert.equal(result.quote.monthly,2694);assert.equal(result.quote.monthlyMax,3594);assert.equal(result.quote.setup,4300);
 assert.ok(result.quote.warnings.some(x=>/catalogue price range may exceed/.test(x)));
 assert.match(result.reply,/3 postpaid SIM connections/);assert.match(result.reply,/₹2,694–₹3,594/);assert.match(result.reply,/₹4,300/);assert.match(result.reply,/upper estimate is ₹594 over/);
 assert.match(result.reply,/₹299–₹399 per line\/month; line total ₹897–₹1,197\/month/);assert.match(result.reply,/one-time setup ₹2,500/);assert.match(result.reply,/Taxes are excluded/);assert.match(result.reply,/does not place an order/);
 for(const option of result.options){assert.equal(option.items.find(x=>x.productId==='P07')?.quantity,3);assert.ok(option.items.some(x=>x.productId==='P19'));assert.ok(option.items.some(x=>x.productId==='P23'));assert.ok(option.items.some(x=>['P01','P02','P03','P04','P05','P06'].includes(x.productId)));}
 assert.doesNotMatch(result.reply,/selection list is empty|Static IP/i);
 assert.match(result.reply,/Cloud CCTV must be bundled with a primary connection/);
 assert.equal(result.proceed,false);
});
test('city name is retained but an unknown city tier is asked before any final quote is exposed',async()=>{
 const business=profile({...p,businessName:'Kirana Shop',segment:'micro',employees:5,sites:1,cityTier:2,budget:3000,needs:['internet','mobile']});
 const saved={...details({segment:'micro',employees:5,sites:1,budget:3000,needs:['internet','mobile'],city:'Vijayawada',gstStatus:'no',mobileLines:3,mobilePlanType:'postpaid'}),knownFields:['segment','city','employees','sites','budget','needs','gstStatus']};
 const api={checkedReply,redact,structured:async(_config,name)=>name==='advisor_requirements'?details({knownFields:['needs'],needs:['pos','cctv'],action:'change'}):{reply:'I can check the package.'}};
 const result=await runAdvisorFlow({},business,[{role:'user',content:'Also add CCTV and Cloud POS.'}],data,{memoryVersion:1,profile:business,details:saved,postpaidConfirmed:true,items:[]},api);
 assert.equal(result.quote,null);assert.deepEqual(result.options,[]);assert.equal(result.conversationState.details.city,'Vijayawada');assert.deepEqual(result.proposedProfile.needs.sort(),['cctv','internet','mobile','pos']);assert.match(result.reply,/Tier 1 or Tier 2/);assert.doesNotMatch(result.reply,/Monthly total:|₹\d[\d,]*–₹/);
});
test('first AI discovery reply acknowledges every stated kirana requirement before asking for locations',async()=>{
 const message='I run a small grocery store in Vijayawada. I have 5 employees and currently use a personal broadband connection. I don\'t have a GSTIN. I want reliable internet for daily billing, CCTV for security, Cloud POS for inventory management, and 3 postpaid SIM cards for my employees. My monthly budget is ₹3,000.';
 const extraction=details({segment:'micro',city:'Vijayawada',employees:5,budget:3000,gstStatus:'no',currentTools:'',knownFields:['segment','city','employees','budget','gstStatus','needs'],needs:['internet','mobile'],mobileLines:3,mobilePlanType:'postpaid',action:'discover'});
 const api={checkedReply,redact,structured:async(_config,name)=>name==='advisor_requirements'?extraction:{reply:''}};
 const result=await runAdvisorFlow({},p,[{role:'user',content:message}],data,{memoryVersion:1,details:{knownFields:[],needs:[]},items:[],offers:[]},api);
 assert.deepEqual(result.proposedProfile.needs.sort(),['cctv','internet','mobile','pos']);
 assert.equal(result.conversationState.details.sites,1);assert.ok(!result.conversationState.details.knownFields.includes('sites'));
 assert.equal(result.conversationState.details.currentTools,'a personal broadband connection');
 for(const fact of ['grocery or retail store in Vijayawada with 5 employees','personal broadband connection','business internet','CCTV','Cloud POS','3 postpaid SIM cards','GST registration','₹3,000'])assert.match(result.reply,new RegExp(fact.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'));
 assert.match(result.reply,/How many business locations do you have\?/);assert.equal((result.reply.match(/\?/g)||[]).length,1);
 assert.doesNotMatch(result.reply,/Monthly total:|₹2,694|complete package costs/i);
});
test('advisor asks for CCTV quantity before showing a complete package',async()=>{
 const business=profile({...p,segment:'micro',sites:1,cityTier:2,needs:['internet','cctv']});
 const d=details({segment:'micro',city:'Vijayawada',employees:5,sites:1,cityTier:2,budget:3000,needs:['internet','cctv'],knownFields:[...known],cameraCount:0});
 const result=await runAdvisorFlow({},business,[{role:'user',content:'I need internet and CCTV for my shop.'}],data,{},deps(d));
 assert.equal(result.quote,null);assert.deepEqual(result.options,[]);assert.match(result.reply,/How many CCTV cameras/);
});
test('a short answer to the pending camera question is a requirement even if the model calls it a question',async()=>{
 const business=profile({...p,segment:'micro',employees:5,sites:1,cityTier:2,budget:3000,needs:['internet','cctv']});
 const remembered=details({...business,city:'Synthetic City',cameraCount:0,knownFields:[...known]});
 const previous={memoryVersion:1,profile:business,formConfirmed:true,details:remembered,items:[],awaitingQuestion:'How many CCTV cameras do you need in total?'};
 const result=await runAdvisorFlow({},business,[{role:'user',content:'4'}],data,previous,deps(details({intent:'question',knownFields:[],cameraCount:0})));
 assert.equal(result.quote.items.find(item=>item.productId==='P23').quantity,4);assert.equal(result.conversationState.details.cameraCount,4);assert.equal(result.conversationState.details.budget,3000);
});
test('conversation remembers needs on a short choice and confirms only an already offered quote',async()=>{
 const previous={details:details(),items:[{productId:'P01',quantity:1},{productId:'P16',quantity:8}]};
 const choice=details({knownFields:[],needs:['internet'],internetPreference:'5g',selectedProductIds:['P04']});
 const r=await runAdvisorFlow({},p,[{role:'user',content:'5G AirFiber option'}],data,previous,deps(choice));
 assert.deepEqual(r.proposedProfile.needs,['email','internet']);assert.ok(r.quote.items.some(x=>x.productId==='P16'));assert.equal(r.proceed,false);
 const yes=details({knownFields:[],action:'confirm',internetPreference:'any'});
 const confirmed=await runAdvisorFlow({},r.proposedProfile,[{role:'user',content:'Yes, proceed'}],data,r.conversationState,deps(yes));
 assert.equal(confirmed.proceed,true);assert.ok(confirmed.quote.items.some(x=>x.productId==='P04'));
 const premature=await runAdvisorFlow({},p,[{role:'user',content:'yes'}],data,{},deps(details({action:'confirm'})));
 assert.equal(premature.proceed,false);
});
test('default form values do not count as collected facts and unknown discovery asks one question',async()=>{
 const r=await runAdvisorFlow({},p,[{role:'user',content:'Hi'}],data,{},deps(details({knownFields:[],action:'greeting'})));
 assert.equal(r.options,undefined);assert.equal(r.proposedProfile,undefined);assert.deepEqual(r.conversationState,{});assert.match(r.reply,/How can I help/);assert.equal(r.reply.match(/\?/g).length,1);
});
test('session-owned advisor summary persists and disappears with session expiry',()=>{
 const store=createStore(':memory:');try{
  const session=store.session(),other=store.session();store.saveAdvisorConversation(session.hash,{details:details(),items:[]});
  assert.equal(store.advisorConversation(session.hash).details.city,'Demo City');assert.deepEqual(store.advisorConversation(other.hash),{});
  store.db.prepare('UPDATE sessions SET expires_at=? WHERE id_hash=?').run('2000-01-01T00:00:00Z',session.hash);store.cleanup();assert.deepEqual(store.advisorConversation(session.hash),{});
 }finally{store.close();}
});

 test('invented model prices are replaced with authoritative quote facts',async()=>{
 const api=deps(details());api.structured=async(c,name)=>name==='advisor_requirements'?details():{reply:'The monthly price is ₹999999.'};
 const r=await runAdvisorFlow({},p,[{role:'user',content:'Recommend my package'}],data,{},api);
 assert.equal(r.mode,'ai');assert.equal(r.replySource,'catalogue');assert.ok(!r.reply.includes('999999'));assert.ok(r.reply.includes(r.quote.monthly.toLocaleString('en-IN')));
 });
 test('yes to a pending GST discovery question does not confirm a package',async()=>{
 const previous={...{details:details(),items:[{productId:'P01',quantity:1}]},awaitingQuestion:'Does your business have GST registration?'};
 const r=await runAdvisorFlow({},p,[{role:'user',content:'yes'}],data,previous,deps(details({action:'confirm',knownFields:['gstStatus'],gstStatus:'yes'})));
 assert.equal(r.proceed,false);
 });

test('SIM discovery summarizes actual counts without turning connections into employees',async()=>{
 const d=details({knownFields:['needs'],needs:['internet','mobile'],mobileLines:5});
 const r=await runAdvisorFlow({},p,[{role:'user',content:'I need internet and five mobile connections for my business. Can you recommend a bundle?'}],data,{},deps(d));
 assert.match(r.reply,/5 mobile SIM connections/);assert.ok(!r.reply.includes('8 employees'));assert.equal(r.options.length,0);
 const updated=await runAdvisorFlow({},p,[{role:'user',content:'Initially, I needed internet for five employees. Now I also need three additional SIM connections. Update my recommendation.'}],data,{},deps(details({knownFields:['needs'],needs:['internet','mobile'],action:'change'})));
 assert.equal(updated.proposedProfile.employees,5);assert.match(updated.reply,/3 mobile SIM connections/);assert.match(updated.reply,/5 employees/);
});

test('questions about guarantees, unavailable products and taxes receive direct honest answers',async()=>{
 for(const [message,expected] of [
  ['Can you guarantee that your internet will never go down?',/No internet service.*guaranteed/],
  ['I want a product that is not available in your catalogue. Can you arrange it?',/can’t promise/],
  ['Tell me the exact monthly price, including taxes and installation charges.',/does not provide tax rules/]
 ]){
  const r=await runAdvisorFlow({},p,[{role:'user',content:message}],data,{},deps(details({knownFields:[]})));
  assert.match(r.reply,expected);assert.ok(!r.reply.includes('What type of business'));
 }
});

test('a named product eligibility question is validated even if extraction omits its ID',async()=>{
 const r=await runAdvisorFlow({},p,[{role:'user',content:'I have two office locations. Can I purchase SD-WAN?'}],data,{},deps(details({knownFields:[],selectedProductIds:[]})));
 assert.equal(r.quote,null);assert.match(r.reply,/3 locations/);assert.match(r.reply,/in our catalogue/);assert.ok(!r.reply.includes('Cloud Email'));
});

test('unconfirmed form defaults and combined quote totals are withheld from explanation context',async()=>{
 let sent;
 const api=deps(details({knownFields:['segment','city','employees'],action:'recommend'}));
 api.structured=async(c,name,schema,instructions,input)=>{
  if(name==='advisor_requirements')return details({knownFields:['segment','city','employees'],action:'recommend'});
  sent=JSON.parse(input[0].content);return {reply:'We can explore internet, billing and CCTV services for your shop. Please confirm the remaining business information before we finalize a package.'};
 };
 await runAdvisorFlow({},p,[{role:'user',content:'Explain the available business options for my shop.'}],data,{},api);
 assert.equal(sent.profile.budget,undefined);assert.equal(sent.validated.quote,null);assert.deepEqual(sent.validated.options,[]);
});

test('SIM recommendations ask for postpaid preference before a final offer',async()=>{
 const b=profile({...p,needs:['internet','mobile'],budget:6000});
 const r=await runAdvisorFlow({},b,[{role:'user',content:'I need five SIM connections.'}],data,{},deps(details({needs:['internet','mobile'],mobileLines:5})));
 assert.match(r.reply,/postpaid connections for all 5/);assert.deepEqual(r.options,[]);
 const yes=await runAdvisorFlow({},r.proposedProfile,[{role:'user',content:'yes'}],data,r.conversationState,deps(details({knownFields:[],needs:['internet','mobile'],mobileLines:5})));
 assert.equal(yes.conversationState.postpaidConfirmed,true);assert.ok(yes.options.length>0);
});


test('an invalid optional 5G alternative does not block a valid fibre and failover package',async()=>{
 const business=profile({...p,segment:'multi',employees:17,sites:2,budget:5000,needs:['internet','backup','pos','cctv']});
 const d=details({segment:'multi',employees:17,sites:2,budget:5000,needs:business.needs,cameraCount:1,knownFields:[...known,'cameraCount']});
 const packages=validatedPackages(business,d,data);
 assert.ok(packages.quote);assert.ok(packages.quote.items.some(x=>x.productId==='P09'));
 assert.deepEqual(packages.issues,[]);
 assert.ok(packages.options.every(o=>!o.items.some(x=>x.productId==='P04')));
 const previous={details:d,items:packages.items};
 const greeting=await runAdvisorFlow({},business,[{role:'user',content:'hii'}],data,previous,deps(details({...d,knownFields:[],action:'greeting'})));
 assert.match(greeting.reply,/Hi!/);assert.doesNotMatch(greeting.reply,/does not meet|needs one of|Eligible alternative/);
 let explained=false;
 const api=deps(details({...d,knownFields:[],action:'recommend'}));
 api.structured=async(c,name)=>{if(name==='advisor_requirements')return details({...d,knownFields:[],action:'recommend'});explained=true;return {reply:'Your primary fibre connection supports backup connectivity. Installation is an estimate subject to availability.'};};
 const explanation=await runAdvisorFlow({},business,[{role:'user',content:'Explain the recommended package. Installation should be described only as an estimate.'}],data,previous,api);
 assert.equal(explained,true);assert.match(explanation.reply,/Installation is an estimate/);assert.doesNotMatch(explanation.reply,/does not meet|needs one of/);
});


test('a remembered incompatible 5G preference cannot trap later generic advice in a dependency warning',async()=>{
 const business=profile({...p,segment:'multi',employees:17,sites:2,budget:5000,needs:['internet','backup','email','pos','cctv']});
 const saved=details({internetPreference:'5g',needs:business.needs,cameraCount:1,knownFields:[...known,'cameraCount']});
 const previous={details:saved,items:[]};
 let explanationCalled=false;
 const api=deps(details({knownFields:['needs'],needs:['internet','email'],internetPreference:'5g',action:'discover'}));
 api.structured=async(c,name)=>{if(name==='advisor_requirements')return details({knownFields:['needs'],needs:['internet','email'],internetPreference:'5g',action:'discover'});explanationCalled=true;return {reply:'For reliable connectivity, consider business fibre and work email. Installation is an estimate.'};};
 const result=await runAdvisorFlow({},business,[{role:'user',content:'What services would you recommend for a small business that needs reliable internet and work email?'}],data,previous,api);
 assert.equal(result.intent,'question');assert.equal(result.proposedProfile,undefined);assert.equal(explanationCalled,true);assert.doesNotMatch(result.reply,/does not meet|needs one of/);
 assert.deepEqual(result.conversationState,previous);
 const explicit=await runAdvisorFlow({},business,[{role:'user',content:'I want 5G with failover'}],data,previous,deps(details({knownFields:[],internetPreference:'5g',cameraCount:1})));
 assert.equal(explicit.quote,null);assert.match(explicit.reply,/needs one of/);
});


test('open questions use the catalogue without changing selections or forcing discovery',async()=>{
 for(const previous of [{},{details:details({internetPreference:'5g'}),items:[{productId:'P04',quantity:2},{productId:'P09',quantity:2}]}]){
  for(const message of ['Explain all the best connectivity services for five people.','How does work email help a small business?','Compare fibre and 5G for a different office.']){
   let context;
   const api={checkedReply,redact,structured:async(c,name,schema,instructions,input)=>{
    if(name==='advisor_requirements')return details({intent:'question',employees:5,knownFields:['employees'],selectedProductIds:['P09']});
    assert.equal(name,'advisor_question');context=JSON.parse(input[0].content);
    return {reply:'Biz Fibre 100 provides business connectivity. Cloud Email & Collaboration supports work email. These are options to discuss, subject to confirming your needs.'};
   }};
   const result=await runAdvisorFlow({},p,[{role:'user',content:message}],data,previous,api);
   assert.equal(context.catalogue.length,25);assert.equal(result.intent,'question');assert.equal(result.proceed,false);
   assert.equal(result.proposedProfile,undefined);assert.equal(result.options,undefined);assert.deepEqual(result.conversationState,previous);
   assert.equal(context.questionScenario.employees,5);assert.doesNotMatch(result.reply,/does not meet|needs one of/);
  }
 }
});
test('question answers still reject invented prices',async()=>{
 const api={checkedReply,redact,structured:async(c,name)=>name==='advisor_requirements'?details({intent:'question'}):{reply:'This costs ₹999999.'}};
 await assert.rejects(runAdvisorFlow({},p,[{role:'user',content:'What is work email?'}],data,{},api),e=>e.code==='AI_QUOTE_MISMATCH');
});

test('unsupported question prices are repaired without reverting to the saved package',async()=>{
 const calls=[];
 const api={checkedReply,redact,structured:async(c,name)=>{calls.push(name);return name==='advisor_requirements'?details({intent:'question'}):{reply:name==='advisor_question'?'This costs ₹999999.':'Business fibre supports connectivity and work email provides team accounts.'};}};
 const r=await runAdvisorFlow({},p,[{role:'user',content:'Explain work email'}],data,{},api);
 assert.equal(r.intent,'question');assert.match(r.reply,/work email/);assert.deepEqual(calls,['advisor_requirements','advisor_question','advisor_question_repair']);
});

test('advisor hides internal selection text and unsupported product dependency claims',async()=>{
 const api={checkedReply,redact,structured:async(_config,name)=>name==='advisor_requirements'?details({intent:'question'}):{reply:'The selection list is empty. Cloud CCTV requires Static IP.'}};
 const result=await runAdvisorFlow({},p,[{role:'user',content:'Does Cloud CCTV require Static IP?'}],data,{},api);
 assert.doesNotMatch(result.reply,/selection list is empty|Static IP/i);
 assert.match(result.reply,/check product requirements directly against the catalogue/i);
});
