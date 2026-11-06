import test from 'node:test';
import assert from 'node:assert/strict';
import {loadData,profile,recommend,eligibility,gstFormat} from '../src/catalogue.mjs';
import {formRequirements,journeyRecommendation} from '../src/journey.mjs';

const data=loadData('YTL_TrackA_Udyam_Digital_Data');
const base={businessName:'Demo business',segment:'prof',employees:5,sites:1,cityTier:1,budget:10000,needs:['internet','email','security','whatsapp'],language:'en'};

test('blocked WhatsApp names only that service and preserves the complete requested list',()=>{
 const business=profile(base),result=recommend(business,data);
 assert.equal(result.quote,null);
 assert.deepEqual(result.coverage.requested,[...base.needs]);
 assert.equal(result.warnings.length,1);
 assert.match(result.warnings[0],/WhatsApp Business API Starter.*valid active GSTIN/i);
 assert.doesNotMatch(result.warnings.join(' '),/could not include (internet|email|security)/i);
 for(const id of ['P01','P16','P20'])assert.ok(result.eligibleProducts.some(p=>p.id===id));
});

test('shared journey returns each blocker once and does not drop requested services',()=>{
 const state=formRequirements(base),result=journeyRecommendation(state,data);
 assert.equal(result.warnings.length,1);
 assert.equal(new Set(result.warnings).size,result.warnings.length);
 assert.deepEqual(state.details.needs,profile(base).needs);
 assert.equal(result.quote,null);
});

test('Machine IoT reports actual catalogue restrictions for a small non-manufacturing business',()=>{
 const business=profile({...base,needs:['internet','email','iot']}),result=recommend(business,data);
 const product=data.products.find(p=>p.id==='P24');
 assert.equal(result.quote,null);
 assert.equal(result.warnings.length,1);
 for(const reason of eligibility(product,business,data))assert.ok(result.warnings[0].includes(reason));
 assert.match(result.warnings[0],/Machine Monitoring IoT/);
 assert.ok(result.eligibleProducts.some(p=>p.id==='P16'));
});

test('eligible WhatsApp and manufacturing IoT still produce complete backend priced packages',()=>{
 const gstin=[...data.gst].find(([id,row])=>row.status==='Active'&&gstFormat(id))[0];
 for(const scenario of [{...base,gstin},{...base,gstin,segment:'mfg',employees:10,needs:['internet','email','iot']}]){
  const business=profile(scenario),result=recommend(business,data);
  assert.ok(result.quote);
  assert.deepEqual(result.coverage.covered,result.coverage.requested);
  assert.deepEqual(result.warnings,[]);
  assert.ok(result.quote.items.some(item=>item.productId===(scenario.segment==='mfg'?'P24':'P15')));
  assert.equal(result.quote.checkoutMonthly,result.quote.items.reduce((sum,item)=>sum+item.monthly,0));
 }
});
