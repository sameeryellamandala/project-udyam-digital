import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {extractLocal,imageSize} from '../src/ocr.mjs';
import {loadData,profile} from '../src/catalogue.mjs';
import {verify} from '../src/kyc.mjs';

const image=(id,kind,suffix)=>({kind,dataUrl:'data:image/png;base64,'+readFileSync(`YTL_TrackA_Udyam_Digital_Data/kyc_documents/${id}_${suffix}.png`).toString('base64')});
test('actual supplied images match their fields but a cancelled GST still requires review',async()=>{
  const docs=[image('K01','gst','gst_certificate'),image('K01','address','address_proof'),image('K01','signatory','signatory_id')];
  const read=await extractLocal(docs),data=loadData('YTL_TrackA_Udyam_Digital_Data');
  const gst=data.gst.get(read.find(r=>r.kind==='gst').fields.gstin);
  assert.ok(gst,'OCR GST must match a supplied registry record');assert.ok(read.every(r=>r.fields.readable),'All clean sample fields should be readable');
  assert.ok(read.find(r=>r.kind==='signatory').fields.signatoryName==='Neha Kaur','Known synthetic signatory should be extracted correctly');
  const p=profile({businessName:gst.trade_name,segment:'prof',employees:5,sites:1,cityTier:1,budget:3000,needs:['internet'],gstin:gst.gstin});
  const result=await verify(data,{},p,{consent:true,extractionMethod:'local',documents:docs,contactName:'Neha Kaur'});
  assert.equal(result.extractionMode,'local');assert.equal(result.status,'review_required');assert.equal(result.documents.length,3);
  assert.ok(result.documents.every(d=>d.status==='matched'));assert.ok(result.issues.includes('GST registration is not active.'));
  assert.ok(!JSON.stringify(result).includes(gst.gstin),'Raw identifiers must not escape in verification results');
});
test('image dimensions are bounded before OCR and external processing requires explicit consent',async()=>{
  const b=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(b);b.writeUInt32BE(999999,16);b.writeUInt32BE(999999,20);
  assert.equal(imageSize(b).width,999999);
  const data=loadData('YTL_TrackA_Udyam_Digital_Data');const p=profile({businessName:'Demo',segment:'micro',employees:1,sites:1,cityTier:1,budget:3000,needs:['internet']});
  await assert.rejects(verify(data,{},p,{consent:true,documents:[{kind:'gst',dataUrl:'data:image/png;base64,'+b.toString('base64')}]}),/megapixels/);
  await assert.rejects(verify(data,{},p,{consent:true,extractionMethod:'ai',aiConsent:false,documents:[]}),/separate consent/);
});
