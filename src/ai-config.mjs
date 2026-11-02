import { AppError } from './catalogue.mjs';

export function aiConfig(env=process.env, overrides={}) {
  const provider=overrides.provider || env.AI_PROVIDER || 'groq';
  if(!['groq','openai','ollama'].includes(provider))throw new AppError('AI_PROVIDER must be groq, openai or ollama.');
  return {provider,baseUrl:'http://127.0.0.1:11434',apiKey:provider==='ollama'?'local':overrides.apiKey ?? (provider==='groq'?env.GROQ_API_KEY:env.OPENAI_API_KEY) ?? '',model:overrides.model || (provider==='ollama'?env.OLLAMA_MODEL:provider==='groq'?env.GROQ_MODEL:env.OPENAI_MODEL) || (provider==='ollama'?(env.OLLAMA_MODEL||'qwen3.5:4b'):provider==='groq'?'openai/gpt-oss-120b':'gpt-5.4-mini')};
}
