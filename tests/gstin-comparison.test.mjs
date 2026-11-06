import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readDocument} from '../src/kyc-reader.mjs';
import {validateKycFields,mask,privateKyc} from '../src/kyc.mjs';
import {loadData,profile} from '../src/catalogue.mjs';
import {gstinComparison,normalizeOcrGstin,safeGstinDiagnostic} from '../src/registration.mjs';
const data=loadData('YTL_TrackA_Udyam_Digital_Data');

test('K07 real OCR corrects only the extra zero-shaped glyph and retains genuine mismatch checks',async()=>{
 const row=await readDocument({kind:'gst',dataUrl:'data:image/png;base64,'+readFileSync('YTL_TrackA_Udyam_Digital_Data/kyc_documents/K07_gst_certificate.png').toString('base64')});
 const expected=[...data.gst.keys()].find(id=>id.startsWith('07')&&id.endsWith('P1ZT'));
 assert.ok(row.fields.gstin===expected);assert.match(row.fields.gstinReadAdjustment,/review/);
 const registry=data.gst.get(expected),p=profile({businessName:registry.trade_name,segment:'prof',employees:11,sites:1,cityTier:1,budget:6000,needs:['internet'],gstin:expected});
 const result=validateKycFields(data,p,{},[row]);
 assert.ok(!result.findings.some(f=>['registration_number_mismatch','invalid_registration_format'].includes(f.code)));
 assert.equal(result.documents.find(d=>d.kind==='gst').reviewFields.gstin,mask(expected));
 const different=[...data.gst.keys()].find(id=>id!==expected);
 assert.ok(validateKycFields(data,{...p,gstin:different},{},[row]).findings.some(f=>f.code==='registration_number_mismatch'));
});

test('OCR repair leaves valid readings unchanged and refuses arbitrary extra characters',()=>{
 const id=[...data.gst.keys()].find(id=>id.startsWith('07')&&id.endsWith('P1ZT'));
 assert.equal(normalizeOcrGstin(id).adjusted,false);
 assert.ok(normalizeOcrGstin(id.replace('0','0O')).value===id);
 assert.equal(normalizeOcrGstin(id+'O').adjusted,false);
 assert.equal(normalizeOcrGstin(id.replace('0','0X')).adjusted,false);
});
test('K03 real OCR uses the checksum-valid printed value for comparison and masked display',async()=>{
 const entered='27XUIXG0767D1ZP';const row=await readDocument({kind:'gst',dataUrl:'data:image/png;base64,'+readFileSync('YTL_TrackA_Udyam_Digital_Data/kyc_documents/K03_gst_certificate.png').toString('base64')});
 assert.ok(row.fields.gstin===entered,'Actual specimen extraction must equal the printed identifier.');
 const registry=data.gst.get(entered);assert.ok(registry);assert.equal(registry.status,'Active');
 const p=profile({businessName:registry.legal_name,segment:'micro',employees:5,sites:1,cityTier:1,budget:5000,needs:['internet'],gstin:entered});
 const r=validateKycFields(data,{...p,gstin:'  '+entered.toLowerCase()+'  '},{},[row]);
 assert.ok(!r.findings.some(f=>f.kind==='gst'&&f.code==='registration_number_mismatch'));
 assert.equal(r.registry.gst.status,'matched');assert.ok(privateKyc(r).rows.find(d=>d.kind==='gst').fields.gstin===entered);
 assert.equal(r.documents.find(d=>d.kind==='gst').reviewFields.gstin,mask(entered));assert.ok(!JSON.stringify(r).includes(entered));
 const different=[...data.gst.keys()].find(id=>id!==entered);
 const mismatch=validateKycFields(data,{...p,gstin:different},{},[row]);assert.ok(mismatch.findings.some(f=>f.code==='registration_number_mismatch'));
 const nameMismatch=validateKycFields(data,{...p,businessName:'Unrelated fictional business'},{},[row]);assert.ok(nameMismatch.findings.some(f=>f.code==='business_name_mismatch'));
});
test('normalization does not invent valid mismatches; diagnostics never print complete identifiers',()=>{
 const id='27XUIXG0767D1ZP';assert.ok(gstinComparison(' '+id.toLowerCase()+' ',id).matches);
 const ambiguous=id.slice(0,7)+'O'+id.slice(8);assert.ok(normalizeOcrGstin(ambiguous).value===id);assert.ok(normalizeOcrGstin(ambiguous).adjusted);
 assert.equal(normalizeOcrGstin('not a registration').adjusted,false);
 const diagnostic=safeGstinDiagnostic(id,ambiguous);assert.ok(!JSON.stringify(diagnostic).includes(id));assert.ok(!JSON.stringify(diagnostic).includes(ambiguous));assert.deepEqual(diagnostic.differingPositions,[8]);
});

test('opt-in comparison diagnostics remain masked in production',t=>{
 const id='27XUIXG0767D1ZP',registry=data.gst.get(id),logs=[],previousDebug=process.env.KYC_DEBUG,previousMode=process.env.NODE_ENV;
 t.mock.method(console,'info',message=>logs.push(message));process.env.KYC_DEBUG='1';process.env.NODE_ENV='production';
 try{const p=profile({businessName:registry.legal_name,segment:'micro',employees:5,sites:1,cityTier:1,budget:5000,needs:['internet'],gstin:id});validateKycFields(data,p,{},[{kind:'gst',fields:{gstin:id,businessName:registry.legal_name,readable:true},extractionStatus:'extracted',confidence:95,missingFields:[]}]);assert.equal(logs.length,1);assert.ok(!logs[0].includes(id));assert.equal(JSON.parse(logs[0]).matches,true);}finally{if(previousDebug===undefined)delete process.env.KYC_DEBUG;else process.env.KYC_DEBUG=previousDebug;if(previousMode===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previousMode;}
});
