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
 const readings=new Set([observed]);
 // A 16-character reading may contain a duplicated zero-shaped glyph. Only
 // consider removing O adjacent to 0, never arbitrary deletions or registry IDs.
 if(observed.length===16)for(let i=0;i<observed.length;i++)if(observed[i]==='O'&&(observed[i-1]==='0'||observed[i+1]==='0'))readings.add(observed.slice(0,i)+observed.slice(i+1));
 const candidates=new Set();
 for(const reading of readings){
   if(reading.length!==15)continue;
   const chars=[...reading];
   const digits={O:'0',I:'1',L:'1',S:'5',B:'8'},letters={'0':'O','1':'I','5':'S','8':'B'};
   for(const i of [0,1,7,8,9,10])if(digits[chars[i]])chars[i]=digits[chars[i]];
   for(const i of [2,3,4,5,6,11])if(letters[chars[i]])chars[i]=letters[chars[i]];
   if(chars[13]==='7'||chars[13]==='2')chars[13]='Z';
   const candidate=chars.join('');if(gstFormat(candidate))candidates.add(candidate);
 }
 return candidates.size===1?{value:[...candidates][0],adjusted:true}:{value:observed,adjusted:false,ambiguous:candidates.size>1};
}
export function gstinComparison(entered,extracted){
 const a=normalizeRegistration(entered),b=normalizeRegistration(extracted);
 return {entered:a,extracted:b,matches:!!a&&!!b&&a===b};
}
export function safeGstinDiagnostic(entered,extracted){
 const c=gstinComparison(entered,extracted),masked=v=>v?'*'.repeat(Math.max(0,v.length-4))+v.slice(-4):'';
 return {event:'kyc_gstin_comparison',entered:masked(c.entered),extracted:masked(c.extracted),enteredLength:c.entered.length,extractedLength:c.extracted.length,matches:c.matches,differingPositions:Array.from({length:Math.max(c.entered.length,c.extracted.length)},(_,i)=>i+1).filter(i=>c.entered[i-1]!==c.extracted[i-1])};
}
