import {randomBytes} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
if(existsSync('.env'))process.loadEnvFile('.env');
if(process.env.DATABASE_URL){console.log('DATABASE_URL is already set. Existing database settings preserved.');process.exit(0);}
const password=randomBytes(24).toString('hex');mkdirSync('var',{recursive:true});
writeFileSync('var/postgres.env',`POSTGRES_USER=udyam\nPOSTGRES_DB=udyam\nPOSTGRES_PASSWORD=${password}\n`);
const r=spawnSync('docker',['run','--detach','--name','udyam-advisor-postgres','--publish','127.0.0.1:54329:5432','--env-file','var/postgres.env','--volume','udyam-advisor-postgres-data:/var/lib/postgresql/data','postgres:17-alpine'],{encoding:'utf8',windowsHide:true});
if(r.status!==0){console.error('Could not create the local PostgreSQL container. Check Docker and whether the container already exists.');process.exit(1);}
writeFileSync('.env',(existsSync('.env')?readFileSync('.env','utf8'):'')+`\nDATABASE_URL=postgresql://udyam:${password}@127.0.0.1:54329/udyam\n`);
console.log('Local PostgreSQL created with persistent storage. Credentials saved only in ignored local files.');
