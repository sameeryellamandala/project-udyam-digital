import { AppError, gstFormat } from './catalogue.mjs';
import { extract } from './ai.mjs';
import { extractLocal, imageSize } from './ocr.mjs';
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
    if (!fields.gstin || fields.gstin !== p.gstin) issues.push('gst: certificate ID does not match the submitted GSTIN.');
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
    if (typeof doc.dataUrl !== 'string') throw new AppError('Expected an image.');
    const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(doc.dataUrl);
    if (!match || match[2].length % 4) throw new AppError('Only JPEG and PNG images are accepted.');
    const bytes = Buffer.from(match[2], 'base64');
    if (bytes.length > 2 * 1024 * 1024) throw new AppError('Each image must be at most 2 MB.', 413);
    const valid = match[1] === 'png' ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    if (!valid) throw new AppError('Image contents do not match the declared type.');
    const { width, height } = imageSize(bytes);
    if (width < 100 || height < 100 || width * height > 12000000) throw new AppError('Use an image between 100 pixels and 12 megapixels.');
  }
  return documents;
}

export async function verify(data, config, p, body) {
  if (body.consent !== true) throw new AppError('Please consent before business verification.', 403, 'CONSENT_REQUIRED');
  const docs = validateDocuments(body.documents || []), issues = [], checks = [];
  const gst = data.gst.get(p.gstin), udyam = data.udyam.get(p.udyam);
  if (p.gstin) {
    if (!gstFormat(p.gstin)) issues.push('GSTIN format or checksum is invalid.');
    else if (!gst) issues.push('GSTIN was not found in the sample registry.');
    else if (gst.status !== 'Active') issues.push('GST registration is not active.');
    else checks.push('GST registry: active registration found.');
  }
  if (p.udyam) {
    if (!/^UDYAM-[A-Z]{2}-\d{2}-\d{7}$/.test(p.udyam) || !udyam) issues.push('Udyam registration was not found or its format is invalid.');
    else checks.push('Udyam registry: registration found.');
  }
  if (!gst && !udyam) issues.push('No matching business registration; an assisted review is needed.');
  if (gst && !same(p.businessName, gst.legal_name) && !same(p.businessName, gst.trade_name)) issues.push('Business name differs from the GST registry.');
  if (udyam && !same(p.businessName, udyam.enterprise_name)) issues.push('Business name differs from the Udyam registry.');
  if (gst && udyam && ![gst.legal_name,gst.trade_name].some(name=>same(name,udyam.enterprise_name))) issues.push('GST and Udyam business names differ.');
  const required = ['address', 'signatory', ...(p.gstin ? ['gst'] : []), ...(p.udyam ? ['udyam'] : [])];
  for (const kind of required) if (!docs.some(d => d.kind === kind)) issues.push(`${kind}: document is missing.`);
  const requested = body.extractionMethod || (body.aiConsent ? 'ai' : 'local');
  if (!['local','ai','manual'].includes(requested)) throw new AppError('Choose a supported document reader.');
  if (requested === 'ai' && body.aiConsent !== true) throw new AppError('External AI document reading requires separate consent.',403,'AI_CONSENT_REQUIRED');
  if (requested === 'ai' && !config.apiKey) throw new AppError('External AI is not configured. Choose local reading or manual review.',503,'AI_UNAVAILABLE');
  if (requested === 'ai' && config.provider==='groq') throw new AppError('Use local reading with the Groq testing model.',503,'AI_UNAVAILABLE');
  let extractionMode = 'manual_review'; const documentResults=[];
  if (docs.length && requested !== 'manual') {
    extractionMode = requested;
    let results;
    if (requested === 'local') {
      try { results = await extractLocal(docs); } catch { results=docs.map(doc=>({kind:doc.kind,fields:null})); }
    } else {
      results=await Promise.all(docs.map(async doc=>{try{return {kind:doc.kind,fields:await extract(config,doc)};}catch{return {kind:doc.kind,fields:null};}}));
    }
    for (const {kind,fields} of results) {
      const found=fields ? documentIssues(kind,fields,p,gst,udyam,body.contactName||'') : [`${kind}: extraction unavailable; manual review is needed.`];
      issues.push(...found); if(!found.length)checks.push(`${kind}: extracted fields match the submitted details.`);
      documentResults.push({kind,reader:extractionMode,status:found.length?'review_required':'matched',issues:found,readable:!!fields?.readable});
    }
  } else if(docs.length) { issues.push('Document extraction has not run. Manual review is required.'); for(const doc of docs)documentResults.push({kind:doc.kind,reader:'manual',status:'review_required',issues:['Manual review requested.'],readable:false}); }
  return { status: issues.length ? 'review_required' : 'passed', issues, checks, documents:documentResults, gstin: mask(p.gstin), udyam: mask(p.udyam), referenceDate: REFERENCE_DATE, extractionMode,
    consent: { version: '2026-10-v2', grantedAt: new Date().toISOString(), aiProcessing: requested === 'ai' }, note: 'Synthetic registry checks and extracted field comparisons do not establish document authenticity. Installation is not connected.' };
}
