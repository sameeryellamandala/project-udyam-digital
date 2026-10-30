import {existsSync,writeFileSync,mkdirSync} from 'node:fs';
import {aiConfig} from '../src/ai-config.mjs';
import {advisor} from '../src/ai.mjs';
import {loadData,profile,recommend} from '../src/catalogue.mjs';
if(existsSync('.env'))process.loadEnvFile('.env');
const config=aiConfig();
if(!config.apiKey){console.error('No key configured for the selected provider.');process.exit(1);}
const data=loadData('YTL_TrackA_Udyam_Digital_Data'),results=[];
for(const [language,message] of [['en','I run a clinic with 8 employees. I need internet and email within a monthly budget of 2100 rupees. Explain a suitable package.'],['hi','मेरे क्लिनिक में 8 कर्मचारी हैं। इंटरनेट और ईमेल चाहिए। मासिक बजट 2100 रुपये है। सरल हिंदी में समझाइए।']].filter(([language])=>!process.argv[2]||process.argv[2]===language)){
  const p=profile({businessName:'Synthetic Test Clinic',segment:'prof',employees:8,sites:1,cityTier:1,budget:2100,needs:['internet','email'],language});
  const result=await advisor(config,p,[{role:'user',content:message}],recommend(p,data),data);
  let validProfile=false;try{if(result.proposedProfile){profile(result.proposedProfile);validProfile=true;}}catch{}
  const passed=result.mode==='ai'&&validProfile&&!!result.reply&&(language!=='hi'||/[\u0900-\u097f]/.test(result.reply));
  results.push({language,passed,mode:result.mode,validProfile,reply:result.reply,fallbackReason:result.fallbackReason});
  console.log(JSON.stringify({language,passed,mode:result.mode,validProfile,fallbackReason:result.fallbackReason}));
}
mkdirSync('reports',{recursive:true});
writeFileSync(`reports/live-ai-check${process.argv[2]?'-'+process.argv[2]:''}.json`,JSON.stringify({provider:config.provider,model:config.model,checkedAt:new Date().toISOString(),syntheticInputsOnly:true,results},null,2)+'\n');
if(results.some(r=>!r.passed))process.exitCode=1;
