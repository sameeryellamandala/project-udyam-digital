import {Annotation,END,START,StateGraph} from '@langchain/langgraph';
import {extractAdvisorRequirements,runAdvisorFlow} from './advisor-flow.mjs';
import {ambiguous} from './conversation-memory.mjs';
import {socialReply} from './advisor-social.mjs';

// The graph is deliberately a single-pass workflow. PostgreSQL owns durable
// memory; LangGraph only coordinates one turn and never loops autonomously.
const TurnState=Annotation.Root({
  input:Annotation(),
  turn:Annotation(),
  extraction:Annotation(),
  result:Annotation()
});

const workflow=new StateGraph(TurnState)
  .addNode('retrieve_session_context',async({input})=>({turn:{...input,journeyContext:input.journeyContext||{}}}))
  .addNode('extract_customer_requirements',async({turn})=>{
    const latest=turn.messages.filter(message=>message.role==='user').at(-1)?.content||'';
    if(socialReply(latest,turn.business.language)||turn.previous.memoryVersion===1&&(ambiguous(latest)||/show.*previous.*recommendation|continue.*previous.*discussion/i.test(latest)))return {extraction:null};
    return {extraction:await extractAdvisorRequirements(turn.config,turn.business,turn.messages,turn.data,turn.previous,turn.api)};
  })
  .addNode('merge_validate_and_respond',async({turn,extraction})=>({result:await runAdvisorFlow(
    turn.config,turn.business,turn.messages,turn.data,turn.previous,turn.api,turn.journeyContext,extraction
  )}))
  .addNode('finalize_response',async({result})=>{
    if(!result||typeof result.reply!=='string')throw new Error('Advisor workflow returned no response.');
    return {result};
  })
  .addEdge(START,'retrieve_session_context')
  .addEdge('retrieve_session_context','extract_customer_requirements')
  .addEdge('extract_customer_requirements','merge_validate_and_respond')
  .addEdge('merge_validate_and_respond','finalize_response')
  .addEdge('finalize_response',END)
  .compile();

export async function runAdvisorGraph(input){
  const state=await workflow.invoke({input});
  return state.result;
}
