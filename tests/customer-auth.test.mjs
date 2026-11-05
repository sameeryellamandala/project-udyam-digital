import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,randomUUID,randomBytes} from 'node:crypto';
import {customerAuth} from '../src/customer-auth.mjs';
import {createApp} from '../server.mjs';
import {createStore} from '../src/store.mjs';
import {createKycStore} from '../src/kyc-store.mjs';
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const domain='test-auth.clerk.accounts.dev',origin='http://localhost:3000';
const config={publishableKey:'pk_test_'+Buffer.from(domain+'$').toString('base64').replace(/=+$/,''),jwtKey:publicKey.export({type:'spki',format:'pem'})};
function jwt(sub='user_A',overrides={}){const now=Math.floor(Date.now()/1000),a=Buffer.from(JSON.stringify({alg:'RS256',typ:'JWT',kid:'test-key'})).toString('base64url'),b=Buffer.from(JSON.stringify({sub,sid:'sess_test',iss:'https://'+domain,azp:origin,iat:now,nbf:now-5,exp:now+60,...overrides})).toString('base64url');return a+'.'+b+'.'+sign('RSA-SHA256',Buffer.from(a+'.'+b),privateKey).toString('base64url');}
test('customer sign-in is mandatory for setup, KYC and order creation; signed-in checkout succeeds',async t=>{
 const app=createApp({dbPath:':memory:',apiKey:'',clerk:config});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>{app.server.closeAllConnections();app.server.close();app.store.close();});
 const base='http://127.0.0.1:'+app.server.address().port,token=jwt('user_Checkout',{azp:base});
 const req=(path,input,signedIn=false)=>fetch(base+'/api'+path,{method:input?'POST':'GET',headers:{origin:base,'content-type':'application/json',...(signedIn?{authorization:'Bearer '+token}:{})},body:input?JSON.stringify(input):undefined});
 for(const path of ['/orders','/sessions','/kyc/cases'])assert.equal((await req(path)).status,401);
 for(const path of ['/orders','/recommend','/quote','/advisor','/verify'])assert.equal((await req(path,{})).status,401);
 assert.equal((await(await req('/auth/config')).json()).required,true);
 const profile={businessName:'Demo Signed In',segment:'prof',employees:5,sites:1,cityTier:1,budget:3000,needs:['internet']},contact={name:'Demo Owner',phone:'9876543210',address:'10 Demo Road, Demo City'};
 const checked=await(await req('/verify',{profile,contact,consent:true,documents:[]},true)).json();assert.ok(checked.id);
 const order=await req('/orders',{profile,contact,consent:true,items:[{productId:'P01',quantity:1}],verificationId:checked.id,requestKey:randomUUID()},true);assert.equal(order.status,201);
 const saved=await order.json();assert.equal((await(await req('/orders',undefined,true)).json()).orders[0].id,saved.id);
 assert.equal((await req('/orders/'+saved.id)).status,401);
});
test('Clerk session verification rejects altered, expired and wrong-origin/issuer tokens',async()=>{
 const auth=customerAuth(config),token=jwt();
 assert.ok((await auth.identity({headers:{authorization:'Bearer '+token}},origin)).owner);
 for(const invalid of [token.slice(0,-8)+'badbytes',jwt('user_A',{exp:1}),jwt('user_A',{azp:'https://evil.example'}),jwt('user_A',{iss:'https://other.clerk.accounts.dev'})])await assert.rejects(auth.identity({headers:{authorization:'Bearer '+invalid}},origin),e=>e.status===401);
 assert.equal(await auth.identity({headers:{}},origin),null);
 assert.equal(await auth.identity({headers:{cookie:'__session='+jwt('user_A',{exp:1})}},origin),null);
 assert.ok(!JSON.stringify(auth.publicConfig).includes('PRIVATE KEY'));
});
test('linking retains colliding guest orders and KYC access without extending document retention',async()=>{
 const store=createStore(':memory:'),kyc=createKycStore(store,randomBytes(32).toString('base64'));
 try{
  const guest=store.session(),account=store.accountSession('f'.repeat(64)),key=randomUUID();
  const c=await kyc.save(guest.hash,'',null,{contact:{}},[],{documents:[],status:'passed'},[]);
  const one=store.createOrder(guest.hash,key,{businessName:'Guest demo'}, {},{installDays:5},{status:'passed',caseId:c.id});
  const two=store.createOrder(account.hash,key,{businessName:'Account demo'}, {},{installDays:5},{status:'passed'});
  store.claimGuest(guest.hash,account.hash);store.claimGuest(guest.hash,account.hash);
  assert.deepEqual(new Set(store.orders(account.hash).map(x=>x.id)),new Set([one.id,two.id]));
  assert.equal(kyc.get(account.hash,c.id).id,c.id);assert.throws(()=>kyc.get(guest.hash,c.id),e=>e.status===404);
  store.db.prepare('UPDATE kyc_cases SET created_at=? WHERE id=?').run(new Date(Date.now()-8*86400000).toISOString(),c.id);
  store.accountSession(account.hash);kyc.cleanup();assert.throws(()=>kyc.get(account.hash,c.id),e=>e.status===404);
  assert.equal(store.orders(account.hash).length,2);
 }finally{store.close();}
});
test('account restores orders across browser cookies; explicit guest linking never exposes another account',async t=>{
 const app=createApp({dbPath:':memory:',apiKey:'',clerk:config,kycKey:randomBytes(32).toString('base64')});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>{app.server.closeAllConnections();app.server.close();app.store.close();});
 const base='http://127.0.0.1:'+app.server.address().port;
 const cookie=(await fetch(base+'/api/session')).headers.get('set-cookie').split(';')[0];
 const token=jwt('user_A',{azp:base}),otherToken=jwt('user_B',{azp:base});
 const req=(path,input,bearer,c=cookie)=>fetch(base+'/api'+path,{method:input?'POST':'GET',headers:{...(c?{cookie:c}:{}),...(bearer?{authorization:'Bearer '+bearer}:{}),origin:base,'content-type':'application/json'},body:input?JSON.stringify(input):undefined});
 const owner=app.store.session(cookie.split('=')[1]);
 const order=app.store.createOrder(owner.hash,randomUUID(),{businessName:'Synthetic account test'}, {},{installDays:5},{status:'passed'});
 assert.equal((await(await req('/orders',undefined,token)).json()).orders.length,0);
 assert.equal((await req('/auth/claim',{},undefined)).status,401);
 assert.equal((await req('/auth/claim',{},token)).status,200);
 assert.equal((await(await req('/orders',undefined,token,'')).json()).orders[0].id,order.id);
 assert.equal((await req('/orders')).status,401);
 assert.equal((await(await req('/orders',undefined,otherToken,'')).json()).orders.length,0);
 assert.equal((await req('/orders/'+order.id,undefined,otherToken,'')).status,404);
 assert.equal((await req('/orders/'+order.id)).status,401);
 assert.equal((await req('/orders',undefined,token.slice(0,-8)+'badbytes')).status,401);
 assert.equal((await req('/auth/claim',{},token)).status,200);
 assert.equal((await(await req('/orders',undefined,token)).json()).orders.length,1);
 const publicConfig=await(await req('/auth/config')).json();assert.equal(publicConfig.enabled,true);assert.ok(!('secretKey' in publicConfig));
});
