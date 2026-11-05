import {existsSync} from 'node:fs';
import {createConversationStore} from '../src/conversation-store.mjs';
if(existsSync('.env'))process.loadEnvFile('.env');
if(!process.env.DATABASE_URL){console.error('Set DATABASE_URL in .env first.');process.exit(1);}
const store=createConversationStore(process.env.DATABASE_URL);
try{await store.migrate();console.log('Conversation database migrations applied.');}catch{console.error('Migration failed. Check PostgreSQL availability and database settings.');process.exitCode=1;}finally{await store.close();}
