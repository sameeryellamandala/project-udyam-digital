import test from 'node:test';
import assert from 'node:assert/strict';
import {loadData,profile,quote,recommendForNeeds,quoteItems} from '../src/catalogue.mjs';
import {formRequirements} from '../src/journey.mjs';
import {mergeRequirements,publicRequirements,freshMemory} from '../src/conversation-memory.mjs';
import {conversationAdvisor} from '../src/conversation-advisor.mjs';
import {missingLocationQuestion} from '../src/locations.mjs';

const data=loadData('YTL_TrackA_Udyam_Digital_Data');
const active=[...data.gst.values()].find(record=>record.status==='Active');
const input={businessName:'Synthetic Branch Shop',segment:'micro',employees:10,sites:2,cityTier:1,budget:20000,
 needs:['internet','mobile','cctv'],gstin:active.gstin,
 locations:[{id:'north',name:'North branch',city:'Synthetic City A',cityTier:1,cameraCount:4},
 {id:'south',name:'South branch',city:'Synthetic City B',cityTier:2,cameraCount:3}]};
const business=()=>profile(input);
const items=[{productId:'P03',quantity:1,locationId:'north'},{productId:'P01',quantity:1,locationId:'south'},
 {productId:'P23',quantity:4,locationId:'north'},{productId:'P23',quantity:3,locationId:'south'},
 {productId:'P07',quantity:3}];

test('mixed tiers price each branch and count shared SIMs once',()=>{
 const result=quote(business(),items,data);
 assert.equal(result.monthly,7288);assert.equal(result.setup,12600);assert.equal(result.sharedMonthly,897);
 assert.deepEqual(result.locationTotals.map(location=>location.monthly),[4795,1596]);
 assert.equal(result.monthly,result.locationTotals.reduce((sum,location)=>sum+location.monthly,0)+result.sharedMonthly);
 assert.equal(result.items.find(item=>item.productId==='P03').cityTier,1);
 assert.deepEqual(quoteItems(result.items),items);
});

test('backend rejects unavailable products, unknown scopes and dependencies on another branch',()=>{
 assert.throws(()=>quote(business(),[{productId:'P03',quantity:1,locationId:'south'}],data),error=>error.code==='INELIGIBLE_PRODUCT');
 assert.throws(()=>quote(business(),[{productId:'P01',quantity:1,locationId:'unknown'}],data),error=>error.code==='INVALID_LOCATION');
 assert.throws(()=>quote(business(),[{productId:'P01',quantity:1,locationId:'north'},{productId:'P23',quantity:3,locationId:'south'}],data),error=>error.code==='MISSING_DEPENDENCY');
 assert.throws(()=>quote(business(),[{productId:'P01',quantity:2,locationId:'north'}],data));
 assert.throws(()=>quote(business(),[items[0],items[0]],data));
 const auto=quote(business(),[{productId:'P01',quantity:2},{productId:'P23',quantity:7}],data);
 assert.deepEqual(auto.items.filter(item=>item.productId==='P23').map(item=>item.quantity),[4,3]);
});

test('recommendations retain every branch, exact camera counts and one shared mobile quantity',()=>{
 const result=recommendForNeeds(business(),data,{mobileLines:6,cameraCount:7});
 assert.ok(result.quote);
 const mobile=result.quote.items.filter(item=>item.productId==='P07');
 assert.equal(mobile.length,1);assert.equal(mobile[0].quantity,6);
 assert.equal(result.quote.items.filter(item=>item.productId==='P23').reduce((sum,item)=>sum+item.quantity,0),7);
 assert.deepEqual(new Set(result.quote.items.filter(item=>item.unit==='per site').map(item=>item.locationId)),new Set(['north','south']));
 for(const item of result.quote.items){const location=business().locations.find(location=>location.id===item.locationId);if(location)assert.ok(data.products.find(product=>product.id===item.productId).tiers.includes(location.cityTier));}
});

test('missing branch tier or camera split blocks complete pricing and asks for that branch',()=>{
 const incomplete=profile({...input,locations:input.locations.map(location=>({...location,cityTier:location.id==='south'?null:1}))});
 assert.equal(recommendForNeeds(incomplete,data).quote,null);
 assert.match(missingLocationQuestion(incomplete),/South branch/);
 assert.throws(()=>quote(incomplete,items,data),error=>error.code==='INCOMPLETE_LOCATIONS');
 const cameras=profile({...input,locations:input.locations.map(location=>({...location,cameraCount:location.id==='south'?null:4}))});
 assert.equal(recommendForNeeds(cameras,data).quote,null);assert.match(missingLocationQuestion(cameras),/South branch/);
 assert.throws(()=>profile({...input,locations:[input.locations[0]]}));
});

test('a branch edit preserves the other branch and removing CCTV preserves location tiers',()=>{
 let state=formRequirements(input);
 const apply=message=>{const result=mergeRequirements({...state.profile,businessName:state.form.businessName},{knownFields:[]},state.details,message);state={...state,profile:result.profile,details:result.details};};
 apply('Change South branch to Tier 1.');
 assert.deepEqual(state.profile.locations.map(location=>location.cityTier),[1,1]);
 apply('Add two more cameras in South branch.');
 assert.deepEqual(state.profile.locations.map(location=>location.cameraCount),[4,5]);
 assert.equal(publicRequirements(state).camera_count,9);assert.equal(publicRequirements(state).budget,20000);
 apply('Remove CCTV.');
 assert.deepEqual(state.profile.locations.map(location=>location.cityTier),[1,1]);
 assert.deepEqual(state.profile.locations.map(location=>location.cameraCount),[null,null]);
 assert.ok(!publicRequirements(state).requested_services.includes('cctv'));
});

test('four cameras at each of two branches becomes eight cameras with mixed tier memory',async()=>{
 const result=await conversationAdvisor({},freshMemory(),[{role:'user',content:'I run a shop in Vijayawada with 10 employees and two locations. Branch 1 is Tier 1; Branch 2 is Tier 2. I need internet, three postpaid SIMs and four cameras at each branch. No GSTIN. My budget is ₹9000.'}],data);
 const requirements=publicRequirements(result.conversationState);
 assert.equal(requirements.camera_count,8);
 assert.deepEqual(requirements.locations.map(location=>location.city_tier),[1,2]);
 assert.deepEqual(requirements.locations.map(location=>location.camera_count),[4,4]);
 assert.ok(result.options.length);assert.equal(result.options[0].quote.monthly,4487);
});

test('legacy homogeneous quotes retain their original aggregate quantities',()=>{
 const legacy=profile({...input,locations:undefined,needs:['internet']});
 const result=quote(legacy,[{productId:'P01',quantity:2}],data);
 assert.equal(result.items.length,1);assert.equal(result.items[0].quantity,2);
 assert.equal(result.locationTotals,undefined);
});
