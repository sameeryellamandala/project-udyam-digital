import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readDocument} from '../src/kyc-reader.mjs';
import {validateKycFields} from '../src/kyc.mjs';
import {loadData,profile,gstFormat} from '../src/catalogue.mjs';
const data=loadData('YTL_TrackA_Udyam_Digital_Data');
test('K06 uses the certificate trade name without hiding independent identifier failures',async()=>{
 const row=await readDocument({kind:'gst',dataUrl:'data:image/png;base64,'+readFileSync('YTL_TrackA_Udyam_Digital_Data/kyc_documents/K06_gst_certificate.png').toString('base64')});assert.ok(row.fields.tradeName);assert.ok(row.fields.businessName!==row.fields.tradeName);
 const p=profile({businessName:row.fields.tradeName,segment:'micro',employees:5,sites:1,cityTier:1,budget:5000,needs:['internet']});
 const r=validateKycFields(data,p,{},[row]);assert.ok(!r.findings.some(f=>f.kind==='gst'&&f.code==='business_name_mismatch'));
 if(!gstFormat(row.fields.gstin))assert.ok(r.findings.some(f=>f.code==='invalid_registration_format'));
 assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(row.fields.registrationDate));
 const unrelated=validateKycFields(data,{...p,businessName:'Unrelated fictional company'},{},[row]);assert.ok(unrelated.findings.some(f=>f.code==='business_name_mismatch'));
});
test('a matching claimed trade name never replaces registry business-name verification',()=>{
 const reg=[...data.gst.values()].find(r=>r.status==='Active');const p=profile({businessName:reg.trade_name||reg.legal_name,segment:'micro',employees:5,sites:1,cityTier:1,budget:5000,needs:['internet'],gstin:reg.gstin});
 const row={kind:'gst',fields:{gstin:reg.gstin,businessName:'Unrelated legal identity',tradeName:p.businessName,readable:true},confidence:95,missingFields:[],extractionStatus:'extracted'};
 const r=validateKycFields(data,p,{},[row]);assert.equal(r.registry.gst.status,'matched');assert.ok(r.findings.some(f=>f.code==='business_name_mismatch'));
});
