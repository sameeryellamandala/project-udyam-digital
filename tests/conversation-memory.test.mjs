import test from 'node:test';
import assert from 'node:assert/strict';
import {blankProfile,freshMemory,mergeRequirements,publicRequirements} from '../src/conversation-memory.mjs';
import {conversationAdvisor} from '../src/conversation-advisor.mjs';
import {loadData,profile} from '../src/catalogue.mjs';
import {validatedPackages} from '../src/advisor-flow.mjs';
import {formRequirements} from '../src/journey.mjs';
const data=loadData('YTL_TrackA_Udyam_Digital_Data');
const apply=(state,text,extracted={knownFields:[]})=>{const r=mergeRequirements({...blankProfile('en'),...state.profile},extracted,state.details,text);return {...state,profile:r.profile,details:r.details};};
test('currency amount before monthly budget survives a later tier answer when extraction omits budget',()=>{
 let state=apply(freshMemory(),'I run a grocery store in Vijayawada. I have five employees, one location, no GSTIN and a ₹3,000 monthly budget. I need internet, three postpaid SIMs, one CCTV camera and Cloud POS.');
 assert.equal(publicRequirements(state).budget,3000);
 state=apply(state,'Tier2');
 const requirements=publicRequirements(state);
 assert.equal(requirements.budget,3000);
 assert.equal(requirements.city_tier,2);
 assert.equal(requirements.mobile_sim_count,3);
 assert.equal(requirements.camera_count,1);
 assert.deepEqual(requirements.requested_services.sort(),['cctv','internet','mobile','pos']);
});
test('memory adds counts, retains internet and staff, and never imports form defaults',()=>{
 let s=freshMemory();s=apply(s,'I need internet for five employees.');s=apply(s,'I also need three postpaid SIM connections.');
 let r=publicRequirements(s);assert.equal(r.employee_count,5);assert.equal(r.mobile_sim_count,3);assert.equal(r.site_count,null);assert.equal(r.budget,null);assert.deepEqual(r.requested_services.sort(),['internet','mobile']);assert.equal(r.mobile_plan_type,'postpaid');
 s=apply(s,'Add three more SIMs.');r=publicRequirements(s);assert.equal(r.mobile_sim_count,6);assert.equal(r.employee_count,5);
 s=apply(s,'Actually, make it ten employees.');assert.equal(publicRequirements(s).employee_count,10);
});
test('additional business locations increment the saved location count',()=>{
 let s=freshMemory();s=apply(s,'My business has two locations.');
 s=apply(s,'Add two more locations.');
 assert.equal(publicRequirements(s).site_count,4);
 s=apply(s,'Change that to three locations.');
 assert.equal(publicRequirements(s).site_count,3);
});
test('camera counts persist across turns and distinguish additions from a new total',()=>{
 let s=apply(freshMemory(),'I need internet and Cloud CCTV for 3 cameras.');
 assert.equal(publicRequirements(s).camera_count,3);
 s=apply(s,'Add two more cameras.');assert.equal(publicRequirements(s).camera_count,5);
 s=apply(s,'Change it to 4 cameras.');assert.equal(publicRequirements(s).camera_count,4);
 assert.deepEqual(publicRequirements(s).requested_services.sort(),['cctv','internet']);
 s=apply(s,'Remove CCTV. I only need internet.');assert.equal(publicRequirements(s).camera_count,null);assert.equal(publicRequirements(s).locations,null);
});
test('CCTV camera counts remain attached to named branches and price as one complete quantity',async()=>{
 let s=apply(freshMemory(),'I need internet and CCTV: 3 cameras in Vijayawada and 2 cameras in Guntur.');
 let r=publicRequirements(s);assert.equal(r.camera_count,5);assert.equal(r.site_count,2);assert.deepEqual(r.locations,[{name:'Vijayawada',camera_count:3},{name:'Guntur',camera_count:2}]);
 s=apply(s,'Add two more cameras in Guntur.');r=publicRequirements(s);assert.equal(r.camera_count,7);assert.deepEqual(r.locations.map(x=>x.camera_count),[3,4]);
 const business=profile({businessName:'Demo Shop',segment:'micro',employees:5,sites:2,cityTier:2,budget:5000,needs:['internet','cctv']});
 const packageResult=validatedPackages(business,{...s.details,selectedProductIds:[],action:'recommend'},data);
 assert.equal(packageResult.quote.items.find(x=>x.productId==='P23').quantity,7);
});
test('explicit removals and unknown budget stay distinct from missing updates',()=>{
 let s=apply(freshMemory(),'I need internet and CCTV.');s=apply(s,'Remove CCTV. I only need internet.');assert.deepEqual(publicRequirements(s).requested_services,['internet']);
 s=apply(s,'budget 3000',{knownFields:['budget'],budget:3000});s=apply(s,'Add email',{knownFields:[]});assert.equal(publicRequirements(s).budget,3000);
 s=apply(s,'Clear my budget');assert.equal(publicRequirements(s).budget,null);
 const other=apply(freshMemory(),'CCTV for a retail shop');assert.deepEqual(publicRequirements(other).requested_services,['cctv']);assert.equal(publicRequirements(other).employee_count,null);
});
test('guided memory asks for ambiguous edits and preserves state',async()=>{
 const first=await conversationAdvisor({},freshMemory(),[{role:'user',content:'I need internet for five employees and three postpaid SIM connections. I do not need anything else.'}],data);
 const r=publicRequirements(first.conversationState);assert.equal(r.employee_count,5);assert.equal(r.mobile_sim_count,3);assert.deepEqual(r.requested_services.sort(),['internet','mobile']);
 const ambiguous=await conversationAdvisor({},first.conversationState,[{role:'user',content:'Increase it.'}],data);assert.match(ambiguous.reply,/What would you like/);assert.deepEqual(ambiguous.conversationState,first.conversationState);
});
test('advisor answers order and KYC questions only from the current journey context',async()=>{
 const order=await conversationAdvisor({},freshMemory(),[{role:'user',content:'When will my installation be scheduled?'}],data,'en',{orders:[{status:'ready_for_scheduling',quote:{installDays:5},verification:{overallStatus:'checks_passed',issueCount:0}}],kyc:{overallStatus:'checks_passed',uploadedCount:4,requiredCount:4}});
 assert.match(order.reply,/provider confirmation/i);assert.match(order.reply,/not a booked appointment/i);assert.match(order.reply,/5 days/i);
 const kyc=await conversationAdvisor({},freshMemory(),[{role:'user',content:'Did my KYC checks pass?'}],data,'en',{orders:[],kyc:{overallStatus:'checks_passed',uploadedCount:4,requiredCount:4}});
 assert.match(kyc.reply,/checks passed/i);assert.match(kyc.reply,/does not authenticate/i);
 const other=await conversationAdvisor({},freshMemory(),[{role:'user',content:'What is my order status?'}],data,'en',{orders:[],kyc:null});
 assert.match(other.reply,/don’t see a saved order/i);
});

test('guided catalogue recommendations include only requested internet and SIM services',async()=>{
 const r=await conversationAdvisor({},freshMemory(),[{role:'user',content:'I run a retail shop with five employees at one location in tier 1, budget 6000. I need internet and three postpaid SIM connections. I do not need anything else.'}],data);
 const req=publicRequirements(r.conversationState);assert.deepEqual(req.requested_services.sort(),['internet','mobile']);assert.equal(req.site_count,1);assert.equal(req.employee_count,5);assert.equal(req.mobile_sim_count,3);
 assert.ok(r.options.length);for(const option of r.options)assert.ok(option.items.every(x=>['P01','P04','P07'].includes(x.productId)));
 assert.equal(r.options[0].items.find(x=>x.productId==='P07').quantity,3);
});
test('guided advisor retains the kirana scenario, exact SIM count, budget, city and no-GST status',async()=>{
 const r=await conversationAdvisor({},freshMemory(),[{role:'user',content:'I run a kirana shop in Vijayawada with 5 employees and one location, Tier 2. My monthly budget is ₹3,000. I have no GSTIN and need internet, 3 postpaid SIMs, CCTV for one camera and Cloud POS.'}],data);
 const req=publicRequirements(r.conversationState);
 assert.equal(req.business_type,'micro');assert.equal(req.business_location,'Vijayawada');assert.equal(req.employee_count,5);assert.equal(req.site_count,1);assert.equal(req.city_tier,2);assert.equal(req.budget,3000);assert.equal(req.gstin_status,'no');
 assert.equal(req.mobile_sim_count,3);assert.deepEqual(req.requested_services.sort(),['cctv','internet','mobile','pos']);
 assert.deepEqual(r.options[0].items.map(x=>[x.productId,x.quantity]).sort(),[['P01',1],['P07',3],['P19',1],['P23',1]]);
 assert.match(r.reply,/₹2,694–₹3,594/);assert.match(r.reply,/upper estimate is ₹594 over/);assert.match(r.reply,/₹4,300/);assert.doesNotMatch(r.reply,/Static IP|selection list is empty/i);
});
test('guided recommendation prices every explicitly requested CCTV camera',async()=>{
 const r=await conversationAdvisor({},freshMemory(),[{role:'user',content:'I run a shop in Vijayawada with 5 employees and one location, Tier 2, with a monthly budget of ₹5,000. I need internet and Cloud CCTV for 4 cameras.'}],data);
 const req=publicRequirements(r.conversationState),cctv=r.options[0].quote.items.find(x=>x.productId==='P23');
 assert.equal(req.camera_count,4);assert.equal(cctv.quantity,4);
 assert.equal(cctv.monthly,4*data.products.find(x=>x.id==='P23').price);
});
test('guided advisor asks for camera quantity when CCTV is requested without a count',async()=>{
 const r=await conversationAdvisor({},freshMemory(),[{role:'user',content:'I run a retail shop in Vijayawada with 5 employees and one location, Tier 2. My budget is ₹5,000. I need internet and CCTV.'}],data);
 assert.match(r.reply,/How many CCTV cameras/);assert.deepEqual(r.options,[]);assert.equal(publicRequirements(r.conversationState).camera_count,null);
});
test('short camera answers complete discovery and keep the other requirements',async()=>{
 for(const [language,answer]of [['en','4'],['en','four'],['hi','४']]){
  const state=formRequirements({businessName:'Synthetic Camera Shop',segment:'micro',employees:5,sites:1,cityTier:2,budget:3000,needs:['internet','cctv'],language});
  const first=await conversationAdvisor({},state,[{role:'user',content:'Please recommend my package.'}],data,language);
  const next=await conversationAdvisor({},first.conversationState,[{role:'user',content:answer}],data,language);
  const requirements=publicRequirements(next.conversationState);
  assert.equal(requirements.camera_count,4);assert.equal(requirements.employee_count,5);assert.equal(requirements.budget,3000);assert.deepEqual(requirements.requested_services.sort(),['cctv','internet']);
  assert.equal(next.options[0].quote.items.find(item=>item.productId==='P23').quantity,4);assert.equal(next.conversationState.awaitingQuestion,'');
  await assert.rejects(conversationAdvisor({},first.conversationState,[{role:'user',content:'0'}],data,language),/Camera count/);
 }
});
test('guided first reply summarizes all stated needs and asks only the missing location count',async()=>{
 const message='I run a small grocery store in Vijayawada. I have 5 employees and currently use a personal broadband connection. I don\'t have a GSTIN. I want reliable internet for daily billing, CCTV for security, Cloud POS for inventory management, and 3 postpaid SIM cards for my employees. My monthly budget is ₹3,000.';
 const r=await conversationAdvisor({},freshMemory(),[{role:'user',content:message}],data);
 const req=publicRequirements(r.conversationState);
 assert.equal(req.business_type,'micro');assert.equal(req.business_location,'Vijayawada');assert.equal(req.employee_count,5);assert.equal(req.gstin_status,'no');assert.equal(req.budget,3000);assert.equal(req.mobile_sim_count,3);
 assert.deepEqual(req.requested_services.sort(),['cctv','internet','mobile','pos']);
 for(const fact of ['grocery or retail store in Vijayawada with 5 employees','personal broadband connection','business internet','CCTV','Cloud POS','3 postpaid SIM cards','GST registration','₹3,000'])assert.match(r.reply,new RegExp(fact.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'));
 assert.match(r.reply,/How many business locations do you have\?/);assert.equal((r.reply.match(/\?/g)||[]).length,1);
});
