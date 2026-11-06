const average = numbers => numbers.length ? numbers.reduce((a,b)=>a+b,0)/numbers.length : null;
const rate = (n,d) => d ? Number((100*n/d).toFixed(2)) : null;
const rounded = n => n === null ? null : Number(n.toFixed(2));
const median = numbers => { const a=[...numbers].sort((a,b)=>a-b),m=Math.floor(a.length/2); return a.length ? a.length%2?a[m]:(a[m-1]+a[m])/2 : null; };
import { eligibility } from './catalogue.mjs';
export function analyzeLeads(rows){
  const activated=rows.filter(r=>r.outcome==='Activated');
  const summarize=group=>{
    const active=group.filter(r=>r.outcome==='Activated'),observed=active.filter(r=>['Y','N'].includes(r.churned_within_6_months));
    const cost=group.reduce((sum,r)=>sum+Number(r.acquisition_cost_inr||0),0);
    return {leads:group.length,activated:active.length,conversionPct:rate(active.length,group.length),averageActivationDays:rounded(average(active.map(r=>Number(r.days_lead_to_activation)))),medianMonthlyBundle:median(active.map(r=>Number(r.monthly_bundle_value_inr))),acquisitionSpend:cost,blendedCostPerActivation:active.length?rounded(cost/active.length):null,churnObserved:observed.length,churnPct:rate(observed.filter(r=>r.churned_within_6_months==='Y').length,observed.length)};
  };
  const stages=['Lead','Contacted','Needs assessed','Quote accepted','KYC complete','Activated'];
  return {source:'smb_leads.csv (synthetic, Apr-Jun 2026)',overall:summarize(rows),segments:Object.fromEntries([...new Set(rows.map(r=>r.segment))].sort().map(segment=>[segment,summarize(rows.filter(r=>r.segment===segment))])),funnel:stages.map((stage,i)=>({stage,count:rows.filter(r=>stages.indexOf(r.stage_reached)>=i).length})),topDropReasons:Object.entries(rows.filter(r=>r.outcome!=='Activated').reduce((counts,r)=>{const reason=r.drop_reason||'Unspecified';counts[reason]=(counts[reason]||0)+1;return counts;},{})).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([reason,count])=>({reason,count})),gstGroups:{registered:summarize(rows.filter(r=>r.has_gstin==='Y')),unregistered:summarize(rows.filter(r=>r.has_gstin!=='Y'))},averageFollowups:rounded(average(activated.map(r=>Number(r.customer_follow_up_calls)))),nps:activated.length?rounded(100*(activated.filter(r=>Number(r.nps_score)>=9).length-activated.filter(r=>Number(r.nps_score)<=6).length)/activated.length):null};
}

export function buildLeadQueue(rows, data, savedHandoffs=[]) {
  const products=data.products,byId=new Map(products.map(p=>[p.id,p])),handoffMap=new Map(savedHandoffs.map(h=>[h.leadId,h]));
  const stagePoints={'Lead':4,'Contacted':10,'Needs assessed':18,'Quote accepted':28,'KYC complete':36};
  return rows.filter(r=>r.outcome==='Dropped').map(r=>{
    const segments={'Micro retail & services':'micro','Professional offices':'prof','Small multi-site businesses':'multi','Small manufacturers':'mfg'};
    const leadProfile={segment:segments[r.segment]||'micro',employees:Number(r.employee_count||1),sites:Number(r.num_sites||1),cityTier:Number(r.city_tier||1),gstin:r.gstin||''};
    const eligible=products.filter(p=>!eligibility(p,leadProfile,data).length);
    const eligibleIds=new Set(eligible.map(p=>p.id));
    const eligibleProducts=eligible.filter(p=>!p.requiresOneOf.length||p.requiresOneOf.some(id=>eligibleIds.has(id)));
    const productsOfInterest=String(r.products_of_interest||'').split(';').filter(Boolean).map(id=>byId.get(id)).filter(Boolean);
    const estimatedMin=productsOfInterest.reduce((sum,p)=>sum+p.price*(p.unit==='per site'?Number(r.num_sites||1):['per user','per device'].includes(p.unit)?Number(r.employee_count||1):p.unit==='per line'?Math.min(Number(r.employee_count||1),2):1),0);
    const estimatedMax=productsOfInterest.reduce((sum,p)=>sum+p.maxPrice*(p.unit==='per site'?Number(r.num_sites||1):['per user','per device'].includes(p.unit)?Number(r.employee_count||1):p.unit==='per line'?Math.min(Number(r.employee_count||1),2):1),0);
    const reason=String(r.drop_reason||'No recorded reason'),stageScore=stagePoints[r.stage_reached]||0;
    const kyc=/document|paperwork|gst|udyam|signatory/i.test(reason),installation=/install|site not feasible|visit not scheduled/i.test(reason),commercial=/quote|price|competitor|wait/i.test(reason),recoverable=kyc||installation||commercial||/owner had no time/i.test(reason);
    const sizeScore=Number(r.num_sites||0)>=3?15:0,valueScore=estimatedMin>=20000?20:estimatedMin>=10000?14:estimatedMin>=5000?8:0;
    const segmentScore=({ 'Professional offices':5,'Small multi-site businesses':5,'Small manufacturers':3,'Micro retail & services':2 })[r.segment]||0,intentScore=productsOfInterest.length?5:0;
    const score=Math.min(100,stageScore+(recoverable?25:0)+sizeScore+valueScore+segmentScore+intentScore+(r.has_gstin==='Y'?5:0));
    const factors=[];
    if(stageScore)factors.push(`${r.stage_reached} stage (+${stageScore})`);
    if(recoverable)factors.push(`Potentially recoverable blocker (+25)`);
    if(sizeScore)factors.push(`${r.num_sites} sites (+15)`);
    if(segmentScore)factors.push(`${r.segment} pilot fit (+${segmentScore})`);
    if(intentScore)factors.push(`Recorded product interest (+${intentScore})`);
    if(valueScore)factors.push(`Estimated catalogue interest ₹${estimatedMin.toLocaleString('en-IN')}–₹${estimatedMax.toLocaleString('en-IN')}/month (+${valueScore})`);
    if(r.has_gstin==='Y')factors.push('GSTIN recorded (+5)');
    if(!factors.length)factors.push('Early-stage lead; limited qualification data');
    const saved=handoffMap.get(r.lead_id);
    const unmetInterests=productsOfInterest.filter(p=>!eligibleProducts.some(x=>x.id===p.id)).map(p=>p.name);
    return {leadId:r.lead_id,stage:r.stage_reached,quoteState:r.stage_reached==='Quote accepted'?'Quote accepted':r.stage_reached==='KYC complete'?'KYC in progress':'No accepted quote',segment:r.segment,city:r.city,cityTier:Number(r.city_tier||0),employees:Number(r.employee_count||0),sites:Number(r.num_sites||0),source:r.lead_source,currentInternet:r.current_internet,productsOfInterest:productsOfInterest.map(p=>p.name),eligibleProducts:eligibleProducts.map(p=>p.name),unmetInterests,estimatedMin,estimatedMax,dropReason:reason,priorityScore:score,priority:score>=65?'High':score>=40?'Medium':'Low',priorityFactors:factors,handoffStatus:saved?.status||'not_queued',handedOffAt:saved?.createdAt||null};
  }).sort((a,b)=>b.priorityScore-a.priorityScore||a.leadId.localeCompare(b.leadId));
}
