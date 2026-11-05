import {gstFormat} from './catalogue.mjs';
export const normalizeRegistration=value=>typeof value==='string'?value.trim().toUpperCase():'';
export function checkGstinStructure(id){
 if(!id||typeof id!=='string')return false;
 const clean=normalizeRegistration(id).replace(/\s/g,'');
 return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(clean);
}
export function checkGstinChecksum(id){
 if(!checkGstinStructure(id))return false;
 return gstFormat(normalizeRegistration(id).replace(/\s/g,''));
}
export function normalizeOcrGstin(value){
 const observed=normalizeRegistration(value).replace(/\s/g,'');
 if(gstFormat(observed))return {value:observed,adjusted:false};
 // OCR can confuse O and 0. Correct only numeric GSTIN positions and only
 // when the resulting complete identifier passes the independent checksum.
 const chars=[...observed];let adjusted=false;
 if(chars.length===15)for(const i of [0,1,7,8,9,10])if(chars[i]==='O'){chars[i]='0';adjusted=true;}
 const candidate=chars.join('');
 return adjusted&&gstFormat(candidate)?{value:candidate,adjusted:true}:{value:observed,adjusted:false};
}
export function gstinComparison(entered,extracted){
 const a=normalizeRegistration(entered),b=normalizeRegistration(extracted);
 return {entered:a,extracted:b,matches:!!a&&!!b&&a===b};
}
export function safeGstinDiagnostic(entered,extracted){
 const c=gstinComparison(entered,extracted),masked=v=>v?'*'.repeat(Math.max(0,v.length-4))+v.slice(-4):'';
 return {event:'kyc_gstin_comparison',entered:masked(c.entered),extracted:masked(c.extracted),enteredLength:c.entered.length,extractedLength:c.extracted.length,matches:c.matches,differingPositions:Array.from({length:Math.max(c.entered.length,c.extracted.length)},(_,i)=>i+1).filter(i=>c.entered[i-1]!==c.extracted[i-1])};
}
