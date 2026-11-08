import test from 'node:test';
import assert from 'node:assert/strict';
import {profile} from '../src/catalogue.mjs';
import {translateMessage} from '../public/locale.js';
import {regionalLocales} from '../public/regional-locales.js';
import {wireVoiceInput,stopVoiceInput} from '../public/voice-input.js';

test('all seven supported language codes survive backend normalization',()=>{
 for(const language of ['en','hi','te','ta','kn','ml','mr'])assert.equal(profile({businessName:'Demo',segment:'prof',needs:['internet'],sites:1,employees:4,cityTier:2,budget:2000,language}).language,language);
 assert.equal(profile({businessName:'Demo',segment:'prof',needs:['internet'],sites:1,employees:4,cityTier:2,budget:2000,language:'unknown'}).language,'en');
});

test('regional dictionaries include every original UI key and translate Send',()=>{
 const expected=Object.keys(regionalLocales.te).sort();
 for(const language of ['te','ta','kn','ml','mr']){
  assert.deepEqual(Object.keys(regionalLocales[language]).sort(),expected);
  assert.notEqual(translateMessage('Send',language),'Send');
  assert.equal(translateMessage('<untrusted user value>',language),'<untrusted user value>');
 }
});

test('voice typing uses selected locale, preserves typed text and never submits',()=>{
 const previousWindow=globalThis.window,previousDocument=globalThis.document;
 let instance,draft='',submitted=false;
 const button={setAttribute(){},textContent:'',disabled:false},input={value:'Existing draft'},status={classList:{remove(){}},textContent:''};
 class Recognition{constructor(){instance=this;}start(){this.onstart();}abort(){this.onend();}}
 try{
  globalThis.window={SpeechRecognition:Recognition,isSecureContext:true};
  globalThis.document={querySelector:s=>({'#voice-input':button,'#message':input,'#voice-input-status':status})[s],requestSubmit(){submitted=true;}};
  wireVoiceInput({language:'te',onDraft:text=>draft=text});button.onclick();
  assert.equal(instance.lang,'te-IN');
  const result=[{transcript:'నాకు ఇంటర్నెట్ కావాలి'}];result.isFinal=true;
  instance.onresult({resultIndex:0,results:[result]});
  assert.equal(input.value,'Existing draft నాకు ఇంటర్నెట్ కావాలి ');assert.equal(draft,input.value);assert.equal(submitted,false);
  stopVoiceInput();assert.equal(button.textContent,'🎤');
  delete window.SpeechRecognition;wireVoiceInput({language:'ta',onDraft(){}});assert.equal(button.disabled,true);
 }finally{globalThis.window=previousWindow;globalThis.document=previousDocument;}
});
import {conversationAdvisor} from '../src/conversation-advisor.mjs';
import {loadData} from '../src/catalogue.mjs';
const catalogue=loadData('YTL_TrackA_Udyam_Digital_Data');
const provider={provider:'groq',apiKey:'test',model:'test'};
const response=reply=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({reply})}}]});

test('native customer text is normalized and social replies preserve saved requirements',async t=>{
 const calls=[];const saved={profile:{budget:3000},details:{mobileLines:3},lastRecommendation:'Saved package'};
 t.mock.method(globalThis,'fetch',async(url,init)=>{const name=JSON.parse(init.body).response_format.json_schema.name;calls.push(name);return response(name==='advisor_input_translation'?'thanks':'ధన్యవాదాలు!');});
 const result=await conversationAdvisor(provider,saved,[{role:'user',content:'ధన్యవాదాలు'}],catalogue,'te');
 assert.equal(result.reply,'ధన్యవాదాలు!');assert.equal(result.conversationState.profile.budget,3000);
 assert.equal(result.conversationState.details.mobileLines,3);assert.equal(result.conversationState.lastRecommendation,'Saved package');
 assert.deepEqual(calls,['advisor_input_translation','advisor_localization']);
});

test('a translation that invents a numeric fact is discarded',async t=>{
 t.mock.method(globalThis,'fetch',async()=>response('ధన్యవాదాలు ₹99999'));
 const result=await conversationAdvisor(provider,{profile:{},details:{}},[{role:'user',content:'thanks'}],catalogue,'te');
 assert.ok(!result.reply.includes('99999'));
});
