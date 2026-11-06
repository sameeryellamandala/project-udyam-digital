// Merge only location facts stated in the current turn. Pricing stays in catalogue.mjs.
export function missingLocationQuestion(business){
  const rows=business.locations||[],hi=business.language==='hi';
  const tier=rows.find(location=>location.cityTier===null);
  if(tier)return hi?`${tier.name} का शहर Tier 1 है या Tier 2?`:`Is ${tier.name} in Tier 1 or Tier 2?`;
  const cameras=business.needs.includes('cctv')&&rows.find(location=>location.cameraCount===null);
  if(cameras)return hi?`${cameras.name} में कितने कैमरे चाहिए? वहाँ कैमरे नहीं चाहिए तो 0 बताएँ।`:`How many cameras do you need at ${cameras.name}? Enter 0 if none are needed there.`;
  return '';
}

export function mergeBranchDetails(business,previous,incoming,message,provided,pending=''){
  const text=String(message).toLowerCase().replace(/\b(?:first|1st)\s+(?:branch|location|site)\b/g,'branch 1').replace(/\b(?:second|2nd|another)\s+(?:branch|location|site)\b/g,'branch 2');
  const existing=business.locations||previous.locations?.filter(location=>Object.hasOwn(location,'cityTier'))||[];
  const tierUpdates=[...text.matchAll(/\b(?:branch|location|site)\s*(\d+)\s*(?:is|in|at|to|:|-)?\s*(?:a\s+)?tier\s*([12])\b/g)];
  const namedTiers=[...text.matchAll(/\b([a-z][a-z .'-]{0,35}?)\s+(?:branch|location|site)\s*(?:is|in|at|to|:|-)?\s*tier\s*([12])\b/g)];
  const eachCamera=text.match(/(\d+)\s*(?:(?:cctv|security)\s+)?cameras?\s+(?:at|in|for)\s+(?:each|every)\s+(?:branch|location|site)/);
  const modelUpdates=provided.has('locations')&&Array.isArray(incoming.locations)?incoming.locations.filter(location=>{
    return typeof location.name==='string'&&text.includes(location.name.toLowerCase())&&!/^(?:each|every)\b/i.test(location.name);
  }):[];
  if(!existing.length&&!tierUpdates.length&&!namedTiers.length&&!eachCamera&&!modelUpdates.length)return null;
  const sites=Math.max(incoming.sites||business.sites||1,...tierUpdates.map(match=>Number(match[1])));
  if(!Number.isInteger(sites)||sites<1||sites>1000)return null;
  const defaultTier=(previous.knownFields||[]).includes('cityTier')?business.cityTier:null;
  const rows=Array.from({length:sites},(_,index)=>({...existing[index],id:existing[index]?.id||'branch-'+(index+1),
    name:existing[index]?.name||'Branch '+(index+1),city:existing[index]?.city||'',
    cityTier:existing[index]?existing[index].cityTier:(existing.length?null:defaultTier),cameraCount:existing[index]?.cameraCount??null}));
  const findLocation=name=>{
    const number=name.match(/^(?:branch|location|site)\s*(\d+)$/i);
    if(number)return rows[Number(number[1])-1];
    const normalized=value=>value.toLowerCase().replace(/\s+(?:branch|location|site)$/,'');
    return rows.find(location=>[location.name,location.city].some(value=>normalized(value)===normalized(name)));
  };
  const updateNamed=(name,tier,city,cameras)=>{
    let row=findLocation(name);
    if(!row)row=rows.find(location=>/^Branch \d+$/.test(location.name)&&!location.city);
    if(!row)return;
    if(/^Branch \d+$/.test(row.name)&&!/^(?:branch|location|site)\s*\d+$/i.test(name))row.name=name;
    if(city&&text.includes(city.toLowerCase()))row.city=city;
    if(tier===1||tier===2)row.cityTier=tier;
    if(Number.isInteger(cameras)&&cameras>=0&&/cameras?|कैमर/.test(text)){
      if(cameras>0&&new RegExp('\\b'+cameras+'\\b').test(text)||cameras===0&&/(?:no|zero|0)\s*cameras?/.test(text))row.cameraCount=cameras;
    }
  };
  for(const location of modelUpdates)updateNamed(location.name,location.cityTier,location.city,location.cameraCount);
  for(const match of namedTiers)updateNamed(match[1].trim().replace(/^(?:(?:and|the|my|our|change|set|update|make)\s+)+/,'').replace(/\b[a-z]/g,c=>c.toUpperCase()),Number(match[2]));
  for(const match of tierUpdates)rows[Number(match[1])-1].cityTier=Number(match[2]);
  if(!tierUpdates.length&&!namedTiers.length&&!modelUpdates.some(location=>[1,2].includes(location.cityTier))&&provided.has('cityTier')){
    const target=rows.find(location=>pending.toLowerCase().includes(location.name.toLowerCase()));
    const targets=target&&!/\b(?:all|both|each|every|same)\b/.test(text)?[target]:rows;
    for(const row of targets)if(!existing.length||row.cityTier===null||target===row||/\b(?:all|both|each|every|same)\b/.test(text))row.cityTier=incoming.cityTier;
  }
  if(eachCamera){
    const count=Number(eachCamera[1]);
    for(const row of rows)row.cameraCount=count;
  }else{
    const updates=[...text.matchAll(/(\d+)\s*(additional\s+|extra\s+|more\s+)?(?:(?:cctv|security)\s+)?cameras?\s+(?:at|in|for)\s+([a-z][a-z0-9 .'-]{0,40}?)(?=\s*[,;.!?]|\s+and\s+\d+\b|$)/g)];
    for(const match of updates){
      const row=findLocation(match[3].trim());
      if(row)row.cameraCount=Number(match[1])+(match[2]?Number(existing.find(location=>location.id===row.id)?.cameraCount||0):0);
    }
    const shortAnswer=text.trim().match(/^\d+[.!]?$/);
    const cameraTarget=rows.find(location=>/cameras?|कैमर/.test(pending)&&pending.toLowerCase().includes(location.name.toLowerCase()));
    if(shortAnswer&&cameraTarget)cameraTarget.cameraCount=Number(shortAnswer[0].replace(/[.!]$/,''));
    if(provided.has('cameraCount')&&!updates.length&&!modelUpdates.some(location=>location.cameraCount>0)&&!cameraTarget&&/cameras?/.test(text)){
      if(rows.length===1)rows[0].cameraCount=incoming.cameraCount;
      else if(rows.every(location=>location.cameraCount!==null)&&rows.reduce((sum,location)=>sum+location.cameraCount,0)!==incoming.cameraCount){
        // A new total does not specify a split across locations.
        for(const row of rows)row.cameraCount=null;
      }
    }
  }
  if(!incoming.needs.includes('cctv'))for(const row of rows)row.cameraCount=null;
  return rows;
}
