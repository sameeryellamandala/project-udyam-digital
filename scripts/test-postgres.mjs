import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
if(existsSync('.env'))process.loadEnvFile('.env');
if(!process.env.TEST_DATABASE_URL&&!process.env.DATABASE_URL){console.error('Set TEST_DATABASE_URL to a PostgreSQL server where the test role can create temporary databases.');process.exit(1);}
const r=spawnSync(process.execPath,['--test','tests/conversations-postgres.test.mjs'],{stdio:'inherit',env:{...process.env,TEST_DATABASE_URL:process.env.TEST_DATABASE_URL||process.env.DATABASE_URL},windowsHide:true});process.exitCode=r.status||0;
