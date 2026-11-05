import {readFileSync,readdirSync,writeFileSync,mkdirSync} from 'node:fs';
import {extractLocal} from '../src/ocr.mjs';
import {loadData,gstFormat} from '../src/catalogue.mjs';
const dir='YTL_TrackA_Udyam_Digital_Data/kyc_documents',data=loadData('YTL_TrackA_Udyam_Digital_Data');
const files=readdirSync(dir).filter(f=>f.endsWith('.png')).sort();
const kind=f=>f.includes('_gst_')?'gst':f.includes('_udyam_')?'udyam':f.includes('_address_')?'address':'signatory';
const results=[];
for(let i=0;i<files.length;i+=4){
 const batch=files.slice(i,i+4),rows=await extractLocal(batch.map(f=>({kind:kind(f),dataUrl:'data:image/png;base64,'+readFileSync(dir+'/'+f).toString('base64')})));
 rows.forEach((r,j)=>{
   const fields=r.fields,findings=[];
   if(!fields.readable)findings.push('Clearer image or manual review needed');
   if(r.kind==='gst'){
     const registry=data.gst.get(fields.gstin);
     if(!gstFormat(fields.gstin))findings.push('GST format/checksum not read correctly');
     if(!registry)findings.push('Extracted GST not matched to mock registry');
     else if(registry.status!=='Active')findings.push('GST registry is not active');
   }
   if(r.kind==='udyam'&&!data.udyam.has(fields.udyam))findings.push('Extracted Udyam not matched to mock registry');
   if(r.kind==='address'){
     const date=Date.parse(fields.documentDate),age=(Date.parse('2026-07-15')-date)/86400000;
     if(!Number.isFinite(age)||age<0||age>90)findings.push('Address date unreadable, future-dated or older than 90 days');
   }
   if(r.kind==='signatory'&&(!fields.validTill||fields.validTill<'2026-07-15'))findings.push('Signatory expiry unreadable or expired');
   results.push({sample:batch[j],kind:r.kind,readable:fields.readable,fieldsPresent:Object.entries(fields).filter(([k,v])=>typeof v==='string'&&v).map(([k])=>k),findings});
 });
 console.log(`Checked ${Math.min(i+4,files.length)}/${files.length} supplied images locally.`);
}
const summary={total:results.length,readable:results.filter(r=>r.readable).length,needsClearerImage:results.filter(r=>!r.readable).length,withReviewSignals:results.filter(r=>r.findings.length).length};
mkdirSync('reports',{recursive:true});writeFileSync('reports/document-pack-qa.json',JSON.stringify({summary,referenceDate:'2026-07-15',scope:'Student-supplied images only. Extraction/readability and registry/date signals, not a judge answer key or authenticity assessment. Does not establish signatory authority or cross-document identity.',results},null,2)+'\n');
writeFileSync('reports/document-pack-qa.md',`# Local document-pack checks\n\nAll ${summary.total} supplied images were processed on this computer. ${summary.readable} met the parser readability requirements. ${summary.needsClearerImage} need a clearer image or manual review. ${summary.withReviewSignals} contain at least one readability, registry or date review signal.\n\nThese are extraction checks against the supplied mock records and fixed reference date of 2026-07-15. They do not establish authenticity, signatory authority, or a complete applicant decision. No judge-only pack was accessed. Filenames identify test fixtures only and do not determine validity.\n\n| Sample | Type | Readable | Review signals |\n|---|---|---|---|\n${results.map(r=>`| ${r.sample} | ${r.kind} | ${r.readable?'Yes':'No'} | ${r.findings.join('; ')||'No signal in these limited checks'} |`).join('\n')}\n`);
console.log(JSON.stringify(summary));
