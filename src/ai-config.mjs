import { AppError } from './catalogue.mjs';

export function aiConfig(env=process.env, overrides={}) {
  const provider=overrides.provider || env.AI_PROVIDER || 'groq';
  if(!['groq','openai'].includes(provider))throw new AppError('AI_PROVIDER must be groq or openai.');
  return {provider,apiKey:overrides.apiKey ?? (provider==='groq'?env.GROQ_API_KEY:env.OPENAI_API_KEY) ?? '',model:overrides.model || (provider==='groq'?env.GROQ_MODEL:env.OPENAI_MODEL) || (provider==='groq'?'openai/gpt-oss-120b':'gpt-5.4-mini')};
}
