import {existsSync,readFileSync,appendFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
if(existsSync('.env'))process.loadEnvFile('.env');
let additions='';
if(!process.env.KYC_ENCRYPTION_KEY)additions+='\nKYC_ENCRYPTION_KEY='+randomBytes(32).toString('base64')+'\n';
if(!process.env.KYC_REVIEWER_TOKEN)additions+='KYC_REVIEWER_TOKEN='+randomBytes(32).toString('hex')+'\n';
if(additions)appendFileSync('.env',additions);console.log('KYC encryption and reviewer settings are ready in ignored .env. No credentials displayed.');
