import test from 'node:test';
import assert from 'node:assert/strict';
import {createAdvisorTools} from '../src/advisor-tools.mjs';
import {loadData,profile} from '../src/catalogue.mjs';
import {runAdvisorGraph} from '../src/advisor-graph.mjs';
import {checkedReply,redact} from '../src/ai.mjs';

const data=loadData('YTL_TrackA_Udyam_Digital_Data');
const business=profile({businessName:'Demo Grocery',segment:'micro',employees:5,sites:2,cityTier:2,budget:3000,needs:['internet','mobile','cctv','pos'],language:'en'});

test('advisor tools source product search, dependency and pricing from the catalogue',()=>{
 const tools=createAdvisorTools(business,data);
 assert.ok(tools.search_products('Cloud CCTV').some(product=>product.id==='P23'));
 assert.deepEqual(tools.check_product_dependencies(['P23']),[{productId:'P23',satisfied:false,requiresOneOf:['P01','P02','P03','P04','P05','P06']}]);
 assert.equal(tools.check_product_dependencies(['P23','P01']).length,0);
 const result=tools.calculate_package_price([{productId:'P01',quantity:2},{productId:'P23',quantity:1},{productId:'P19',quantity:1}]);
 assert.equal(result.monthly,2796);
 assert.equal(result.monthlyMax,3596);
 assert.equal(tools.compare_budget(result,3000).minimumFits,true);
 assert.equal(tools.compare_budget(result,3000).maximumFits,false);
});

test('location availability does not claim street-level coverage from city-tier data',()=>{
 const result=createAdvisorTools(business,data).check_location_availability('Vijayawada');
 assert.equal(result.verified,false);
 assert.equal(result.status,'provider_confirmation_required');
});

test('LangGraph executes a complete advisor turn using authoritative catalogue calculations',async()=>{
 const details={intent:'requirements',segment:'micro',employees:5,sites:1,cityTier:2,budget:3000,needs:['internet','mobile','cctv','pos'],currentTools:'personal broadband',city:'Vijayawada',gstStatus:'no',cameraCount:1,knownFields:['segment','city','employees','sites','cityTier','budget','needs','gstStatus','cameraCount'],mobileLines:3,emailAccounts:0,internetPreference:'any',action:'recommend',selectedProductIds:[],mobilePlanType:'postpaid'};
 const api={redact,checkedReply,structured:async(_config,name)=>name==='advisor_requirements'?details:{reply:'I checked the eligible catalogue package.'}};
 const result=await runAdvisorGraph({config:{},business,data,messages:[{role:'user',content:'I want internet, 3 postpaid SIMs, CCTV and POS for my grocery store.'}],previous:{memoryVersion:2,details:{knownFields:[],needs:[]},items:[],offers:[]},api});
 assert.equal(result.quote.monthly,2694);
 assert.equal(result.quote.monthlyMax,3594);
 assert.deepEqual(result.quote.items.map(item=>[item.productId,item.quantity]).sort(),[['P01',1],['P07',3],['P19',1],['P23',1]]);
 assert.match(result.reply,/upper estimate is ₹594 over/i);
 assert.match(result.reply,/Vijayawada/);
});

test('LangGraph keeps prior SIM, budget, employee and location facts when new services are added',async()=>{
 const savedProfile=profile({...business,sites:1,needs:['internet','mobile'],budget:3000});
 const previous={memoryVersion:2,profile:savedProfile,details:{segment:'micro',city:'Vijayawada',employees:5,sites:1,cityTier:2,budget:3000,needs:['internet','mobile'],gstStatus:'no',mobileLines:3,mobilePlanType:'postpaid',internetPreference:'any',knownFields:['segment','city','employees','sites','cityTier','budget','needs','gstStatus','mobileLines']},postpaidConfirmed:true,items:[{productId:'P01',quantity:1},{productId:'P07',quantity:3}],offers:[]};
 const addition={intent:'requirements',segment:'prof',employees:1,sites:1,cityTier:1,budget:1,needs:['cctv','pos'],currentTools:'',city:'',gstStatus:'unknown',knownFields:['needs'],mobileLines:0,emailAccounts:0,internetPreference:'any',action:'change',selectedProductIds:[]};
 const api={redact,checkedReply,structured:async(_config,name)=>name==='advisor_requirements'?addition:{reply:'Updated package.'}};
 const result=await runAdvisorGraph({config:{},business:savedProfile,data,messages:[{role:'user',content:'Please add Cloud CCTV for one camera and Cloud POS to my existing requirements.'}],previous,api});
 assert.deepEqual(result.proposedProfile.needs.sort(),['cctv','internet','mobile','pos']);
 assert.equal(result.conversationState.details.city,'Vijayawada');assert.equal(result.conversationState.details.employees,5);assert.equal(result.conversationState.details.sites,1);assert.equal(result.conversationState.details.budget,3000);
 assert.equal(result.quote.items.find(item=>item.productId==='P07').quantity,3);
 assert.ok(result.quote.items.some(item=>item.productId==='P19'));assert.ok(result.quote.items.some(item=>item.productId==='P23'));
});
