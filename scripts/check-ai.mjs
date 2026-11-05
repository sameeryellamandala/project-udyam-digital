import {existsSync,writeFileSync,mkdirSync} from 'node:fs';
import {aiConfig} from '../src/ai-config.mjs';
import {conversationAdvisor} from '../src/conversation-advisor.mjs';
import {freshMemory,publicRequirements} from '../src/conversation-memory.mjs';
import {loadData,profile} from '../src/catalogue.mjs';
if(existsSync('.env'))process.loadEnvFile('.env');
const config=aiConfig();
if(process.argv[2]&&!['en','hi','question'].includes(process.argv[2]))throw new Error('Choose en, hi or question.');
if(!config.apiKey){console.error('No key configured for the selected provider.');process.exit(1);}
const data=loadData('YTL_TrackA_Udyam_Digital_Data'),results=[];
for(const [language,message] of [['en','I run a clinic with 8 employees, one location, Tier 1. My monthly budget is 2100 rupees. I need internet and work email.'],['hi','मैं क्लिनिक चलाता हूँ। 8 कर्मचारी हैं, 1 स्थान है, Tier 1 है। बजट 2100 रुपये है। इंटरनेट और ईमेल चाहिए।']].filter(([language])=>!process.argv[2]||process.argv[2]===language)){
  const result=await conversationAdvisor(config,freshMemory(),[{role:'user',content:message}],data,language);
  const requirements=publicRequirements(result.conversationState||{});
  const validRequirements=requirements.business_type==='prof'&&requirements.employee_count===8&&requirements.site_count===1&&requirements.city_tier===1&&requirements.budget===2100&&requirements.requested_services.includes('internet')&&requirements.requested_services.includes('email');
  const passed=result.mode==='ai'&&validRequirements&&!!result.reply&&(language!=='hi'||/[\u0900-\u097f]/.test(result.reply));
  results.push({language,scenario:'explicit requirements',passed,mode:result.mode,validRequirements,fallbackReason:result.fallbackReason});
  console.log(JSON.stringify(results.at(-1)));
}
if(!process.argv[2]||process.argv[2]==='question'){
 const state={...freshMemory(),profile:profile({businessName:'Synthetic Shop',segment:'micro',employees:3,sites:1,cityTier:1,budget:3000,needs:['pos'],language:'en'}),details:{...freshMemory().details,knownFields:['segment','employees','sites','cityTier','budget','needs'],needs:['pos']}};
 const before=JSON.stringify(publicRequirements(state));
 const result=await conversationAdvisor(config,state,[{role:'user',content:'What internet and work email services would suit an office with five people? This is a general question; keep my current selection.'}],data,'en');
 const preservesRequirements=JSON.stringify(publicRequirements(result.conversationState||{}))===before;
 const relevantAnswer=/Cloud Email|email/i.test(result.reply||'')&&/Fibre|internet/i.test(result.reply||'');
 results.push({language:'en',scenario:'general question with unrelated selection',passed:result.mode==='ai'&&preservesRequirements&&relevantAnswer,mode:result.mode,preservesRequirements,relevantAnswer,fallbackReason:result.fallbackReason});
 console.log(JSON.stringify(results.at(-1)));
}
mkdirSync('reports',{recursive:true});
writeFileSync(`reports/live-ai-check${process.argv[2]?'-'+process.argv[2]:''}.json`,JSON.stringify({provider:config.provider,model:config.model,checkedAt:new Date().toISOString(),syntheticInputsOnly:true,results},null,2)+'\n');
if(results.some(r=>!r.passed))process.exitCode=1;
