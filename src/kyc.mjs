import {normalizeRegistration,gstinComparison,safeGstinDiagnostic} from './registration.mjs';
import {readDocuments,needed} from './kyc-reader.mjs';
import { AppError, gstFormat } from './catalogue.mjs';
import { imageSize } from './ocr.mjs';
export const REFERENCE_DATE = '2026-07-15';
export const mask = value => value ? '*'.repeat(Math.max(0, value.length - 4)) + value.slice(-4) : '';
const normalized = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const same = (a, b) => normalized(a) && normalized(a) === normalized(b);
export function documentIssues(kind, fields, p, gst, udyam, contact) {
  const issues = [];
  if (!fields?.readable) return [`${kind}: the document needs a clearer image or manual review.`];
  const legalName = gst?.legal_name || udyam?.enterprise_name || p.businessName;
  const matchesBusiness = value => [legalName, gst?.trade_name, udyam?.enterprise_name].filter(Boolean).some(name => same(value, name));
  if (kind === 'gst') {
    if (!gstinComparison(p.gstin,fields.gstin).matches) issues.push('gst: certificate ID does not match the submitted GSTIN.');
    if (!matchesBusiness(fields.businessName)) issues.push('gst: business name needs review.');
  }
  if (kind === 'udyam') {
    if (!fields.udyam || fields.udyam !== p.udyam) issues.push('udyam: certificate ID does not match the submitted registration.');
    if (!matchesBusiness(fields.businessName)) issues.push('udyam: business name needs review.');
  }
  if (kind === 'address') {
    if (!matchesBusiness(fields.businessName)) issues.push('address: business name needs review.');
    if (!fields.address || !gst?.principal_place_of_business || !same(fields.address, gst.principal_place_of_business)) issues.push('address: address cannot be matched to the registry; manual review needed.');
    const date = /^\d{4}-\d{2}-\d{2}$/.test(fields.documentDate || '') ? new Date(fields.documentDate + 'T00:00:00Z') : null;
    if (!date || !Number.isFinite(+date) || date.toISOString().slice(0, 10) !== fields.documentDate) issues.push('address: a valid issue date is required.');
    else { const age = (Date.parse(REFERENCE_DATE) - +date) / 86400000; if (age < 0 || age > 90) issues.push('address: proof must be dated within the 90 days up to 2026-07-15.'); }
  }
  if (kind === 'signatory') {
    if (!same(fields.signatoryName, contact)) issues.push('signatory: name needs manual confirmation against the order contact.');
    if (!matchesBusiness(fields.businessName)) issues.push('signatory: business name needs review.');
    const expiry = /^\d{4}-\d{2}-\d{2}$/.test(fields.validTill || '') ? new Date(fields.validTill + 'T00:00:00Z') : null;
    if (!expiry || !Number.isFinite(+expiry) || expiry.toISOString().slice(0,10) !== fields.validTill) issues.push('signatory: a valid expiry date is required.');
    else if (fields.validTill < REFERENCE_DATE) issues.push('signatory: ID is expired at the exercise reference date.');
  }
  return issues;
}

export function validateDocuments(documents) {
  if (!Array.isArray(documents) || documents.length > 4) throw new AppError('Upload at most four documents.');
  const kinds = new Set();
  for (const doc of documents) {
    if (!doc || !['gst', 'udyam', 'address', 'signatory'].includes(doc.kind) || kinds.has(doc.kind)) throw new AppError('Invalid or duplicate document category.');
    kinds.add(doc.kind);
    if(doc.name!==undefined&&(typeof doc.name!=='string'||doc.name.length>255))throw new AppError('Document name is invalid.');
    if (typeof doc.dataUrl !== 'string') throw new AppError('Choose a JPEG, PNG, or PDF document.');
    const match = /^data:(image\/(?:png|jpeg)|application\/pdf);base64,([A-Za-z0-9+/]+={0,2})$/.exec(doc.dataUrl);
    if (!match || match[2].length % 4) throw new AppError('Only JPEG, PNG, and PDF documents are accepted.');
    const bytes = Buffer.from(match[2], 'base64');
    if (bytes.length > 2 * 1024 * 1024) throw new AppError('Each document must be at most 2 MB.', 413);
    if (bytes.toString('base64') !== match[2]) throw new AppError('Document encoding is invalid.');
    if (match[1] === 'application/pdf') {
      if (bytes.length < 8 || bytes.subarray(0, 5).toString() !== '%PDF-') throw new AppError('PDF contents do not match the declared type.');
    } else {
      const valid = match[1] === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
      if (!valid) throw new AppError('Image contents do not match the declared type.');
      const { width, height } = imageSize(bytes);
      if (width < 100 || height < 100 || width * height > 12000000) throw new AppError('Use an image between 100 pixels and 12 megapixels.');
    }
  }
  return documents;
}

export const KYC_PRIVATE=Symbol('kyc-private');
export const privateKyc=result=>result[KYC_PRIVATE];
const validDate=value=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return null;const n=Date.parse(value+'T00:00:00Z');return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===value?n:null;};
function near(a,b){const x=normalized(a),y=normalized(b);if(!x||!y)return false;let row=Array.from({length:y.length+1},(_,i)=>i);for(let i=1;i<=x.length;i++){const next=[i];for(let j=1;j<=y.length;j++)next[j]=Math.min(next[j-1]+1,row[j]+1,row[j-1]+(x[i-1]===y[j-1]?0:1));row=next;}return row[y.length]<=Math.max(1,Math.floor(Math.max(x.length,y.length)*.08));}
export function validateKycFields(data,p,body,rows){
 p={...p,gstin:normalizeRegistration(p.gstin),udyam:normalizeRegistration(p.udyam)};
 rows=rows.map(r=>({...r,fields:r.fields?{...r.fields,gstin:normalizeRegistration(r.fields.gstin),udyam:normalizeRegistration(r.fields.udyam)}:null}));
 if(process.env.KYC_DEBUG==='1')console.info(JSON.stringify({...safeGstinDiagnostic(p.gstin,rows.find(r=>r.kind==='gst')?.fields?.gstin),ocrAdjusted:!!rows.find(r=>r.kind==='gst')?.fields?.gstinReadAdjustment}));
 const findings=[],checks=[],documents=[];
 const add=(kind,code,message,action,severity='error')=>{const f={kind,code,message,action,severity};findings.push(f);return f;};
 const field=kind=>rows.find(r=>r.kind===kind)?.fields;
 const extractedGst=field('gst')?.gstin||'',extractedUdyam=field('udyam')?.udyam||'';
 const effectiveGst=p.gstin||extractedGst,effectiveUdyam=p.udyam||extractedUdyam;
 const gst=data.gst.get(effectiveGst),udyam=data.udyam.get(effectiveUdyam);
 const registry={gst:{status:'not_provided'},udyam:{status:'not_provided'}};
 const names=[p.businessName,gst?.legal_name,gst?.trade_name,udyam?.enterprise_name].filter(Boolean);
 const businessMatch=name=>names.some(n=>same(name,n));
 const compareName=(kind,value,expected,label)=>{
  if(!value){add(kind,'not_extracted',label+' could not be extracted.','Upload a clearer document.');return;}
  if(expected.some(n=>same(value,n)))return;
  const uncertain=expected.some(n=>near(value,n));
  add(kind,uncertain?'name_match_uncertain':label==='Signatory name'?'name_mismatch':'business_name_mismatch',label+(uncertain?' has a small spelling difference and needs confirmation.':' does not match the submitted or registry information.'),uncertain?'Check the spelling or request simulated reviewer confirmation.':'Correct the entered details or replace the affected document.',uncertain?'review':'error');
 };
 if(effectiveGst){
  if(!gstFormat(effectiveGst)){registry.gst.status='invalid_format';add('gst','invalid_registration_format','GSTIN format or checksum is invalid.','Correct the GSTIN or upload the correct certificate.');}
  else if(!gst){registry.gst.status='registration_not_found';add('gst','registration_not_found','GSTIN was not found in the supplied mock registry.','Check the registration number and certificate.');}
  else {registry.gst.status=gst.status==='Active'?'matched':'registration_inactive';registry.gst.registrationStatus=gst.status;
   if(gst.status!=='Active')add('gst','registration_inactive','GST registration is not active.','Use an active registration for GST-required products; unrestricted products remain available.');else checks.push('GST registry: active registration found.');
   compareName('gst',p.businessName,[gst.legal_name,gst.trade_name].filter(Boolean),'Business name');
  }
 }
 if(effectiveUdyam){
  if(!/^UDYAM-[A-Z]{2}-\d{2}-\d{7}$/.test(effectiveUdyam)){registry.udyam.status='invalid_format';add('udyam','invalid_registration_format','Udyam registration format is invalid.','Correct the registration number or certificate.');}
  else if(!udyam){registry.udyam.status='registration_not_found';add('udyam','registration_not_found','Udyam registration was not found in the supplied mock registry.','Check the number or replace the certificate.');}
  else{registry.udyam.status='matched';checks.push('Udyam registry: registration found.');compareName('udyam',p.businessName,[udyam.enterprise_name],'Business name');}
 }
 if(gst&&udyam&&![gst.legal_name,gst.trade_name].some(n=>same(n,udyam.enterprise_name)))add('udyam','cross_document_mismatch','GST and Udyam business names differ.','Use certificates for the same business or correct your details.');
 const requireGst=!!p.gstin||body.requiresGst===true,requireUdyam=!!p.udyam;
 const required=['address','signatory',...(requireGst?['gst']:[]),...(requireUdyam?['udyam']:[])];
 for(const kind of ['gst','udyam','address','signatory']){
  const row=rows.find(r=>r.kind===kind),fields=row?.fields;
  if(!row){if(required.includes(kind))add(kind,'missing_document',kind+': required document is missing.','Upload the missing document.');documents.push({kind,uploaded:false,required:required.includes(kind),status:required.includes(kind)?'missing_document':'not_required',extractionStatus:'not_extracted',confidence:null,reader:'none',issues:[],findings:[],reviewFields:null});continue;}
  if(!fields||row.extractionStatus==='extraction_failed')add(kind,'extraction_failed',row.errorMessage||kind+': no document information could be extracted.','Replace this file with a clear scan or use simulated assisted review.','review');
  else {
   for(const key of new Set([...(row.missingFields||[]),...needed[kind].filter(k=>!fields[k])]))add(kind,'not_extracted',kind+': '+key+' could not be extracted.','Upload a clear, complete document.','review');
   if(row.conflicts?.length)add(kind,'cross_document_mismatch','Registration numbers conflict between pages of this document.','Upload the correct complete certificate.');
   if(row.confidence!==null&&row.confidence<55)add(kind,'low_ocr_confidence','OCR confidence is low; the extracted fields may be inaccurate.','Replace the scan or request simulated review.','review');
   if(kind==='gst'){
    if(p.gstin&&fields.gstin&&!gstinComparison(p.gstin,fields.gstin).matches)add(kind,'registration_number_mismatch','Certificate GSTIN differs from the entered GSTIN.','Correct the entered GSTIN or replace the certificate.');
    if(fields.gstin&&!gstinComparison(effectiveGst,fields.gstin).matches&&!p.gstin)add(kind,'registration_number_mismatch','GST registration numbers differ.','Replace the certificate.');
    // A certificate can name a proprietor legally and a store by trade name.
    // A registry record, when present, remains an independent name authority.
    if(gst)compareName(kind,fields.businessName,[gst.legal_name,gst.trade_name].filter(Boolean),'Business name');
    else if(!same(fields.tradeName,p.businessName))compareName(kind,fields.businessName,[p.businessName],'Business name');
    if(fields.registrationStatus&&gst&&normalized(fields.registrationStatus)!==normalized(gst.status))add(kind,'registration_status_mismatch','Certificate status differs from the mock registry status.','Check the registration and upload a current certificate.');
   }
   if(kind==='udyam'){
    if(p.udyam&&fields.udyam&&fields.udyam!==p.udyam)add(kind,'registration_number_mismatch','Certificate Udyam number differs from the entered registration.','Correct the number or replace the certificate.');
    compareName(kind,fields.businessName,[udyam?.enterprise_name,p.businessName].filter(Boolean),'Business name');
   }
   if(kind==='address'){
    if(fields.businessName&&!businessMatch(fields.businessName)&&!same(fields.businessName,body.contactName))compareName(kind,fields.businessName,names.concat(body.contactName||''),'Business name');
    const expected=body.contact?.address||body.installationAddress||gst?.principal_place_of_business;
    if(!fields.address)add(kind,'not_extracted','Address could not be extracted.','Upload a clear address proof.','review');
    else if(!expected)add(kind,'address_not_provided','Installation address is needed for address matching.','Enter the installation address.');
    else if(!same(fields.address,expected))add(kind,'address_mismatch','Address proof differs from the installation address.','Correct the installation address or upload matching proof.');
    if(gst?.principal_place_of_business&&fields.address&&!same(fields.address,gst.principal_place_of_business))add(kind,'registry_address_mismatch','Address proof differs from the GST registry address.','Check whether the registration and installation details refer to the same business site.');
    const date=validDate(fields.documentDate);
    if(date===null)add(kind,'not_extracted','A valid issue date could not be extracted.','Upload proof showing a readable issue date.','review');
    else {const age=(Date.parse(REFERENCE_DATE)-date)/86400000;row.ageDays=age;if(age>90||age<0)add(kind,'document_expired_or_outdated',age<0?'Address proof is future-dated relative to 15 July 2026.':'Address proof is older than 90 days at 15 July 2026.','Upload proof dated within the prior 90 days.');}
   }
   if(kind==='signatory'){
    compareName(kind,fields.signatoryName,[body.contactName||body.contact?.name||''],'Signatory name');
    if(fields.businessName)compareName(kind,fields.businessName,names,'Business name');
    if(fields.validTill){const expiry=validDate(fields.validTill);if(expiry===null)add(kind,'invalid_document_date','Signatory expiry date is unreadable.','Upload a clear ID.','review');else if(fields.validTill<REFERENCE_DATE)add(kind,'document_expired_or_outdated','Signatory ID is expired at the exercise reference date.','Upload an unexpired ID.');}
   }
  }
  const specific=findings.filter(f=>f.kind===kind);
  const codes=specific.map(f=>f.code);
  const status=codes.includes('extraction_failed')?'extraction_failed':codes.includes('registration_not_found')?'registration_not_found':codes.includes('document_expired_or_outdated')?'outdated_document':specific.some(f=>f.severity==='error')?'mismatch_detected':specific.length?'manual_review_required':'matched';
  const reviewFields=fields?Object.fromEntries(Object.entries({...fields,gstin:mask(fields.gstin),udyam:mask(fields.udyam)}).filter(([k,v])=>k!=='readable'&&v!==''&&v!==undefined&&v!==null)):null;
  documents.push({kind,uploaded:true,required:required.includes(kind),status,extractionStatus:row.extractionStatus,confidence:row.confidence,reader:row.method,pageCount:row.pageCount,ageDays:row.ageDays,issues:specific.map(f=>f.message),findings:specific,readable:!!fields?.readable,reviewFields,registry:registry[kind]||null,errorCode:row.errorCode});
  if(!specific.length)checks.push(kind+': extracted fields match the submitted details.');
 }
 // Missing-document findings are attached after creating the corresponding row.
 for(const d of documents)if(!d.uploaded){d.findings=findings.filter(f=>f.kind===d.kind);d.issues=d.findings.map(f=>f.message);}
 const overallStatus=!findings.length?'checks_passed':findings.some(f=>f.severity==='error')?'action_required':rows.length&&rows.every(r=>!r.fields||r.extractionStatus==='extraction_failed')?'unable_to_verify':'manual_review_required';
 const result={status:findings.length?'review_required':'passed',overallStatus,findings,issues:findings.map(f=>f.message),checks,documents,registry,gstin:mask(effectiveGst),udyam:mask(effectiveUdyam),referenceDate:REFERENCE_DATE,extractionMode:body.extractionMethod==='manual'?'manual_review':rows.some(r=>r.method?.includes('external_ai'))?'external_ai':'local',consent:{version:'2026-10-smart-kyc-v3',grantedAt:new Date().toISOString(),aiProcessing:rows.some(r=>r.method?.includes('external_ai')),externalProcessingAllowed:body.aiConsent===true},note:'Mock registry and field matches do not prove document authenticity. Assisted review is a simulated local workflow, not government authentication.'};
 Object.defineProperty(result,KYC_PRIVATE,{value:{rows,effectiveGst,effectiveUdyam,eligibilityGst:gst?.status==='Active'&&!findings.some(f=>f.kind==='gst'&&f.severity==='error')?effectiveGst:'',eligibilityUdyam:udyam&&!findings.some(f=>f.kind==='udyam'&&f.severity==='error')?effectiveUdyam:''}});
 return result;
}
export async function verify(data,config,p,body){
 if(body.consent!==true)throw new AppError('Please consent before business verification.',403,'CONSENT_REQUIRED');
 const docs=validateDocuments(body.documents||[]),method=body.extractionMethod||'local';
 if(!['local','ai','manual'].includes(method))throw new AppError('Choose a supported document reader.');
 if(method==='ai'&&body.aiConsent!==true)throw new AppError('External AI document reading requires separate consent.',403,'AI_CONSENT_REQUIRED');
 if(method==='ai'&&(config.provider!=='openai'||!config.apiKey))throw new AppError('External reading requires an explicitly configured OpenAI provider. Use the local reader.',503,'AI_UNAVAILABLE');
 const rows=method==='manual'?docs.map(d=>({kind:d.kind,fields:null,confidence:null,method:'manual',extractionStatus:'extraction_failed',errorMessage:'Local reading was not requested. Simulated assisted review is needed.',missingFields:[],conflicts:[]})):await readDocuments(docs,method,config);
 return validateKycFields(data,p,{...body,extractionMethod:method},rows);
}
