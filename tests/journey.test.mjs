import test from 'node:test';
import assert from 'node:assert/strict';
import {formRequirements,journeyProfile,journeyRecommendation,journeyView} from '../src/journey.mjs';
import {mergeRequirements} from '../src/conversation-memory.mjs';
import {conversationAdvisor} from '../src/conversation-advisor.mjs';
import {loadData} from '../src/catalogue.mjs';
const data=loadData('YTL_TrackA_Udyam_Digital_Data');
const p={businessName:'Synthetic Retail',segment:'micro',employees:5,sites:2,cityTier:1,budget:5000,cameraCount:1,needs:['internet','mobile','email','backup','pos','cctv'],currentTools:'Card terminal'};
test('form confirms its fields and chat changes retain the shared form state',async()=>{
 const initial=formRequirements(p);assert.equal(journeyView(initial,0).requirements.business_name,p.businessName);assert.equal(journeyProfile(initial).sites,2);assert.equal(journeyView(initial,0).requirements.camera_count,1);
 const changed=await conversationAdvisor({},initial,[{role:'user',content:"I don't need CCTV anymore. Also, increase my budget to ₹7,000."}],data);
 const next=changed.conversationState,view=journeyView(next,1,data);
 assert.equal(view.requirements.business_name,p.businessName);assert.equal(view.requirements.budget,7000);assert.equal(view.requirements.site_count,2);assert.equal(view.requirements.employee_count,5);assert.equal(view.requirements.current_tools,p.currentTools);
 assert.deepEqual(view.requirements.requested_services.sort(),['backup','email','internet','mobile','pos']);assert.ok(!view.recommendation.quote.items.some(x=>x.productId==='P23'));
});
test('a form cannot get a CCTV quote until the camera quantity is known',()=>{
 const state=formRequirements({...p,cameraCount:undefined});const view=journeyView(state,0,data);
 assert.equal(view.recommendation.quote,null);assert.match(view.recommendation.warnings.join(' '),/how many cameras/i);
});
test('missing/null extraction fields do not replace confirmed form fields',()=>{
 const state=formRequirements(p);
 const merged=mergeRequirements(journeyProfile(state),{knownFields:[],employees:null,sites:null,budget:null,needs:null,currentTools:null},state.details,'okay');
 assert.equal(merged.profile.employees,5);assert.equal(merged.profile.sites,2);assert.equal(merged.profile.budget,5000);assert.deepEqual(merged.profile.needs,p.needs.slice().sort());assert.equal(merged.profile.currentTools,p.currentTools);
});
test('resubmitting a form preserves chat-specific SIM counts while explicit removals clear them',async()=>{
 const changed=await conversationAdvisor({},formRequirements(p),[{role:'user',content:'I need three postpaid SIM connections.'}],data);
 const retained=formRequirements({...p,budget:7000},changed.conversationState);assert.equal(retained.details.mobileLines,3);assert.equal(retained.details.mobilePlanType,'postpaid');
 const removed=formRequirements({...p,needs:['internet']},retained);assert.equal(removed.details.mobileLines,0);assert.deepEqual(removed.details.needs,['internet']);
 const r=journeyRecommendation(retained,data);assert.equal(r.quote.items.find(x=>x.productId==='P07').quantity,3);
});
