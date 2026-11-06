// Explicit live-provider review with fictional inputs. Run only for an authorized evaluation.
import {writeFileSync,mkdirSync,readFileSync,existsSync} from 'node:fs';
import {advisor} from '../src/ai.mjs';
import {aiConfig} from '../src/ai-config.mjs';
import {loadData,profile,recommend} from '../src/catalogue.mjs';
const data=loadData('YTL_TrackA_Udyam_Digital_Data'),config=aiConfig();
if(config.provider!=='groq'||!config.apiKey)throw new Error('Configure Groq before this live review.');
const base=profile({businessName:'Fictional Demo Clinic',segment:'prof',employees:8,sites:1,cityTier:2,budget:3000,needs:['internet','email']});
const known=['segment','city','employees','sites','cityTier','budget','needs','gstStatus'];
const memory=(b=base,extra={})=>({details:{knownFields:known,city:'Vijayawada',gstStatus:'no',mobileLines:0,emailAccounts:0,internetPreference:'any',...extra},items:recommend(b,data).quote?.items.map(x=>({productId:x.productId,quantity:x.quantity}))||[]});
let discovery={p:base,state:{},messages:[]};
const scenarios=[
 {name:'Greeting',text:'Hi advisor',discovery:true,check:r=>r.reply.includes('?')&&r.options.length===0&&r.conversationState.details.knownFields.length===0},
 {name:'Retail discovery',text:'I own a small retail shop.',discovery:true,check:r=>r.proposedProfile.segment==='micro'&&r.reply.includes('?')},
 {name:'City answer',text:'Vijayawada.',discovery:true,check:r=>r.conversationState.details.city.toLowerCase().includes('vijayawada')},
 {name:'Employee answer',text:'Five.',discovery:true,check:r=>r.proposedProfile.employees===5},
 {name:'No GST and real catalogue',text:'I run a clinic in Vijayawada, Tier 2, one location, 8 employees. I need internet and email. Budget 3000 rupees monthly. I have no GST registration.',state:{},check:r=>r.quote&&r.quote.items.every(x=>!data.products.find(p=>p.id===x.productId).requiresGst)&&r.options.length>0},
 {name:'Tier-2 Biz Fibre 1G restriction',text:'I want Biz Fibre 1G (P03) in my Tier-2 city.',check:r=>!r.quote&&r.warnings.some(x=>/tier/i.test(x))},
 {name:'P09 failover dependency',text:'I only want P09 failover. Do not include a base internet product.',check:r=>!r.quote&&r.warnings.some(x=>/needs one of/i.test(x))},
 {name:'Two-site SD-WAN restriction',p:profile({...base,sites:2}),text:'I have two office locations. Can I get Managed SD-WAN P10? I do not have GST.',check:r=>!r.quote&&r.warnings.some(x=>/3 locations/i.test(x))},
 {name:'Budget comparison',p:profile({...base,budget:2000,needs:['internet','pos','cctv']}),text:'Compare suitable packages for internet, billing POS and new CCTV for my clinic within 2000 rupees monthly.',check:r=>r.quote?.monthly<=2000&&r.options.length>0},
 {name:'Three additional SIMs',p:profile({...base,budget:6000,needs:['internet','email','mobile']}),extra:{mobileLines:2},text:'Actually, I need three additional SIM connections on top of my existing two work SIMs.',check:r=>r.quote?.items.find(x=>x.productId==='P07')?.quantity===5},
 {name:'5G choice preserves email',text:'I prefer the 5G AirFiber option. Keep email for all eight employees.',check:r=>r.quote?.items.some(x=>x.productId==='P04')&&r.quote?.items.some(x=>x.productId==='P16'&&x.quantity===8)},
 {name:'Confirmed quote handoff',text:'Yes, proceed with the recommended package and show me the quote.',check:r=>r.proceed===true&&!!r.quote}
];
const target=process.env.REVIEW_CASE;
const records=target&&existsSync('reports/advisor-guide-live-review.json')?JSON.parse(readFileSync('reports/advisor-guide-live-review.json','utf8')).records:[];
for(const test of scenarios){
 if(target&&!target.split('|').includes(test.name))continue;
 const b=test.discovery?discovery.p:test.p||base;
 const state=test.discovery?discovery.state:test.state||memory(b,test.extra);
 const messages=test.discovery?[...discovery.messages,{role:'user',content:test.text}]:[{role:'assistant',content:'Review the recommended package. Would you like to proceed or change your requirements?'},{role:'user',content:test.text}];
 let r,start=Date.now(),retries=0;
 do{
  r=await advisor(config,b,messages,recommend(b,data),data,state);
  if(r.fallbackReason!=='AI_RATE_LIMIT'||retries++>=2)break;
  console.log(JSON.stringify({case:test.name,status:'waiting for Groq rate limit reset'}));
  await new Promise(resolve=>setTimeout(resolve,55000));
 }while(true);
 const passed=r.mode==='ai'&&!!test.check(r);
 const record={case:test.name,passed,mode:r.mode,error:r.fallbackReason,input:test.text,reply:r.reply,replySource:r.replySource,seconds:Math.round((Date.now()-start)/100)/10,products:r.quote?.items.map(x=>({id:x.productId,quantity:x.quantity})),monthly:r.quote?.monthly,monthlyMax:r.quote?.monthlyMax,warnings:r.warnings,proceed:r.proceed};
 const prior=records.findIndex(x=>x.case===record.case);if(prior>=0)records[prior]=record;else records.push(record);console.log(JSON.stringify(record));
 if(test.discovery&&r.mode==='ai')discovery={p:r.proposedProfile,state:r.conversationState,messages:[...messages,{role:'assistant',content:r.reply}]};
 mkdirSync('reports',{recursive:true});writeFileSync('reports/advisor-guide-live-review.json',JSON.stringify({provider:'groq',model:config.model,checkedAt:new Date().toISOString(),records},null,2));
}
console.log(JSON.stringify({passed:records.filter(x=>x.passed).length,total:records.length}));
