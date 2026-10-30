const average = numbers => numbers.length ? numbers.reduce((a,b)=>a+b,0)/numbers.length : null;
const rate = (n,d) => d ? Number((100*n/d).toFixed(2)) : null;
const rounded = n => n === null ? null : Number(n.toFixed(2));
const median = numbers => { const a=[...numbers].sort((a,b)=>a-b),m=Math.floor(a.length/2); return a.length ? a.length%2?a[m]:(a[m-1]+a[m])/2 : null; };
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
