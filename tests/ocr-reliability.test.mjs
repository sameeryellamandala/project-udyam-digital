import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readDocument} from '../src/kyc-reader.mjs';
import {loadData,profile} from '../src/catalogue.mjs';
import {validateKycFields} from '../src/kyc.mjs';
const data=loadData('YTL_TrackA_Udyam_Digital_Data');
for(const [sample,suffix] of [['K02','Y1ZL'],['K08','M1Z3']])test(sample+' actual scan recovers its printed GSTIN and preserves independent checks',async()=>{
 const row=await readDocument({kind:'gst',dataUrl:'data:image/png;base64,'+readFileSync('YTL_TrackA_Udyam_Digital_Data/kyc_documents/'+sample+'_gst_certificate.png').toString('base64')});
 const expected=[...data.gst.keys()].find(id=>id.endsWith(suffix)&&id.startsWith(sample==='K02'?'19':'24'));
 assert.ok(expected&&row.fields.gstin===expected,'Printed identifier must be extracted correctly');
 assert.ok(row.fields.businessName&&row.fields.tradeName);
 const p=profile({businessName:data.gst.get(expected).trade_name,employees:5,sites:1,cityTier:1,budget:5000,segment:'prof',needs:['internet'],gstin:expected});
 const result=validateKycFields(data,p,{},[row]);
 assert.ok(!result.findings.some(f=>['invalid_registration_format','invalid_checksum','registration_number_mismatch'].includes(f.code)));
});
test('uncertain OCR readings require review and cannot grant GST eligibility',()=>{
 const id=[...data.gst.keys()].find(id=>data.gst.get(id).status==='Active');
 const p=profile({businessName:data.gst.get(id).trade_name,employees:5,sites:1,cityTier:1,budget:5000,segment:'prof',needs:['internet'],gstin:id});
 const row={kind:'gst',method:'local_ocr',confidence:94,extractionStatus:'partially_extracted',fields:{gstin:'UNREADABLE',businessName:p.businessName,gstinReadUncertain:'Uncertain reading'},missingFields:[]};
 const r=validateKycFields(data,p,{},[row]);
 assert.ok(r.findings.some(f=>f.code==='registration_read_uncertain'&&f.severity==='review'));
 assert.ok(!r.findings.some(f=>['invalid_registration_format','invalid_checksum','registration_number_mismatch'].includes(f.code)));
 assert.notEqual(r.status,'passed');
});
