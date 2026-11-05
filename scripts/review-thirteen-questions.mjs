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
 {name:'1 Basic business understanding',check:r=>r.proposedProfile.segment==='micro'&&r.proposedProfile.employees===5&&r.reply.split(/\s+/).length>20,text:'I own a small retail shop in Vijayawada. I have five employees. What solutions would you recommend for my business?'},
 {name:'2 Internet CCTV billing',check:r=>['P01','P19','P23'].every(id=>r.quote?.items.some(x=>x.productId===id))&&/CCTV/.test(r.reply),text:'I need internet connectivity for my shop, CCTV cameras and a billing system. What should I purchase?'},
 {name:'3 No GSTIN services',check:r=>/^Yes/.test(r.reply)&&/Other products/.test(r.reply),text:"I run a small shop, but I don't have a GSTIN. Can I still purchase your business services?"},
 {name:'4 No GSTIN package',check:r=>/^Yes/.test(r.reply)&&/Other products/.test(r.reply),text:"I don't have GSTIN. Can you recommend a suitable package for my business?"},
 {name:'5 Tier 2 Fibre 1G',check:r=>!r.quote&&r.warnings.some(w=>/city tier/.test(w)),text:'I operate my business in a Tier-2 city. Can I get Biz Fibre 1G?'},
 {name:'6 Separate failover',check:r=>!r.quote&&r.warnings.some(w=>/needs one of/.test(w)),text:"I want P09 failover, but I don't currently have a fibre or leased-line connection. Can I purchase it separately?"},
 {name:'7 Two office SD-WAN',check:r=>!r.quote&&r.warnings.some(w=>/3 locations/.test(w)),text:'I have two office locations. Can I purchase SD-WAN?'},
 {name:'8 Budget 2000',check:r=>r.proposedProfile.budget===2000&&r.reply.includes('?'),text:'My monthly budget is ₹2,000. Suggest the best suitable business package.'},
 {name:'9 Internet five SIMs',text:'I need internet and five mobile connections for my business. Can you recommend a bundle?',check:r=>r.quote?.items.some(x=>x.productId==='P07'&&x.quantity===5)&&r.reply.includes('5')},
 {name:'10 Add three SIMs',text:'Initially, I needed internet for five employees. Now I also need three additional SIM connections. Update my recommendation.',check:r=>r.proposedProfile.employees===5&&r.quote?.items.some(x=>x.productId==='P07'&&x.quantity===3)},
 {name:'11 Internet guarantee',text:'Can you guarantee that your internet will never go down?',check:r=>/^No internet service/.test(r.reply)&&/backup/.test(r.reply)},
 {name:'12 Outside catalogue',text:'I want a product that is not available in your catalogue. Can you arrange it?',check:r=>/can’t promise/.test(r.reply)&&/functionality/.test(r.reply)},
 {name:'13 Exact price taxes installation',text:'Tell me the exact monthly price, including taxes and installation charges.',check:r=>/does not provide tax rules/.test(r.reply)&&/cannot confirm/.test(r.reply)}
];
const target=process.env.REVIEW_CASE;
const records=target&&existsSync('reports/advisor-thirteen-questions-review.json')?JSON.parse(readFileSync('reports/advisor-thirteen-questions-review.json','utf8')).records:[];
for(const test of scenarios){
 if(target&&!target.split('|').includes(test.name))continue;
 const b=test.p||base;
 const state={};
 const messages=[{role:'user',content:test.text}];
 let r,start=Date.now(),retries=0;
 do{
  r=await advisor(config,b,messages,recommend(b,data),data,state);
  if(r.fallbackReason!=='AI_RATE_LIMIT'||retries++>=2)break;
  console.log(JSON.stringify({case:test.name,status:'waiting for Groq rate limit reset'}));
  await new Promise(resolve=>setTimeout(resolve,55000));
 }while(true);
 const passed=r.mode==='ai'&&test.check(r);
 const record={case:test.name,passed,mode:r.mode,error:r.fallbackReason,input:test.text,reply:r.reply,replySource:r.replySource,seconds:Math.round((Date.now()-start)/100)/10,products:r.quote?.items.map(x=>({id:x.productId,quantity:x.quantity})),monthly:r.quote?.monthly,monthlyMax:r.quote?.monthlyMax,warnings:r.warnings,proceed:r.proceed};
 const prior=records.findIndex(x=>x.case===record.case);if(prior>=0)records[prior]=record;else records.push(record);console.log(JSON.stringify(record));
 if(test.discovery&&r.mode==='ai')discovery={p:r.proposedProfile,state:r.conversationState,messages:[...messages,{role:'assistant',content:r.reply}]};
 mkdirSync('reports',{recursive:true});writeFileSync('reports/advisor-thirteen-questions-review.json',JSON.stringify({provider:'groq',model:config.model,checkedAt:new Date().toISOString(),records},null,2));
}
console.log(JSON.stringify({passed:records.filter(x=>x.passed).length,total:records.length}));
