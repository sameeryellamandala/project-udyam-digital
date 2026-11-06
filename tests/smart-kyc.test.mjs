import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {imagePdf,textPdf} from './helpers/pdf-fixtures.mjs';
import {readDocuments,readDocument} from '../src/kyc-reader.mjs';
import {prepareDocuments} from '../src/pdf.mjs';
import {validateKycFields,verify,privateKyc} from '../src/kyc.mjs';
import {loadData,profile,gstFormat} from '../src/catalogue.mjs';
const data=loadData('YTL_TrackA_Udyam_Digital_Data'),gst=[...data.gst.values()].find(r=>r.status==='Active'),udyam=[...data.udyam.values()][0];
const p=profile({businessName:gst.legal_name,segment:'micro',employees:5,sites:1,cityTier:1,budget:5000,needs:['internet']});
const row=(kind,fields)=>({kind,fields:{...fields,readable:true},confidence:95,method:'local_ocr',missingFields:[],extractionStatus:'extracted',conflicts:[]});
const proof=()=>[row('address',{businessName:p.businessName,address:gst.principal_place_of_business,documentDate:'2026-07-01'}),row('signatory',{signatoryName:'Synthetic Signatory',businessName:p.businessName,validTill:'2030-01-01'})];
const body={contactName:'Synthetic Signatory',contact:{address:gst.principal_place_of_business}};
test('actual specimen PDF rasterization survives the pixel limit and isolates another invalid PDF',async()=>{
 const source=readFileSync('YTL_TrackA_Udyam_Digital_Data/kyc_documents/K01_gst_certificate.png'),pdf=await imagePdf(source);
 const results=await readDocuments([{kind:'gst',dataUrl:'data:application/pdf;base64,'+pdf.toString('base64')},{kind:'address',dataUrl:'data:application/pdf;base64,'+Buffer.from('%PDF-broken document').toString('base64')}],'local',{});
 assert.ok(results[0].fields?.gstin);assert.equal(results[0].extractionStatus,'extracted');assert.equal(results[1].extractionStatus,'extraction_failed');assert.ok(results[1].errorCode);
 const pages=await prepareDocuments([{kind:'gst',dataUrl:'data:application/pdf;base64,'+(await imagePdf(source,3)).toString('base64')},{kind:'udyam',dataUrl:'data:application/pdf;base64,'+(await imagePdf(source,2)).toString('base64')}]);assert.equal(pages.length,5);
});
test('text PDF extraction and JPEG OCR read document contents without filename-based rules',async()=>{
 const result=await readDocument({kind:'gst',dataUrl:'data:application/pdf;base64,'+textPdf(['GSTIN: '+gst.gstin,'Legal name: '+gst.legal_name,'Trade name: '+gst.trade_name,'Registration status: Active']).toString('base64')});
 assert.ok(result.fields.gstin===gst.gstin);assert.ok(result.fields.businessName===gst.legal_name);assert.equal(result.method,'pdf_text');assert.equal(result.confidence,null);
 const image=await loadImage(readFileSync('YTL_TrackA_Udyam_Digital_Data/kyc_documents/K01_gst_certificate.png')),canvas=createCanvas(image.width,image.height);canvas.getContext('2d').drawImage(image,0,0);
 const jpeg=await readDocument({kind:'gst',dataUrl:'data:image/jpeg;base64,'+canvas.toBuffer('image/jpeg').toString('base64')});assert.ok(jpeg.fields.gstin);assert.ok(Number.isFinite(jpeg.confidence));
});
test('customers without either registry can pass required evidence; uploaded registration numbers are auto-extracted',()=>{
 const noRegistry=validateKycFields(data,p,body,proof());assert.equal(noRegistry.status,'passed');assert.equal(noRegistry.documents.find(d=>d.kind==='udyam').status,'not_required');
 const uProfile=profile({...p,businessName:udyam.enterprise_name});const uRows=proof().map(r=>({...r,fields:{...r.fields,businessName:uProfile.businessName}}));const uResult=validateKycFields(data,uProfile,body,[...uRows,row('udyam',{udyam:udyam.udyam_number,businessName:udyam.enterprise_name})]);assert.equal(uResult.status,'passed');assert.ok(udyam.udyam_number.includes('-00-'));
 const auto=validateKycFields(data,p,body,[...proof(),row('gst',{gstin:gst.gstin,businessName:gst.legal_name,registrationStatus:'Active'})]);assert.equal(auto.status,'passed');assert.equal(auto.registry.gst.status,'matched');assert.ok(privateKyc(auto).effectiveGst===gst.gstin);assert.ok(!JSON.stringify(auto).includes(gst.gstin));
});
test('specific registration, date, name, address and missing-document rules are deterministic',()=>{
 const candidate=gst.gstin.slice(0,14),wrongCheck='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').find(c=>!gstFormat(candidate+c));
 let r=validateKycFields(data,p,body,[...proof(),row('gst',{gstin:candidate+wrongCheck,businessName:p.businessName})]);assert.ok(r.findings.some(f=>f.code==='invalid_checksum'||f.code==='invalid_registration_format'));
 let rFormat=validateKycFields(data,p,body,[...proof(),row('gst',{gstin:'INVALID_GST_FORMAT',businessName:p.businessName})]);assert.ok(rFormat.findings.some(f=>f.code==='invalid_registration_format'));
 let absent;for(let n=0;n<100&&!absent;n++){const base='99AAXXA'+String(n).padStart(4,'0')+'A1Z';for(const c of '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ')if(gstFormat(base+c)&&!data.gst.has(base+c)){absent=base+c;break;}}
 assert.ok(absent);r=validateKycFields(data,p,body,[...proof(),row('gst',{gstin:absent,businessName:p.businessName})]);assert.ok(r.findings.some(f=>f.code==='registration_not_found'));
 r=validateKycFields(data,p,body,[...proof(),row('gst',{gstin:gst.gstin,businessName:'A different fictional business'})]);assert.ok(r.findings.some(f=>f.code==='business_name_mismatch'));
 const address=proof();address[0].fields.documentDate='2026-01-01';address[1].fields.signatoryName='Another Signatory';r=validateKycFields(data,p,body,address);assert.ok(r.findings.some(f=>f.code==='document_expired_or_outdated'));assert.ok(r.findings.some(f=>f.code==='name_mismatch'));
 r=validateKycFields(data,p,body,[row('udyam',{udyam:'UDYAM-ZZ-00-9999999',businessName:p.businessName})]);assert.ok(r.findings.some(f=>f.code==='registration_not_found'));assert.ok(r.findings.some(f=>f.code==='missing_document'));
 const near=proof();near[1].fields.signatoryName='Synthetic Signator';r=validateKycFields(data,p,body,near);assert.ok(r.findings.some(f=>f.code==='name_match_uncertain'&&f.severity==='review'));
 r=validateKycFields(data,p,body,[...proof(),row('udyam',{businessName:p.businessName,udyam:''})]);assert.ok(r.findings.some(f=>f.kind==='udyam'&&f.code==='not_extracted'));
 const mismatch=proof();mismatch[0].fields.address='Different installation site';r=validateKycFields(data,p,body,mismatch);assert.ok(r.findings.some(f=>f.code==='address_mismatch'));
});

test('cross-registration name mismatches appear on the affected document card',()=>{
 const otherRegistration={...udyam,enterprise_name:'Different Registered Enterprise'};
 const reference={...data,udyam:new Map([[otherRegistration.udyam_number,otherRegistration]])};
 const result=validateKycFields(reference,p,body,[...proof(),row('gst',{gstin:gst.gstin,businessName:gst.legal_name}),row('udyam',{udyam:otherRegistration.udyam_number,businessName:otherRegistration.enterprise_name})]);
 const document=result.documents.find(d=>d.kind==='udyam');
 assert.ok(document.findings.some(f=>f.code==='cross_document_mismatch'));
 assert.equal(document.status,'mismatch_detected');
 assert.equal(result.overallStatus,'action_required');
 assert.ok(!result.checks.some(check=>check==='udyam: extracted fields match the submitted details.'));
});

test('a supplied Udyam specimen with different registry fields remains actionable',async()=>{
 const extracted=await readDocument({kind:'udyam',dataUrl:'data:image/png;base64,'+readFileSync('YTL_TrackA_Udyam_Digital_Data/kyc_documents/K12_udyam_certificate.png').toString('base64')});
 const fields=extracted.fields,record=data.udyam.get(fields.udyam);
 assert.ok(record);
 assert.ok(fields.rawText.includes(fields.registrationDate));
 assert.ok(!fields.rawText.includes(record.date_of_registration));
 const result=validateKycFields(data,profile({...p,businessName:record.enterprise_name}),body,[extracted]);
 assert.ok(result.documents.find(d=>d.kind==='udyam').findings.some(f=>f.code==='udyam_date_mismatch'));
});
