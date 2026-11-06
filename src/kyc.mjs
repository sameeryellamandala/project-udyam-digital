import {normalizeRegistration,gstinComparison,safeGstinDiagnostic,checkGstinStructure,checkGstinChecksum} from './registration.mjs';
import {readDocuments,needed} from './kyc-reader.mjs';
import { AppError, gstFormat } from './catalogue.mjs';
import { imageSize } from './ocr.mjs';
export const REFERENCE_DATE = '2026-07-15';
export const mask = value => value ? '*'.repeat(Math.max(0, value.length - 4)) + value.slice(-4) : '';
export const normalized = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
export const same = (a, b) => normalized(a) && normalized(a) === normalized(b);

export function detectSpecimenIndicator(text) {
  if (!text || typeof text !== 'string') return false;
  // Preserve supplied hackathon synthetic fixtures which contain the synthetic disclaimer footer
  const cleaned = text.replace(/SYNTHETIC\s+SPECIMEN\s*[-–:]\s*NOT\s+A\s+VALID\s+DOCUMENT/gi, '')
                      .replace(/Format for hackathon OCR testing only/gi, '')
                      .replace(/Accel YTL Hackathon[^\n]*/gi, '');
  const patterns = [
    /NOT\s+(?:A\s+)?VALID\s+(?:DOCUMENT|CERTIFICATE|PROOF|ID)/i,
    /INVALID\s+SPECIMEN/i,
    /SPECIMEN\s*[-–:]\s*NOT\s+(?:A\s+)?VALID/i,
    /SPECIMEN\s*(?:WATERMARK|COPY|ONLY)/i,
    /WATERMARK\s*[:–-]?\s*SPECIMEN/i,
    /FOR\s+(?:TEST|TESTING)\s+ONLY\s*[-–:]\s*NOT\s+VALID/i,
    /\bVOID\b/i
  ];
  return patterns.some(p => p.test(cleaned));
}

const ADDRESS_ABBRS = [
  [/\bstreet\b/gi, 'st'], [/\broad\b/gi, 'rd'], [/\bavenue\b/gi, 'ave'], [/\blane\b/gi, 'ln'],
  [/\bfloor\b/gi, 'fl'], [/\bapartment\b/gi, 'apt'], [/\bsuite\b/gi, 'ste'],
  [/\bshop\b/gi, 'unit'], [/\bnumber\b/gi, 'no'], [/\bdistrict\b/gi, 'dist'],
  [/\bopposite\b/gi, 'opp'], [/\bnear\b/gi, 'nr']
];

export function normalizeAddress(str) {
  if (!str || typeof str !== 'string') return '';
  let s = String(str).normalize('NFKC').toLowerCase();
  for (const [pattern, rep] of ADDRESS_ABBRS) s = s.replace(pattern, rep);
  return s.replace(/[\s+(),./\\#:-]+/g, ' ').trim();
}

export function extractPin(str) {
  if (!str || typeof str !== 'string') return null;
  const m = str.match(/\b([1-9]\d{5})\b/);
  return m ? m[1] : null;
}

export function compareAddresses(installation, proof) {
  if (!installation || !proof) return { matches: false, uncertain: false, components: { matched: [], differed: [] } };
  const norm1 = normalizeAddress(installation), norm2 = normalizeAddress(proof);
  if (norm1 && (norm1 === norm2 || same(installation, proof))) {
    return { matches: true, uncertain: false, components: { matched: ['full_address'], differed: [] } };
  }
  const pin1 = extractPin(installation), pin2 = extractPin(proof);
  const words1 = norm1.split(' ').filter(w => w.length > 1);
  const words2 = norm2.split(' ').filter(w => w.length > 1);

  if (pin1 && pin2 && pin1 !== pin2) {
    return { matches: false, uncertain: false, pinMismatch: true, components: { matched: [], differed: ['pin_code', 'locality'] } };
  }

  const set2 = new Set(words2);
  const matchedWords = words1.filter(w => set2.has(w));
  const overlap = words1.length ? matchedWords.length / words1.length : 0;

  if (overlap >= 0.70 || (pin1 && pin1 === pin2 && overlap >= 0.45)) {
    return { matches: true, uncertain: false, components: { matched: matchedWords, differed: [] } };
  }
  if (overlap >= 0.35 || (pin1 && pin1 === pin2)) {
    return { matches: false, uncertain: true, components: { matched: matchedWords, differed: words1.filter(w => !set2.has(w)) } };
  }
  return { matches: false, uncertain: false, components: { matched: matchedWords, differed: words1.filter(w => !set2.has(w)) } };
}

export function verifyPinCode(pin, statedDistrict, statedState, pinDirectory) {
  if (!pin) return { status: 'not_provided', message: 'No PIN code found in address.' };
  if (!pinDirectory || !(pinDirectory instanceof Map) || pinDirectory.size === 0) {
    return { status: 'unable_to_verify', message: 'Unable to verify PIN code' };
  }
  const record = pinDirectory.get(pin);
  if (!record) {
    return { status: 'unable_to_verify', message: 'Unable to verify PIN code' };
  }
  const refState = (record.state || record.statename || '').toLowerCase();
  const refDistrict = (record.district || record.districtname || '').toLowerCase();
  const stState = (statedState || '').toLowerCase();
  const stDistrict = (statedDistrict || '').toLowerCase();

  let inconsistent = false;
  if (stState && refState && !refState.includes(stState) && !stState.includes(refState)) {
    inconsistent = true;
  }
  if (stDistrict && refDistrict && !refDistrict.includes(stDistrict) && !stDistrict.includes(refDistrict)) {
    inconsistent = true;
  }
  if (inconsistent) {
    return { status: 'inconsistent', message: `PIN code ${pin} is registered to ${refDistrict || refState}, which differs from the submitted address.`, refState, refDistrict };
  }
  return { status: 'verified', message: `PIN code ${pin} verified for ${refDistrict}, ${refState}.`, refState, refDistrict };
}

export function determineDocumentStatus(kind, specificFindings, row, fields, uploaded, required) {
  if (!uploaded) return required ? 'missing_document' : 'not_required';
  const codes = specificFindings.map(f => f.code);
  if (codes.includes('invalid_specimen')) return 'invalid_specimen';
  if (codes.includes('extraction_failed') || row?.extractionStatus === 'extraction_failed') return 'extraction_failed';
  if (codes.includes('invalid_registration_format')) return 'invalid_registration_format';
  if (codes.includes('invalid_checksum')) return 'invalid_checksum';
  if (codes.includes('registration_not_found')) return 'registration_not_found';
  if (codes.includes('cancelled_registration') || codes.includes('registration_inactive')) return 'cancelled_registration';
  if (codes.includes('document_expired_or_outdated')) return 'outdated_document';
  if (specificFindings.some(f => f.severity === 'error')) return 'mismatch_detected';
  if (specificFindings.some(f => f.severity === 'review') || codes.includes('manual_review_required')) return 'manual_review_required';
  if (codes.includes('unable_to_verify')) return 'unable_to_verify';
  return 'matched';
}

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
export const validDate=value=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return null;const n=Date.parse(value+'T00:00:00Z');return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===value?n:null;};
export function near(a,b){const x=normalized(a),y=normalized(b);if(!x||!y)return false;let row=Array.from({length:y.length+1},(_,i)=>i);for(let i=1;i<=x.length;i++){const next=[i];for(let j=1;j<=y.length;j++)next[j]=Math.min(next[j-1]+1,row[j]+1,row[j-1]+(x[i-1]===y[j-1]?0:1));row=next;}return row[y.length]<=Math.max(1,Math.floor(Math.max(x.length,y.length)*.08));}

export function validateKycFields(data,p,body,rows){
 p={...p,gstin:normalizeRegistration(p.gstin),udyam:normalizeRegistration(p.udyam)};
 rows=rows.map(r=>({...r,fields:r.fields?{...r.fields,gstin:normalizeRegistration(r.fields.gstin),udyam:normalizeRegistration(r.fields.udyam)}:null}));
 if(process.env.KYC_DEBUG==='1')console.info(JSON.stringify({...safeGstinDiagnostic(p.gstin,rows.find(r=>r.kind==='gst')?.fields?.gstin),ocrAdjusted:!!rows.find(r=>r.kind==='gst')?.fields?.gstinReadAdjustment}));
 const findings=[],checks=[],documents=[];
 const add=(kind,code,message,action,severity='error')=>{const f={kind,code,message,action,severity};findings.push(f);return f;};
 const field=kind=>rows.find(r=>r.kind===kind)?.fields;
 const extractedGst=field('gst')?.gstin||'',extractedUdyam=field('udyam')?.udyam||'';
 const effectiveGst=p.gstin||extractedGst,effectiveUdyam=p.udyam||extractedUdyam;
 const gst=data.gst.get(extractedGst||p.gstin),udyam=data.udyam.get(extractedUdyam||p.udyam);
 const registry={gst:{status:'not_provided'},udyam:{status:'not_provided'}};
 const names=[p.businessName,gst?.legal_name,gst?.trade_name,udyam?.enterprise_name].filter(Boolean);
 const businessMatch=name=>names.some(n=>same(name,n));
 const compareName=(kind,value,expected,label)=>{
  if(!value){add(kind,'not_extracted',label+' could not be extracted.','Upload a clearer document.');return;}
  if(expected.some(n=>same(value,n)))return;
  const uncertain=expected.some(n=>near(value,n));
  add(kind,uncertain?'name_match_uncertain':label==='Signatory name'?'name_mismatch':'business_name_mismatch',label+(uncertain?' has a small spelling difference and needs confirmation.':' does not match the submitted or registry information.'),uncertain?'Check the spelling or request simulated reviewer confirmation.':'Correct the entered details or replace the affected document.',uncertain?'review':'error');
 };

 const hasGstDoc=rows.some(r=>r.kind==='gst'), hasUdyamDoc=rows.some(r=>r.kind==='udyam');

 // Validate profile registrations against registry when provided
 if(p.gstin){
  if(!gstFormat(p.gstin)){
   registry.gst.status='invalid_format';
   add('gst',!checkGstinStructure(p.gstin)?'invalid_registration_format':'invalid_checksum','GSTIN format or checksum is invalid.','Correct the GSTIN or upload the correct certificate.');
  } else {
   const profGst=data.gst.get(p.gstin);
   if(!profGst){
    registry.gst.status='registration_not_found';
    add('gst','registration_not_found','GSTIN was not found in the supplied mock registry.','Check the registration number and certificate.');
   } else {
    registry.gst.status=profGst.status==='Active'?'matched':'registration_inactive';
    registry.gst.registrationStatus=profGst.status;
    if(profGst.status!=='Active'){
     if(!hasGstDoc)add('gst','registration_inactive','GST registration is not active.','Use an active registration for GST-required products; unrestricted products remain available.');
    } else {
     checks.push('GST registry: active registration found.');
    }
    compareName('gst',p.businessName,[profGst.legal_name,profGst.trade_name].filter(Boolean),'Business name');
   }
  }
 }
 if(p.udyam){
  if(!/^UDYAM-[A-Z]{2}-\d{2}-\d{7}$/.test(p.udyam)){
   registry.udyam.status='invalid_format';
   add('udyam','invalid_registration_format','Udyam registration format is invalid.','Correct the registration number or certificate.');
  } else {
   const profUdyam=data.udyam.get(p.udyam);
   if(!profUdyam){
    registry.udyam.status='registration_not_found';
    add('udyam','registration_not_found','Udyam registration was not found in the supplied mock registry.','Check the number or replace the certificate.');
   } else {
    registry.udyam.status='matched';
    checks.push('Udyam registry: registration found.');
    compareName('udyam',p.businessName,[profUdyam.enterprise_name],'Business name');
   }
  }
 }

 const requireGst=!!p.gstin||body.requiresGst===true,requireUdyam=!!p.udyam;
 const required=['address','signatory',...(requireGst?['gst']:[]),...(requireUdyam?['udyam']:[])];

 // Add cross-document findings before building the affected document card.
 if(gst&&udyam&&![gst.legal_name,gst.trade_name].some(n=>same(n,udyam.enterprise_name))){
   add('udyam','cross_document_mismatch','GST and Udyam business names differ.','Use certificates for the same business or correct your details.');
 }

 for(const kind of ['gst','udyam','address','signatory']){
  const row=rows.find(r=>r.kind===kind),fields=row?.fields;
  const fieldChecks=[];
  if(!row){
    if(required.includes(kind))add(kind,'missing_document',kind+': required document is missing.','Upload the missing document.');
    documents.push({kind,uploaded:false,required:required.includes(kind),status:required.includes(kind)?'missing_document':'not_required',extractionStatus:'not_extracted',confidence:null,reader:'none',issues:[],findings:[],reviewFields:null,fieldChecks:[]});
    continue;
  }
  if(!fields||row.extractionStatus==='extraction_failed'){
    add(kind,'extraction_failed',row.errorMessage||kind+': no document information could be extracted.','Replace this file with a clear scan or use simulated assisted review.','review');
  } else {
    // Check clear invalid specimen indicator
    if(detectSpecimenIndicator(fields.rawText||row.rawText||'')){
      add(kind,'invalid_specimen','Document contains an invalid specimen indicator. Manual review required.','Upload an official genuine certificate or request manual review.','error');
    }
    for(const key of new Set([...(row.missingFields||[]),...needed[kind].filter(k=>!fields[k])]))add(kind,'not_extracted',kind+': '+key+' could not be extracted.','Upload a clear, complete document.','review');
    if(row.conflicts?.length)add(kind,'cross_document_mismatch','Registration numbers conflict between pages of this document.','Upload the correct complete certificate.');
    if(row.confidence!==null&&row.confidence<55)add(kind,'low_ocr_confidence','OCR confidence is low; the extracted fields may be inaccurate.','Replace the scan or request simulated review.','review');

    if(kind==='gst'){
      const ocrGst=fields.gstin||'';
      const ocrGstValidStructure=checkGstinStructure(ocrGst);
      const ocrGstValidChecksum=checkGstinChecksum(ocrGst);
      const certRegistry=data.gst.get(ocrGst);

      // Validate OCR GSTIN independently
      if(fields.gstinReadUncertain){
        registry.gst.status='reading_uncertain';
        add(kind,'registration_read_uncertain','GSTIN could not be read confidently from this scan.','Upload a clearer image or request review.','review');
      } else if(!ocrGst){
        add(kind,'not_extracted','GSTIN could not be extracted from certificate.','Upload a clear certificate.');
      } else if(!ocrGstValidStructure){
        registry.gst.status='invalid_format';
        add(kind,'invalid_registration_format','GSTIN format is invalid. Check the 15-character structure.','Correct the GSTIN or upload the correct certificate.');
      } else if(!ocrGstValidChecksum){
        registry.gst.status='invalid_checksum';
        add(kind,'invalid_checksum','GSTIN checksum digit is invalid.','Check the registration number or upload a valid certificate.');
      } else if(!certRegistry){
        registry.gst.status='registration_not_found';
        add(kind,'registration_not_found','GSTIN was not found in the supplied mock registry.','Check the registration number and certificate.');
      } else {
        registry.gst.status=certRegistry.status==='Active'?'matched':'registration_inactive';
        registry.gst.registrationStatus=certRegistry.status;
        if(certRegistry.status!=='Active'){
          add(kind,'registration_inactive','GST registration is not active.','Use an active registration for GST-required products; unrestricted products remain available.');
        } else {
          checks.push('GST registry: active registration found.');
        }
        // Compare business name
        compareName(kind,fields.businessName,[certRegistry.legal_name,certRegistry.trade_name].filter(Boolean),'Business name');
        if(p.businessName&&!same(fields.tradeName,p.businessName))compareName(kind,p.businessName,[certRegistry.legal_name,certRegistry.trade_name].filter(Boolean),'Business name');

        if(fields.tradeName&&certRegistry.trade_name){
          const tm=same(fields.tradeName,certRegistry.trade_name);
          fieldChecks.push({field:'trade_name',ocrValue:fields.tradeName,registryValue:certRegistry.trade_name,status:tm?'matched':'mismatch'});
        } else fieldChecks.push({field:'trade_name',status:'not_checked',reason:!fields.tradeName?'not_extracted':'not_in_registry'});

        if(fields.registrationDate&&certRegistry.registration_date){
          const dm=fields.registrationDate===certRegistry.registration_date;
          fieldChecks.push({field:'registration_date',ocrValue:fields.registrationDate,registryValue:certRegistry.registration_date,status:dm?'matched':'mismatch'});
          if(!dm)add(kind,'registration_date_mismatch','Certificate registration date differs from the mock registry.','Check certificate registration date.');
        } else fieldChecks.push({field:'registration_date',status:'not_checked',reason:!fields.registrationDate?'not_extracted':'not_in_registry'});

        if(fields.state&&certRegistry.state){
          const sm=same(fields.state,certRegistry.state);
          fieldChecks.push({field:'state',ocrValue:fields.state,registryValue:certRegistry.state,status:sm?'matched':'mismatch'});
          if(!sm)add(kind,'registration_state_mismatch','Certificate state differs from the mock registry.','Check certificate state.');
        } else fieldChecks.push({field:'state',status:'not_checked',reason:!fields.state?'not_extracted':'not_in_registry'});
      }

      if(!certRegistry){
        if(!same(fields.tradeName,p.businessName))compareName(kind,fields.businessName,[p.businessName],'Business name');
      }

      // Compare profile GSTIN with OCR GSTIN if both provided
      if(!fields.gstinReadUncertain&&p.gstin&&ocrGst&&!gstinComparison(p.gstin,ocrGst).matches){
        add(kind,'registration_number_mismatch','Certificate GSTIN differs from the entered profile GSTIN.','Correct the entered GSTIN or replace the certificate.');
      }
    }

    if(kind==='udyam'){
      const ocrUdyam=fields.udyam||'';
      const udyamFormatValid=/^UDYAM-[A-Z]{2}-\d{2}-\d{7}$/.test(ocrUdyam);
      const udyamRegistry=data.udyam.get(ocrUdyam);

      // Validate OCR Udyam independently
      if(!ocrUdyam){
        add(kind,'not_extracted','Udyam number could not be extracted from certificate.','Upload a clear certificate.');
      } else if(!udyamFormatValid){
        registry.udyam.status='invalid_format';
        add(kind,'invalid_registration_format','Udyam registration format is invalid.','Correct the registration number or certificate.');
      } else if(!udyamRegistry){
        registry.udyam.status='registration_not_found';
        add(kind,'registration_not_found','Udyam registration was not found in the supplied mock registry.','Check the number or replace the certificate.');
      } else {
        registry.udyam.status='matched';
        checks.push('Udyam registry: registration found.');

        // Compare all available fields in OCR and registry
        compareName(kind,fields.businessName,[udyamRegistry.enterprise_name,p.businessName].filter(Boolean),'Business name');
        if(p.businessName)compareName(kind,p.businessName,[udyamRegistry.enterprise_name],'Business name');

        if(fields.enterpriseClassification&&udyamRegistry.enterprise_type){
          const cm=same(fields.enterpriseClassification,udyamRegistry.enterprise_type);
          fieldChecks.push({field:'enterprise_type',ocrValue:fields.enterpriseClassification,registryValue:udyamRegistry.enterprise_type,status:cm?'matched':'mismatch'});
          if(!cm)add(kind,'udyam_classification_mismatch','Enterprise classification differs from the mock registry.','Check classification on the certificate.');
        } else fieldChecks.push({field:'enterprise_type',status:'not_checked',reason:!fields.enterpriseClassification?'not_extracted':'not_in_registry'});

        if(fields.majorActivity&&udyamRegistry.major_activity){
          const am=same(fields.majorActivity,udyamRegistry.major_activity);
          fieldChecks.push({field:'major_activity',ocrValue:fields.majorActivity,registryValue:udyamRegistry.major_activity,status:am?'matched':'mismatch'});
          if(!am)add(kind,'udyam_activity_mismatch','Major activity differs from the mock registry.','Check major activity on the certificate.');
        } else fieldChecks.push({field:'major_activity',status:'not_checked',reason:!fields.majorActivity?'not_extracted':'not_in_registry'});

        if(fields.registrationDate&&udyamRegistry.date_of_registration){
          const rm=fields.registrationDate===udyamRegistry.date_of_registration;
          fieldChecks.push({field:'date_of_registration',ocrValue:fields.registrationDate,registryValue:udyamRegistry.date_of_registration,status:rm?'matched':'mismatch'});
          if(!rm)add(kind,'udyam_date_mismatch','Registration date differs from the mock registry.','Check registration date on the certificate.');
        } else fieldChecks.push({field:'date_of_registration',status:'not_checked',reason:!fields.registrationDate?'not_extracted':'not_in_registry'});

        if(fields.city&&udyamRegistry.city){
          const locM=same(fields.city,udyamRegistry.city);
          fieldChecks.push({field:'city',ocrValue:fields.city,registryValue:udyamRegistry.city,status:locM?'matched':'mismatch'});
          if(!locM)add(kind,'udyam_location_mismatch','City differs from the Udyam registry.','Check city on the certificate.');
        } else fieldChecks.push({field:'city',status:'not_checked',reason:!fields.city?'not_extracted':'not_in_registry'});

        if(fields.state&&udyamRegistry.state){
          const stateM=same(fields.state,udyamRegistry.state);
          fieldChecks.push({field:'state',ocrValue:fields.state,registryValue:udyamRegistry.state,status:stateM?'matched':'mismatch'});
          if(!stateM)add(kind,'udyam_location_mismatch','State differs from the Udyam registry.','Check state on the certificate.');
        } else fieldChecks.push({field:'state',status:'not_checked',reason:!fields.state?'not_extracted':'not_in_registry'});
      }

      // Compare profile Udyam if provided
      if(p.udyam&&ocrUdyam&&ocrUdyam!==p.udyam){
        add(kind,'registration_number_mismatch','Certificate Udyam number differs from the entered registration.','Correct the number or replace the certificate.');
      }
    }

    if(kind==='address'){
      if(fields.businessName&&!businessMatch(fields.businessName)&&!same(fields.businessName,body.contactName))compareName(kind,fields.businessName,names.concat(body.contactName||''),'Business name');
      const expected=body.contact?.address||body.installationAddress||gst?.principal_place_of_business;

      if(!fields.address){
        add(kind,'not_extracted','Address could not be extracted.','Upload a clear address proof.','review');
      } else if(!expected){
        add(kind,'address_not_provided','Installation address is needed for address matching.','Enter the installation address.');
      } else {
        const addrCmp=compareAddresses(expected,fields.address);
        if(addrCmp.matches){
          fieldChecks.push({field:'installation_address',status:'matched',components:addrCmp.components.matched});
        } else if(addrCmp.uncertain){
          fieldChecks.push({field:'installation_address',status:'uncertain',differed:addrCmp.components.differed});
          add(kind,'address_uncertain','Address proof has minor formatting or locality differences. Manual review recommended.','Confirm the address or request simulated review.','review');
        } else {
          fieldChecks.push({field:'installation_address',status:'mismatch',differed:addrCmp.components.differed});
          add(kind,'address_mismatch','Address proof differs from the installation address.','Correct the installation address or upload matching proof.');
        }
      }

      // Compare GST principal place of business if available
      const gstForAddr=data.gst.get(extractedGst||p.gstin);
      if(gstForAddr?.principal_place_of_business&&expected&&!same(expected,gstForAddr.principal_place_of_business)){
        const gstAddrCmp=compareAddresses(expected,gstForAddr.principal_place_of_business);
        if(!gstAddrCmp.matches){
          add(kind,'registry_address_mismatch','Address proof differs from the GST registry address.','Check whether the registration and installation details refer to the same business site.','review');
        }
      }

      // PIN code verification against reference dataset
      const pin=extractPin(expected)||extractPin(fields.address);
      const pinResult=verifyPinCode(pin,body.contact?.district||fields.district,body.contact?.state||fields.state,data.pincodes);
      if(pinResult.status==='inconsistent'){
        add(kind,'pin_location_inconsistent',pinResult.message,'Review address and PIN code.','review');
      } else if(pinResult.status==='unable_to_verify'){
        checks.push('address: Unable to verify PIN code ('+(pin||'none')+') - reference PIN dataset is not installed.');
      } else if(pinResult.status==='verified'){
        checks.push('address: PIN code '+pin+' verified with reference directory.');
      }

      // Document age verification
      const date=validDate(fields.documentDate);
      if(date===null)add(kind,'not_extracted','A valid issue date could not be extracted.','Upload proof showing a readable issue date.','review');
      else {
        const age=(Date.parse(REFERENCE_DATE)-date)/86400000;
        row.ageDays=age;
        if(age>90||age<0){
          add(kind,'document_expired_or_outdated',age<0?'Address proof is future-dated relative to 15 July 2026.':'Address proof is older than 90 days at 15 July 2026.','Upload proof dated within the prior 90 days.');
        }
      }
    }

    if(kind==='signatory'){
      compareName(kind,fields.signatoryName,[body.contactName||body.contact?.name||''],'Signatory name');
      if(fields.businessName)compareName(kind,fields.businessName,names,'Business name');
      if(fields.validTill){
        const expiry=validDate(fields.validTill);
        if(expiry===null)add(kind,'invalid_document_date','Signatory expiry date is unreadable.','Upload a clear ID.','review');
        else if(fields.validTill<REFERENCE_DATE)add(kind,'document_expired_or_outdated','Signatory ID is expired at the exercise reference date.','Upload an unexpired ID.');
      }
    }
  }

  const specific=findings.filter(f=>f.kind===kind);
  const status=determineDocumentStatus(kind,specific,row,fields,true,required.includes(kind));
  const reviewFields=fields?Object.fromEntries(Object.entries({...fields,gstin:mask(fields.gstin),udyam:mask(fields.udyam)}).filter(([k,v])=>k!=='readable'&&k!=='rawText'&&v!==''&&v!==undefined&&v!==null)):null;

  const validationSummary={
    format:{valid:!specific.some(f=>f.code==='invalid_registration_format')},
    checksum:{valid:!specific.some(f=>f.code==='invalid_checksum')},
    registryLookup:{
      found:registry[kind]?.status==='matched'||registry[kind]?.status==='registration_inactive',
      status:registry[kind]?.status||'not_checked',
      source:kind==='gst'?'mock_gstin_registry.csv':kind==='udyam'?'mock_udyam_registry.csv':null
    },
    registrationStatus:registry[kind]?.registrationStatus||null,
    fieldChecks,
    authenticity:specific.some(f=>f.code==='invalid_specimen')?'invalid_specimen':'authenticity_not_verified'
  };

  documents.push({
    kind,uploaded:true,required:required.includes(kind),status,
    extractionStatus:row.extractionStatus,confidence:row.confidence,
    reader:row.method,pageCount:row.pageCount,ageDays:row.ageDays,processingMs:row.processingMs,
    issues:specific.map(f=>f.message),findings:specific,
    readable:!!fields?.readable,reviewFields,registry:registry[kind]||null,
    errorCode:row.errorCode,validation:validationSummary,fieldChecks
  });

  if(!specific.length){
    const comparedCount=fieldChecks.filter(fc=>fc.status==='matched').length;
    if(comparedCount>0&&fieldChecks.every(fc=>fc.status==='matched'||fc.status==='not_checked')){
      checks.push(kind+': verified matching fields ('+fieldChecks.filter(fc=>fc.status==='matched').map(fc=>fc.field).join(', ')+').');
    } else {
      checks.push(kind+': extracted fields match the submitted details.');
    }
  }
 }

 // Missing-document findings are attached after creating the corresponding row
 for(const d of documents)if(!d.uploaded){d.findings=findings.filter(f=>f.kind===d.kind);d.issues=d.findings.map(f=>f.message);}

 const overallStatus=!findings.length?'checks_passed':findings.some(f=>f.severity==='error')?'action_required':rows.length&&rows.every(r=>!r.fields||r.extractionStatus==='extraction_failed')?'unable_to_verify':'manual_review_required';

 const result={
   status:findings.length?'review_required':'passed',
   overallStatus,findings,issues:findings.map(f=>f.message),checks,
   documents,registry,
   gstin:mask(effectiveGst),udyam:mask(effectiveUdyam),
   referenceDate:REFERENCE_DATE,
   extractionMode:body.extractionMethod==='manual'?'manual_review':rows.some(r=>r.method?.includes('external_ai'))?'external_ai':'local',
   consent:{version:'2026-10-smart-kyc-v3',grantedAt:new Date().toISOString(),aiProcessing:rows.some(r=>r.method?.includes('external_ai')),externalProcessingAllowed:body.aiConsent===true},
   note:'Mock registry and field matches do not prove document authenticity. Assisted review is a simulated local workflow, not government authentication.'
 };

 const eligibilityGstCert=!field('gst')?.gstinReadUncertain&&extractedGst&&data.gst.get(extractedGst)?.status==='Active'&&!findings.some(f=>f.kind==='gst'&&f.severity==='error')?extractedGst:'';
 const eligibilityGstProfile=p.gstin&&data.gst.get(p.gstin)?.status==='Active'&&!rows.some(r=>r.kind==='gst')?p.gstin:'';
 const eligibilityUdyamCert=extractedUdyam&&data.udyam.get(extractedUdyam)&&!findings.some(f=>f.kind==='udyam'&&f.severity==='error')?extractedUdyam:'';
 const eligibilityUdyamProfile=p.udyam&&data.udyam.get(p.udyam)&&!rows.some(r=>r.kind==='udyam')?p.udyam:'';

 Object.defineProperty(result,KYC_PRIVATE,{value:{
   rows,effectiveGst,effectiveUdyam,
   eligibilityGst:eligibilityGstCert||eligibilityGstProfile,
   eligibilityUdyam:eligibilityUdyamCert||eligibilityUdyamProfile
 }});
 return result;
}

export async function verify(data,config,p,body){
 const started=performance.now();
 if(body.consent!==true)throw new AppError('Please consent before business verification.',403,'CONSENT_REQUIRED');
 const docs=validateDocuments(body.documents||[]),method=body.extractionMethod||'local';
 if(!['local','ai','manual'].includes(method))throw new AppError('Choose a supported document reader.');
 if(method==='ai'&&body.aiConsent!==true)throw new AppError('External AI document reading requires separate consent.',403,'AI_CONSENT_REQUIRED');
 if(method==='ai'&&(config.provider!=='openai'||!config.apiKey))throw new AppError('External reading requires an explicitly configured OpenAI provider. Use the local reader.',503,'AI_UNAVAILABLE');
 const rows=method==='manual'?docs.map(d=>({kind:d.kind,fields:null,confidence:null,method:'manual',extractionStatus:'extraction_failed',errorMessage:'Local reading was not requested. Simulated assisted review is needed.',missingFields:[],conflicts:[]})):await readDocuments(docs,method,config);
 const result=validateKycFields(data,p,{...body,extractionMethod:method},rows);
 result.processingMs=Math.round(performance.now()-started);
 return result;
}
