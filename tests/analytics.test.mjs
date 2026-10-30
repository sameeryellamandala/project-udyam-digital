import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {csv} from '../src/catalogue.mjs';
import {analyzeLeads} from '../src/analytics.mjs';

test('aggregate evidence matches the supplied funnel without exporting customer records',()=>{
  const rows=csv(readFileSync('YTL_TrackA_Udyam_Digital_Data/smb_leads.csv','utf8')),r=analyzeLeads(rows);
  assert.equal(r.overall.leads,5000);assert.equal(r.overall.activated,368);assert.equal(r.overall.conversionPct,7.36);
  assert.deepEqual(r.funnel.map(x=>x.count),[5000,3406,1974,861,588,368]);
  assert.equal(Object.values(r.segments).reduce((sum,s)=>sum+s.leads,0),5000);
  assert.equal(Object.values(r.segments).reduce((sum,s)=>sum+s.activated,0),368);
  const serialized=JSON.stringify(r);
  for(const key of ['business_name','contact_name','gstin','udyam_number','lead_id'])assert.ok(!serialized.includes('"'+key+'"'));
  assert.ok(!serialized.includes(rows[0].business_name));
});
