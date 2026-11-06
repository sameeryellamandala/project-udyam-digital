import test from 'node:test';
import assert from 'node:assert/strict';
import {socialReply} from '../src/advisor-social.mjs';
import {runAdvisorFlow} from '../src/advisor-flow.mjs';
import {conversationAdvisor} from '../src/conversation-advisor.mjs';
import {blankProfile,freshMemory} from '../src/conversation-memory.mjs';
import {loadData} from '../src/catalogue.mjs';
const data=loadData('YTL_TrackA_Udyam_Digital_Data');
test('thanks and greetings preserve unfinished SIM requirements without discovery questions',async()=>{
 const state={...freshMemory(),profile:blankProfile('en'),details:{knownFields:['employees','needs'],employees:5,needs:['internet','mobile'],mobileLines:3},awaitingQuestion:'How many business locations do you have?'};
 for(const message of ['okk thanks for helping','Thanks!','Thank you for your help.','Hii ADVISOR','hello','bye']){
  const result=await runAdvisorFlow({},blankProfile('en'),[{role:'user',content:message}],data,state,{structured:()=>{throw new Error('Social turns must not invoke extraction.');}});
  assert.deepEqual(result.conversationState,state);assert.equal(result.proposedProfile,undefined);assert.equal(result.proceed,false);assert.doesNotMatch(result.reply,/SIM|locations|package|requirements/);
  if(/thank/i.test(message))assert.doesNotMatch(result.reply,/\?/);
  for(const config of [{},{apiKey:'test'}]){const r=await conversationAdvisor(config,state,[{role:'user',content:message}],data);assert.deepEqual(r.conversationState,state);assert.equal(r.mode,config.apiKey?'ai':'guided');}
 }
});
test('courtesy followed by a real change is not swallowed',()=>{
 for(const text of ['Thanks, add three more SIMs','Hi, I run a retail store','Thank you, can you explain fibre?','Thanks but remove CCTV'])assert.equal(socialReply(text),null);
 assert.ok(socialReply('धन्यवाद','hi'));
});
