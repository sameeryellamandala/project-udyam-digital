import {profile,AppError} from './catalogue.mjs';
export const blankProfile=language=>profile({businessName:'New business',segment:'prof',employees:1,sites:1,cityTier:1,budget:1,needs:['internet'],language});
export const freshMemory=()=>({memoryVersion:1,details:{knownFields:[],needs:[],mobileLines:0,emailAccounts:0,cameraCount:0,gstStatus:'unknown',internetPreference:'any'},items:[],offers:[]});
export const ambiguous=text=>/^(?:increase|decrease|reduce|change|remove|add)(?: it| that| this)?[.!?]*$/i.test(text.trim());
const patterns={internet:/internet|broadband|fibre|fiber|इंटरनेट/i,mobile:/\bsims?\b|mobile connections?|postpaid|सिम/i,email:/e-?mail|ईमेल/i,backup:/backup|failover|बैकअप/i,security:/(?<!for )security|antivirus|सुरक्षा/i,pos:/billing|\bpos\b|बिलिंग/i,whatsapp:/whatsapp|व्हाट्स/i,cctv:/cctv|cameras?|कैमरा/i,iot:/\biot\b|machine monitoring/i};
export function cameraCountAnswer(text,pending=''){
 if(!/how many.*(?:cctv|camera)|कितने.*कैमर/i.test(pending))return null;
 const words={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10};
 const value=String(text).trim().toLowerCase().replace(/[०-९]/g,c=>String('०१२३४५६७८९'.indexOf(c))).replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/g,w=>String(words[w]));
 if(!/^\d+[.!]?$/.test(value))return null;
 const count=Number(value.replace(/[.!]$/,''));
 if(!Number.isInteger(count)||count<1||count>10000)throw new AppError('Camera count must be a whole number from 1 to 10000.');
 return count;
}
export function mergeRequirements(business,extracted,previous,text,pending=''){
 const known=new Set(previous.knownFields||[]),provided=new Set(extracted.knownFields||[]),details={...previous,...extracted};
 const words={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10};
 const normalized=text.toLowerCase().replace(/[०-९]/g,c=>String('०१२३४५६७८९'.indexOf(c))).replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/g,w=>String(words[w]));
 for(const [k,re]of [['employees',/employees?|staff|people|team|कर्मचारी/],['sites',/locations?|sites?|branches?|स्थान/],['budget',/budget|under|within|बजट/]])if(provided.has(k)&&!re.test(normalized)&&!re.test(pending.toLowerCase()))provided.delete(k);
 for(const k of ['city','gstStatus','currentTools'])if(provided.has(k)&&!(typeof extracted[k]==='string'&&normalized.includes(extracted[k].toLowerCase()))&&!/gst|city|tools/i.test(pending))provided.delete(k);
 for(const k of ['segment','employees','sites','cityTier','budget','city','gstStatus','currentTools'])if(!provided.has(k))details[k]=previous[k]??business[k]??(k==='gstStatus'?'unknown':'');
 const staff=normalized.match(/(\d+)\s*(?:employees?|people|staff|कर्मचारी|लोग)/);
 if(staff){details.employees=Number(staff[1]);provided.add('employees');}
 const extraSites=normalized.match(/(?:add|increase by|plus)?\s*(\d+)\s*(?:additional|extra|more)\s*(?:business\s+)?(?:locations?|sites?|branches?)/);
 const sites=normalized.match(/(\d+)\s*(?:locations?|sites?|branches?|स्थान|शाखा|दुकान)/);
 if(extraSites){details.sites=(previous.sites||business.sites||1)+Number(extraSites[1]);provided.add('sites');}
 else if(sites){details.sites=Number(sites[1]);provided.add('sites');}
 const tier=normalized.match(/\btier\s*([12])\b|श्रेणी\s*([12])/);
 if(tier){details.cityTier=Number(tier[1]||tier[2]);provided.add('cityTier');}
 const city=normalized.match(/\b(?:in|at|near|from)\s+([a-z][a-z .'-]{1,48}?)(?=\s*(?:,|;|[.!?])|\s+(?:with|for|and|having|where|we|i|my|our|there)\b|\s+\d|$)/);
 if(city){details.city=city[1].trim().replace(/\b[a-z]/g,c=>c.toUpperCase());provided.add('city');}
 const currentTools=normalized.match(/\b(?:currently|right now)\s+(?:i\s+)?(?:use|using|have)\s+([^.!?;]+)/);
 if(currentTools){details.currentTools=currentTools[1].trim();provided.add('currentTools');}
 if(/\b(?:no|without|not registered|unregistered|don't have|do not have)\b[^.!?]{0,40}\b(?:gst|gstin)\b|\b(?:gst|gstin)\b[^.!?]{0,30}\b(?:no|not registered|unregistered)\b/.test(normalized)){details.gstStatus='no';provided.add('gstStatus');}
 else if(/\b(?:yes|have|registered)\b[^.!?]{0,40}\b(?:gst|gstin)\b|\b(?:gst|gstin)\b[^.!?]{0,30}\b(?:yes|registered|active)\b/.test(normalized)){details.gstStatus='yes';provided.add('gstStatus');}
 const newNeeds=new Set(known.has('needs')?(previous.needs||business.needs):[]);
 const clauses=normalized.split(/[.!;]|\bbut\b|\bonly\b|\band\b(?=\s+(?:add|remove|keep|i need|i want))/);
 const only=normalized.match(/(?:only need|need only|only want|केवल)\s+(.+)/);
 if(only){newNeeds.clear();for(const [k,re]of Object.entries(patterns))if(re.test(only[1]))newNeeds.add(k);provided.add('needs');}
 for(const clause of clauses){const remove=/remove|without|no longer|don.t need|do not need|don.t want|हटा/.test(clause);for(const [k,re]of Object.entries(patterns))if(re.test(clause)){if(remove)newNeeds.delete(k);else newNeeds.add(k);provided.add('needs');}}
 if(provided.has('needs')){details.needs=[...newNeeds];known.add('needs');}
 else details.needs=previous.needs||business.needs;
 for(const k of ['mobileLines','emailAccounts']){
  const topic=k==='mobileLines'?'(?:(?:postpaid|prepaid)\\s+)?(?:mobile\\s+)?(?:sims?(?:\\s+connections?)?|mobile\\s+connections?)':'(?:email|e-mail)\\s*(?:accounts?|users?)';
  const count=normalized.match(new RegExp('(\\d+)\\s*(additional\\s+|extra\\s+|more\\s+)?'+topic));
  if(count){details[k]=Number(count[1])+(count[2]?(previous[k]||0):0);known.add(k);}
  else if(/^\d+$/.test(normalized.trim())&&(k==='mobileLines'?/how many.*sim/i:/how many.*email/i).test(pending)){details[k]=Number(normalized);known.add(k);}
  else details[k]=previous[k]||0;
  if(details[k]<0||details[k]>10000)throw new AppError('Connection count is outside supported limits.');
 }
 const locations=Array.isArray(previous.locations)?previous.locations.map(location=>({...location})):[];
 const locationCameraPattern=/(\d+)\s*(additional\s+|extra\s+|more\s+)?(?:(?:cctv|security)\s+)?cameras?\s+(?:at|in)\s+([a-z][a-z .'-]{1,40}?)(?=\s*(?:[,;]|$)|\s+and\s+\d+\b|[.!?]|$)/g;
 const locationUpdates=[...normalized.matchAll(locationCameraPattern)];
 if(locationUpdates.length){
  for(const [,rawCount,increment,rawName] of locationUpdates){
   const name=rawName.trim().replace(/\s+/g,' ').replace(/\b[a-z]/g,c=>c.toUpperCase());
   const index=locations.findIndex(location=>String(location.name).toLowerCase()===name.toLowerCase());
   const prior=index>=0?Number(locations[index].cameraCount||0):0,count=Number(rawCount)+(increment?prior:0);
   const entry={...(index>=0?locations[index]:{}),name,cameraCount:count};
   if(index>=0)locations[index]=entry;else locations.push(entry);
  }
  details.locations=locations;details.cameraCount=locations.reduce((sum,location)=>sum+Number(location.cameraCount||0),0);known.add('locations');known.add('cameraCount');
  if(new Set(locationUpdates.map(match=>String(match[3]).trim().toLowerCase())).size>1){details.sites=Math.max(Number(previous.sites||business.sites||1),new Set(locationUpdates.map(match=>String(match[3]).trim().toLowerCase())).size);provided.add('sites');}
 }else{
  const cameraCount=normalized.match(/(\d+)\s*(additional\s+|extra\s+|more\s+)?(?:(?:cctv|security)\s+)?cameras?\b/);
  if(cameraCount){
   const count=Number(cameraCount[1]);
   details.cameraCount=cameraCount[2]?Number(previous.cameraCount||0)+count:count;
   details.locations=locations.map(location=>({...location,cameraCount:null}));known.add('cameraCount');
  }else {
   const answer=cameraCountAnswer(normalized,pending);
   if(answer!==null){details.cameraCount=answer;details.locations=locations.map(location=>({...location,cameraCount:null}));known.add('cameraCount');}
   else {details.cameraCount=previous.cameraCount||0;details.locations=locations;}
  }
 }
 if(details.cameraCount<0||details.cameraCount>10000)throw new AppError('Camera count is outside supported limits.');
 if(provided.has('needs')&&!details.needs.includes('cctv')){details.cameraCount=0;details.locations=[];known.delete('cameraCount');known.delete('locations');}
 if(!details.needs.includes('mobile'))details.mobileLines=0;
 if(!details.needs.includes('email'))details.emailAccounts=0;
 if(/postpaid/.test(normalized))details.mobilePlanType='postpaid';else details.mobilePlanType=previous.mobilePlanType||null;
 for(const k of ['city','gstStatus','currentTools'])if(!provided.has(k))details[k]=previous[k]??(k==='gstStatus'?'unknown':'');
 if(!/5g|air\s*fiber|fibre|fiber/.test(normalized))details.internetPreference=previous.internetPreference||'any';
 const budget=normalized.match(/(?:budget|बजट)\s*(?:is|of|to|है|:)?\s*(?:₹|rs\.?|inr)?\s*([\d,]+)/)
  ||normalized.match(/(?:₹|rs\.?|inr)\s*([\d,]+)\s*(?:monthly\s+)?budget\b/i);
 if(budget){details.budget=Number(budget[1].replace(/,/g,''));provided.add('budget');}
 const segment=[['prof',/क्लिनिक|कार्यालय|ऑफ़िस/],['micro',/किराना|दुकान|सैलून|\bkirana\b/],['multi',/बहु.?स्थान/],['mfg',/कारखाना|फैक्टरी/]].find(([,re])=>re.test(normalized));if(segment){details.segment=segment[0];provided.add('segment');}
 const forgetBudget=/(?:clear|remove|unset)\s+(?:my\s+|the\s+)?(?:monthly\s+)?budget|(?:no|unknown)\s+(?:monthly\s+)?budget|budget\s*(?:is\s+)?(?:unknown|not decided)/.test(normalized);
 if(forgetBudget){known.delete('budget');provided.delete('budget');details.budget=1;}
 for(const k of provided)known.add(k);
 details.knownFields=[...known];
 const values=Object.fromEntries(['segment','employees','sites','cityTier','budget','needs'].filter(k=>provided.has(k)).map(k=>[k,details[k]]));
 // Internal placeholders keep the existing rule engine compatible; public unknowns stay null.
 if(!details.needs.length){values.needs=['internet'];details.knownFields=details.knownFields.filter(k=>k!=='needs');}
 const next=profile({...business,...values,...(forgetBudget?{budget:1}:{}),currentTools:details.currentTools});
 return {profile:next,details};
}
export function publicRequirements(state={}){
 const d=state.details||{},p=state.profile||{},known=new Set(d.knownFields||[]),value=k=>known.has(k)?p[k]??d[k]??null:null;
 return {business_name:state.form?.businessName||null,current_tools:value('currentTools'),business_type:value('segment'),business_location:value('city'),city_tier:value('cityTier'),employee_count:value('employees'),site_count:value('sites'),locations:known.has('locations')?(d.locations||[]).map(location=>({name:location.name,camera_count:location.cameraCount})):null,internet_required:known.has('needs')?(d.needs||p.needs||[]).includes('internet'):null,mobile_sim_count:known.has('mobileLines')?d.mobileLines:null,mobile_plan_type:d.mobilePlanType||null,camera_count:known.has('cameraCount')?d.cameraCount:null,gstin_status:d.gstStatus||'unknown',budget:value('budget'),requested_services:known.has('needs')?d.needs||p.needs||[]:[],selected_products:state.selectedProducts||[],optional_recommendations:[]};
}
