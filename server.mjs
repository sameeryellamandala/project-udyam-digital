import {customerAuth} from './src/customer-auth.mjs';
import {createKycStore} from './src/kyc-store.mjs';
import {prepareDocuments} from './src/pdf.mjs';
import {timingSafeEqual} from 'node:crypto';
import {formRequirements,journeyProfile,journeyRecommendation,journeyView} from './src/journey.mjs';
import {createConversationStore} from './src/conversation-store.mjs';
import {conversationAdvisor} from './src/conversation-advisor.mjs';
import {publicRequirements} from './src/conversation-memory.mjs';
import {redact} from './src/ai.mjs';
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { AppError, csv, loadData, profile, recommend, quote, quoteItems, text, gstFormat } from './src/catalogue.mjs';
import { createStore, hash } from './src/store.mjs';
import { analyzeLeads, buildLeadQueue } from './src/analytics.mjs';
import { advisor } from './src/ai.mjs';
import { aiConfig } from './src/ai-config.mjs';
import { verify, REFERENCE_DATE,privateKyc,validateDocuments,same,mask } from './src/kyc.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const assets = new Map([['/customer-auth.js',['public/customer-auth.js','text/javascript; charset=utf-8']],['/order-navigation.mjs',['src/order-navigation.mjs','text/javascript; charset=utf-8']],['/kyc-review.html',['public/kyc-review.html','text/html; charset=utf-8']],['/kyc-review.js',['public/kyc-review.js','text/javascript; charset=utf-8']],['/staff.html',['public/staff.html','text/html; charset=utf-8']],['/staff.js',['public/staff.js','text/javascript; charset=utf-8']],['/locale.js', ['public/locale.js', 'text/javascript; charset=utf-8']],['/', ['public/index.html', 'text/html; charset=utf-8']], ['/index.html', ['public/index.html', 'text/html; charset=utf-8']], ['/app.js', ['public/app.js', 'text/javascript; charset=utf-8']], ['/style.css', ['public/style.css', 'text/css; charset=utf-8']], ['/sales.html',['public/sales.html','text/html; charset=utf-8']], ['/sales.js',['public/sales.js','text/javascript; charset=utf-8']], ['/sales.css',['public/sales.css','text/css; charset=utf-8']]]);
function contact(raw) {
  if (!raw || typeof raw !== 'object') throw new AppError('Contact details are required.');
  const name = text(raw.name, 120), phone = text(raw.phone, 20).replace(/[\s+()-]/g, ''), address = text(raw.address, 400);
  if (name.length < 2 || !/^(91)?[6-9]\d{9}$/.test(phone) || address.length < 10) throw new AppError('Enter a name, valid Indian mobile number and full installation address.');
  return { name, phone, address };
}
async function body(req, max) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new AppError('Send JSON content.');
  if (Number(req.headers['content-length']) > max) throw new AppError('Request is too large.', 413, 'TOO_LARGE');
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > max) throw new AppError('Request is too large.', 413, 'TOO_LARGE'); chunks.push(chunk); }
  try { const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(); return parsed; }
  catch { throw new AppError('Invalid JSON body.'); }
}
function verificationSnapshot(result){return {...result,needsFieldReview:result.documents.some(d=>d.reviewFields&&Object.keys(d.reviewFields).length),documents:result.documents.map(({reviewFields,...d})=>d),...(result.reviewerDecision?{reviewerDecision:{decision:result.reviewerDecision.decision,decidedAt:result.reviewerDecision.decidedAt,simulated:true}}:{})};}
export function createApp(options = {}) {
  const data = options.data || loadData(resolve(ROOT, process.env.DATA_DIR || 'YTL_TrackA_Udyam_Digital_Data'));
  const leads=options.leads||csv(readFileSync(resolve(ROOT,process.env.DATA_DIR||'YTL_TrackA_Udyam_Digital_Data','smb_leads.csv'),'utf8'));
  const store = createStore(options.dbPath || resolve(ROOT, process.env.DB_PATH || 'var/udyam.sqlite'));
  const config = aiConfig(process.env,options);
  const kycKey=options.kycKey??process.env.KYC_ENCRYPTION_KEY;
  const kyc=kycKey?createKycStore(store,kycKey):null;
  const requireCustomerAuth=options.requireCustomerAuth!==false;
  const auth=customerAuth(options.clerk||{publishableKey:process.env.CLERK_PUBLISHABLE_KEY,secretKey:process.env.CLERK_SECRET_KEY});
  const reviewerToken=options.reviewerToken??process.env.KYC_REVIEWER_TOKEN??'';
  const conversations=options.conversations||(process.env.DATABASE_URL?createConversationStore(process.env.DATABASE_URL):null);
  const orderWithReview=(owner,order)=>{
    if(!order||!kyc||!order.verification.caseId)return order;
    try{
      const c=kyc.get(owner,order.verification.caseId);
      if(c.journeyId!==(order.quote.sessionId||''))return order;
      const latest=c.decisions.at(-1),pending=!!latest&&['correction_requested','rejected'].includes(latest.decision)&&order.verification.addressedDecisionId!==latest.id;
      return {...order,kycReview:{caseId:c.id,decisions:c.decisions,pendingCorrection:pending,canCorrect:latest?.decision!=='rejected',status:c.result.overallStatus},...(pending?{status:'review_required',verification:{...order.verification,status:'review_required',issues:[...order.verification.issues||[],latest.comment]}}:{})};
    }catch(error){if(error.status===404)return order;throw error;}
  };
  const advisorJourneyContext=(owner,journeyId)=>{
    const matching=store.orders(owner).filter(order=>order.sessionId===journeyId).slice(0,5).map(({id,createdAt,status})=>{
      const order=orderWithReview(owner,store.getOrder(owner,id));
      return {status:order.status||status,createdAt,quote:{monthly:order.quote.monthly,monthlyMax:order.quote.monthlyMax,setup:order.quote.setup,installDays:order.quote.installDays},verification:{status:order.verification.status,overallStatus:order.kycReview?.status||order.verification.overallStatus,issueCount:order.verification.issues?.length||0},events:(order.events||[]).map(event=>({type:event.type,occurredAt:event.occurredAt})),supportRequests:(order.supportRequests||[]).map(request=>({topic:request.topic,status:request.status,replies:(request.replies||[]).map(reply=>({status:reply.status,createdAt:reply.createdAt}))}))};
    });
    const cases=kyc?.list(owner,journeyId)||[];
    const latestCase=cases[0];
    return {orders:matching,kyc:latestCase?{overallStatus:latestCase.result.overallStatus,status:latestCase.result.status,issueCount:latestCase.result.issues?.length||0,uploadedCount:latestCase.result.documents?.filter(doc=>doc.uploaded).length||0,requiredCount:latestCase.result.documents?.filter(doc=>doc.required).length||0}:null};
  };
  store.cleanup();
  const limits = new Map();
  function limit(key, max) {
    const now = Date.now(), entry = limits.get(key);
    if (!entry || now > entry.until) limits.set(key, { count: 1, until: now + 60000 });
    else if (++entry.count > max) throw new AppError('Too many requests. Please wait a minute.', 429, 'RATE_LIMIT');
    if (limits.size > 2000) for (const [key, entry] of limits) if (entry.until < now) limits.delete(key);
  }
  const server = http.createServer(async (req, res) => {
    const send = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY'); res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    if(auth.enabled){const f='https://'+auth.domain;res.setHeader('Content-Security-Policy',`default-src 'self'; script-src 'self' ${f} https://challenges.cloudflare.com https://*.protect.clerk.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://img.clerk.com; connect-src 'self' ${f} https://*.protect.clerk.com:*; frame-src 'self' ${f} https://challenges.cloudflare.com https://*.protect.clerk.com; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`);}
    try {
      const allowed = new Set([`localhost:${server.address()?.port}`, `127.0.0.1:${server.address()?.port}`]);
      if (!allowed.has(req.headers.host)) throw new AppError('Unrecognized host.', 403);
      const url = new URL(req.url, 'http://' + req.headers.host), path = url.pathname;
      if (!path.startsWith('/api/')) {
        const asset = assets.get(path);
        if (req.method !== 'GET' || !asset) throw new AppError('Page not found.', 404, 'NOT_FOUND');
        res.writeHead(200, { 'Content-Type': asset[1] }); res.end(readFileSync(resolve(ROOT, asset[0]))); return;
      }
      limit('ip:' + req.socket.remoteAddress, 240);
      if (!['GET', 'HEAD'].includes(req.method)) {
        if (req.headers.origin !== 'http://' + req.headers.host || req.headers['sec-fetch-site'] === 'cross-site') throw new AppError('Use the app from its original browser tab.', 403, 'WRONG_ORIGIN');
      }
      if(req.method==='GET'&&path==='/api/auth/config'){send(200,{...auth.publicConfig,required:requireCustomerAuth});return;}
      const identity=await auth.identity(req,'http://'+req.headers.host);
      const token = /(?:^|;\s*)udyam_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
      const guest = store.session(token);
      const session = identity?store.accountSession(identity.owner):guest;
      if(identity&&conversations&&path.startsWith('/api/sessions'))await conversations.touchOwner(session.hash,session.expiresAt);
      kyc?.cleanup();
      if (guest.token) res.setHeader('Set-Cookie', `udyam_session=${guest.token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800`);
      limit(session.hash, 120);
      if (req.method === 'GET' && path === '/api/session') { send(200, { auth:{enabled:auth.enabled,signedIn:!!identity,guestOrders:identity?store.orders(guest.hash).length:0},mode: config.apiKey ? 'ai_configured' : 'guided', provider:config.provider, model: config.model, externalImageReading:config.provider==='openai'&&!!config.apiKey, advisorProfile:requireCustomerAuth&&!identity?null:store.advisorConversation(session.hash).profile||null, conversationStorage:conversations?'postgresql':'disabled',kycStorage:kyc?'encrypted_local':'temporary', referenceDate: REFERENCE_DATE }); return; }
      if(req.method==='POST'&&path==='/api/auth/claim'){
        await body(req,1024);if(!identity)throw new AppError('Sign in before linking this browser session.',401,'AUTH_REQUIRED');
        const linkedOrders=store.orders(guest.hash).length,linkedChats=conversations?(await conversations.list(guest.hash)).length:0;
        if(conversations)await conversations.claimGuest(guest.hash,session.hash,session.expiresAt);
        store.claimGuest(guest.hash,session.hash);send(200,{linked:true,linkedOrders,linkedChats});return;
      }
      const reviewerCookie=/(?:^|;\s*)udyam_reviewer=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie||'')?.[1];
      const isReviewer=()=>!!kyc?.authorized(reviewerCookie);
      const requireReviewer=()=>{if(!isReviewer())throw new AppError('Reviewer sign-in is required.',401,'REVIEWER_REQUIRED');};
      if(req.method==='GET'&&path==='/api/staff/session'){send(200,{signedIn:isReviewer()});return;}
      const customerPath=path.startsWith('/api/orders')||path.startsWith('/api/sessions')||['/api/registration-check','/api/recommend','/api/quote','/api/advisor','/api/verify','/api/notifications','/api/notifications/read'].includes(path)||(path.startsWith('/api/kyc/')&&!path.startsWith('/api/kyc/reviewer/')&&!isReviewer());
      if(requireCustomerAuth&&customerPath&&!identity)throw new AppError('Sign in to access your business setup and place orders.',401,'AUTH_REQUIRED');
      if(path.startsWith('/api/sales/')&&!isReviewer())throw new AppError('Staff sign-in is required.',401,'STAFF_REQUIRED');
      if(path.startsWith('/api/kyc/')){
        if(!kyc)throw new AppError('Private KYC storage is not configured. Run npm run kyc:setup and restart.',503,'KYC_STORAGE_UNAVAILABLE');
        if(req.method==='POST'&&path==='/api/kyc/reviewer/login'){
          limit('review-login:'+req.socket.remoteAddress,5);const input=await body(req,1024);if(!reviewerToken)throw new AppError('Reviewer access is not configured.',503);
          if(typeof input.token!=='string'||input.token.length>256||!timingSafeEqual(Buffer.from(hash(input.token)),Buffer.from(hash(reviewerToken))))throw new AppError('Reviewer sign-in failed.',401);
          const token=kyc.login();res.setHeader('Set-Cookie',`udyam_reviewer=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=3600`);send(200,{signedIn:true});return;
        }
        if(req.method==='POST'&&path==='/api/kyc/reviewer/logout'){kyc.logout(reviewerCookie);res.setHeader('Set-Cookie','udyam_reviewer=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');send(200,{signedOut:true});return;}
        if(req.method==='GET'&&path==='/api/kyc/reviewer/cases'){requireReviewer();send(200,{cases:kyc.queue(),simulated:true});return;}
        const reviewCase=/^\/api\/kyc\/reviewer\/cases\/([a-f0-9-]{36})(?:\/(decision))?$/.exec(path);
        if(reviewCase){requireReviewer();const found=kyc.reviewGet(reviewCase[1]);
          if(req.method==='GET'&&!reviewCase[2]){send(200,{...found.detail,contact:{name:found.context.contact.name,address:found.context.contact.address},businessName:found.context.profile.businessName,simulated:true});return;}
          if(req.method==='POST'&&reviewCase[2]){
            const input=await body(req,4096),comment=text(input.comment,1000);if(comment.length<5)throw new AppError('Add a review comment of at least five characters.');
            if(found.context.journeyId&&conversations){const latest=await conversations.get(found.owner,found.context.journeyId);if(latest.revision!==found.context.revision)throw new AppError('The customer requirements changed. Request new checks before reviewing.',409,'STALE_REQUIREMENTS');}
            const updated=kyc.decide(reviewCase[1],input.decision,comment);
            const persisted={...verificationSnapshot(updated.detail.result),caseId:reviewCase[1],contactHash:hash(JSON.stringify(updated.context.contact)),...(updated.context.journeyId?{journeyId:updated.context.journeyId,requirementsRevision:updated.context.revision}:{})};
            const verificationId=store.verification(updated.owner,updated.context.profile,persisted);kyc.bind(updated.owner,reviewCase[1],verificationId);
            const linkedOrdersUpdated=input.decision==='approved'?store.approveOrdersForCase(updated.owner,reviewCase[1],persisted):0;
            if(input.decision!=='approved')store.holdOrdersForCase(updated.owner,reviewCase[1]);
            send(200,{...kyc.get(updated.owner,reviewCase[1]),linkedOrdersUpdated,simulated:true});return;
          }
        }
        if(req.method==='POST'&&path==='/api/kyc/preview'){
          limit('preview:'+session.hash,12);const input=await body(req,3*1024*1024);if(input.consent!==true)throw new AppError('Consent is required before preview processing.',403,'CONSENT_REQUIRED');
          const doc=validateDocuments([input.document])[0];try{const pages=await prepareDocuments([doc]);send(200,{preview:pages[0].dataUrl,pageCount:pages.length});}catch{throw new AppError('Preview could not be generated. Upload an unlocked PDF with up to four pages, or a clear JPEG/PNG.');}return;
        }
        const filePath=/^\/api\/kyc\/documents\/([a-f0-9-]{36})\/(preview|download)$/.exec(path);
        if(filePath&&req.method==='GET'){
          const f=isReviewer()?kyc.reviewFile(filePath[1]):kyc.file(session.hash,filePath[1]);const dataUrl=filePath[2]==='preview'?f.payload.preview:f.payload.dataUrl;
          if(!dataUrl)throw new AppError('This document has no readable preview. Replace the file or download the original.',404,'PREVIEW_UNAVAILABLE');
          const match=/^data:([^;]+);base64,(.+)$/.exec(dataUrl);if(filePath[2]==='preview'&&!match[1].startsWith('image/'))throw new AppError('No image preview is available.',404);
          res.setHeader('Content-Security-Policy',"default-src 'none'; sandbox");res.setHeader('Content-Type',match[1]);
          if(filePath[2]==='download')res.setHeader('Content-Disposition',`attachment; filename="${f.kind}${f.mime==='application/pdf'?'.pdf':f.mime==='image/jpeg'?'.jpg':'.png'}"`);
          res.end(Buffer.from(match[2],'base64'));return;
        }
        if(req.method==='GET'&&path==='/api/kyc/cases'){
          const journeyId=url.searchParams.get('journeyId')||'';if(journeyId&&conversations)await conversations.get(session.hash,journeyId);
          send(200,{cases:kyc.list(session.hash,journeyId)});return;
        }
        const reviewRequest=/^\/api\/kyc\/cases\/([a-f0-9-]{36})\/review-request$/.exec(path);
        if(reviewRequest&&req.method==='POST'){
          const input=await body(req,1024);
          if(input.consent!==true)throw new AppError('Consent is required to request document review.',403,'CONSENT_REQUIRED');
          limit('review-request:'+session.hash,6);
          const context=kyc.context(session.hash,reviewRequest[1]);
          if(context.journeyId&&conversations){const latest=await conversations.get(session.hash,context.journeyId);if(latest.revision!==context.revision)throw new AppError('Requirements changed. Run checks again before requesting review.',409,'STALE_REQUIREMENTS');}
          send(200,{...kyc.requestReview(session.hash,reviewRequest[1]),notice:'Review requested in the local staff workspace. No external reviewer is notified.'});return;
        }
        const casePath=/^\/api\/kyc\/cases\/([a-f0-9-]{36})$/.exec(path);
        if(casePath&&req.method==='GET'){const c=kyc.get(session.hash,casePath[1]);send(200,{...c,contact:kyc.context(session.hash,c.id).contact});return;}
        if(casePath&&req.method==='DELETE'){send(200,kyc.remove(session.hash,casePath[1]));return;}
        throw new AppError('KYC endpoint not found.',404,'NOT_FOUND');
      }
      const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
      if(path==='/api/sessions'||path.startsWith('/api/sessions/')){
        if(!conversations)throw new AppError('Conversation history needs PostgreSQL. Configure the database and run migrations.',503,'DATABASE_UNAVAILABLE');
        try{
          if(path==='/api/sessions'){
            if(req.method==='GET'){send(200,{sessions:await conversations.list(session.hash)});return;}
            if(req.method==='POST'){
              const input=await body(req,8192),title=input.title===undefined?'New conversation':redact(text(input.title,100));if(!title)throw new AppError('Conversation title is required.');
              if(input.requestId!==undefined&&!uuid(input.requestId))throw new AppError('A valid creation request ID is required.');
              const initial=input.profile?formRequirements(input.profile):undefined;
              const created=await conversations.create(session.hash,session.expiresAt,title,initial,input.requestId||null);
              const found=await conversations.get(session.hash,created.id);send(201,{id:created.id,...journeyView(found.state,found.revision,data)});return;
            }
          }
          const match=/^\/api\/sessions\/([a-f0-9-]{36})(?:\/(chat|messages|requirements|business-name|recommendation))?$/.exec(path);
          if(!match||!/^([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/.test(match[1]))throw new AppError('Invalid conversation path.',404,'NOT_FOUND');
          const [,id,part]=match;
          if(req.method==='DELETE'&&!part){const deleted=await conversations.remove(session.hash,id);kyc?.removeJourney(session.hash,id);send(200,deleted);return;}
          if(req.method==='GET'&&(!part||['messages','requirements','recommendation'].includes(part))){
            const before=url.searchParams.get('before');if(before&&!/^\d{1,18}$/.test(before))throw new AppError('Invalid history cursor.');
            const found=await conversations.get(session.hash,id,before),requirements=publicRequirements(found.state);
            send(200,part==='recommendation'?{sessionId:id,...journeyView(found.state,found.revision,data)}:part==='requirements'?journeyView(found.state,found.revision):part==='messages'?{messages:found.messages,hasMore:found.hasMore}:{...found,state:undefined,...journeyView(found.state,found.revision,data),offers:found.state.offers||[]});return;
          }
          if(req.method==='POST'&&part==='requirements'){
            const input=await body(req,8192);if(!uuid(input.requestId)||!Number.isInteger(input.revision)||input.revision<0)throw new AppError('A revision and request ID are required.');
            const result=await conversations.update(session.hash,id,input.revision,input.requestId,async(saved,revision)=>{
              const next=formRequirements(input.profile,saved);return {state:next,result:{sessionId:id,...journeyView(next,revision,data)}};
            });send(200,result);return;
          }
          if(req.method==='POST'&&part==='business-name'){
            const input=await body(req,2048),businessName=redact(text(input.businessName,120));
            if(!businessName)throw new AppError('Enter your business name in the form, then review your package.');
            if(!uuid(input.requestId)||!Number.isInteger(input.revision)||input.revision<0)throw new AppError('A revision and request ID are required.');
            const result=await conversations.update(session.hash,id,input.revision,input.requestId,async(saved,revision)=>{
              const next={...saved,form:{...(saved.form||{}),businessName}};
              return {state:next,result:{sessionId:id,...journeyView(next,revision,data)}};
            });send(200,result);return;
          }
          if(req.method==='POST'&&part==='chat'){
            limit('ai:'+session.hash,6);const input=await body(req,4096),message=redact(text(input.message,2000));
            if(!message)throw new AppError('Enter a message.');
            if(typeof input.requestId!=='string'||!/^([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/.test(input.requestId))throw new AppError('A valid message request ID is required.');
            const result=await conversations.turn(session.hash,id,input.requestId,message,async(saved,history)=>{
              const context=advisorJourneyContext(session.hash,id);
              const reply=await (options.conversationAdvisor||conversationAdvisor)(config,saved,history,data,input.language==='hi'?'hi':'en',context,{requestId:input.requestId,sessionId:id});
              reply.requirements=publicRequirements(reply.conversationState||saved);return reply;
            });send(200,result);return;
          }
          throw new AppError('Endpoint not found.',404,'NOT_FOUND');
        }catch(error){if(error instanceof AppError)throw error;throw new AppError('Conversation storage is unavailable. Please retry.',503,'DATABASE_UNAVAILABLE');}
      }
      if (req.method === 'GET' && path === '/api/catalogue') { send(200, { products: data.products }); return; }
      if (req.method === 'GET' && path === '/api/sales/queue') {
        const queue=buildLeadQueue(leads,data,store.getLeadHandoffs());
        const summary=analyzeLeads(leads);
        send(200,{synthetic:true,total:queue.length,priorityCounts:{high:queue.filter(x=>x.priority==='High').length,queued:queue.filter(x=>x.handoffStatus==='queued').length},summary:{leads:summary.overall.leads,activated:summary.overall.activated,conversionPct:summary.overall.conversionPct,averageActivationDays:summary.overall.averageActivationDays,topDropReasons:summary.topDropReasons},queue:queue.slice(0,150),supportCases:store.getSupportQueue()});return;
      }
      if (req.method === 'GET' && path === '/api/orders') { send(200, { orders: store.orders(session.hash) }); return; }
      if(req.method==='GET'&&path==='/api/notifications'){
        const notifications=[],reviewerDecisionIds=new Set();
        for(const summary of store.orders(session.hash).slice(0,100)){
          const order=orderWithReview(session.hash,store.getOrder(session.hash,summary.id));if(!order)continue;
          for(const request of order.supportRequests||[])for(const reply of request.replies||[])notifications.push({id:'sales:'+reply.id,type:'sales_reply',title:'Reply from sales',message:reply.message,createdAt:reply.createdAt,orderId:order.id});
          for(const decision of order.kycReview?.decisions||[]){if(reviewerDecisionIds.has(decision.id))continue;reviewerDecisionIds.add(decision.id);notifications.push({id:'reviewer:'+decision.id,type:'reviewer_message',title:'KYC reviewer update',message:decision.comment,createdAt:decision.decidedAt,orderId:order.id});}
        }
        const readIds=store.notificationReadIds(session.hash),items=notifications.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,100).map(item=>({...item,read:readIds.has(item.id)}));send(200,{notifications:items,checkedAt:new Date().toISOString()});return;
      }
      if(req.method==='POST'&&path==='/api/notifications/read'){
        const input=await body(req,8192);if(!Array.isArray(input.ids)||input.ids.length>100||input.ids.some(id=>typeof id!=='string'||id.length>100||!(/^(sales|reviewer):[a-f0-9-]{36}$/).test(id)))throw new AppError('Invalid notification list.');
        store.markNotificationsRead(session.hash,[...new Set(input.ids)]);send(200,{markedRead:input.ids.length});return;
      }
      const orderPath = /^\/api\/orders\/(AB-[a-f0-9-]{36})$/.exec(path);
      if (orderPath && ['GET', 'DELETE'].includes(req.method)) {
        const order = store.getOrder(session.hash, orderPath[1]); if (!order) throw new AppError('Order not found in this session.', 404, 'NOT_FOUND');
        if (req.method === 'DELETE') { store.deleteOrder(session.hash, order.id); send(200, { deleted: true }); } else send(200, orderWithReview(session.hash,order)); return;
      }
      const correctedOrder=/^\/api\/orders\/(AB-[a-f0-9-]{36})\/verification$/.exec(path);
      if(req.method==='POST'&&correctedOrder){
        const order=store.getOrder(session.hash,correctedOrder[1]);if(!order)throw new AppError('Order not found in this session.',404);
        const input=await body(req,4096);if(!kyc||!order.verification.caseId)throw new AppError('No retained KYC case is linked to this order.',409);
        const c=kyc.get(session.hash,order.verification.caseId),context=kyc.context(session.hash,c.id);
        if(input.verificationId!==c.verificationId)throw new AppError('KYC results changed. Refresh and run checks again.',409);
        const checked=store.getVerification(session.hash,context.profile,input.verificationId);
        if(!checked||checked.caseId!==c.id||checked.status!=='passed')throw new AppError('Resolve document checks before submitting corrections.',409);
        if(checked.needsFieldReview&&input.fieldsReviewed!==true)throw new AppError('Review the extracted document fields before continuing.',409);
        const withoutIds=p=>profile({...p,gstin:'',udyam:'',language:'en'});
        if(hash(JSON.stringify(withoutIds(context.profile)))!==hash(JSON.stringify(withoutIds(order.profile)))||hash(JSON.stringify(context.contact))!==hash(JSON.stringify(order.contact))||c.journeyId!==(order.quote.sessionId||''))throw new AppError('These corrected documents do not match this order.',409);
        if(context.journeyId&&conversations){const latest=await conversations.get(session.hash,context.journeyId);if(latest.revision!==context.revision||context.revision!==order.quote.requirementsRevision)throw new AppError('Requirements changed. Review a new quote before ordering.',409);}
        quote({...context.profile,gstin:context.evidence.gstin||'',udyam:context.evidence.udyam||''},quoteItems(order.quote.items),data);
        if(order.verification.sourceVerificationId===input.verificationId){send(200,orderWithReview(session.hash,order));return;}
        send(200,orderWithReview(session.hash,store.submitOrderKyc(session.hash,order.id,{...checked,sourceVerificationId:input.verificationId,addressedDecisionId:c.decisions.at(-1)?.id||null})));return;
      }
      const supportPath=/^\/api\/orders\/(AB-[a-f0-9-]{36})\/support$/.exec(path);
      if(req.method==='POST'&&supportPath){
        limit('support:'+session.hash,5);
        const input=await body(req,8*1024),topic=text(input.topic,40),message=text(input.message,500);
        if(!['Installation or activation','KYC review','Quote question','Other'].includes(topic)||message.length<5)throw new AppError('Choose a help topic and enter at least 5 characters.');
        const request=store.addSupportRequest(session.hash,supportPath[1],topic,message);
        if(!request)throw new AppError('Order not found in this browser session.',404,'NOT_FOUND');
        send(201,{request,notice:'Saved locally. No support team is connected in this prototype.'});return;
      }
      if(path.endsWith('/demo-advance'))throw new AppError('Staff manage installation and activation.',403);
      if(req.method==='GET'&&path==='/api/sales/orders'){send(200,{orders:store.operationsOrders()});return;}
      if(req.method==='POST'&&path==='/api/sales/orders/update'){
        const input=await body(req,4096);
        try{send(200,store.updateFulfillment(input.id,input,'Staff '+hash(reviewerCookie).slice(0,10)));}
        catch(error){if(error.status)throw new AppError(error.message,error.status);throw error;}
        return;
      }
      if(req.method==='POST'&&path==='/api/sales/handoff'){
        limit('sales-handoff:'+session.hash,30);
        const input=await body(req,4*1024),leadId=text(input.leadId,10),queue=buildLeadQueue(leads,data,store.getLeadHandoffs()),lead=queue.find(item=>item.leadId===leadId);
        if(!lead)throw new AppError('Lead not found in the synthetic follow-up list.',404,'NOT_FOUND');
        send(201,store.handoffLead(lead.leadId,lead.priorityScore,lead.dropReason));return;
      }
      if(req.method==='POST'&&path==='/api/sales/support/delete'){
        const input=await body(req,2048),id=text(input.id,36);
        if(!/^[a-f0-9-]{36}$/.test(id)||!store.hideSupportRequest(id))throw new AppError('Help request not found.',404);
        send(200,{removed:true});return;
      }
      if(req.method==='POST'&&path==='/api/sales/support/review'){
        const input=await body(req,2*1024),id=text(input.id,36);
        if(!/^[a-f0-9-]{36}$/.test(id)||!store.resolveSupportRequest(id))throw new AppError('Help request not found.',404,'NOT_FOUND');
        send(200,{id,status:'reviewed'});return;
      }
      if(req.method==='POST'&&path==='/api/sales/support/reply'){
        limit('staff-reply:'+session.hash,30);
        const input=await body(req,8192),id=text(input.id,36),message=text(input.message,1000);
        if(!/^[a-f0-9-]{36}$/.test(id)||message.length<5||!['replied','resolved'].includes(input.status))throw new AppError('Enter a reply of 5–1000 characters and choose Replied or Resolved.');
        const reply=store.replySupport(id,message,input.status);if(!reply)throw new AppError('Help request not found.',404);
        send(201,{reply});return;
      }
      if (req.method !== 'POST' || !['/api/registration-check','/api/recommend', '/api/quote', '/api/advisor', '/api/verify', '/api/orders'].includes(path)) throw new AppError('Endpoint not found.', 404, 'NOT_FOUND');
      const input = await body(req, path === '/api/verify' ? 12 * 1024 * 1024 : 64 * 1024);
      let pendingResponse;
      const execute=async(business,journey=null)=>{
      const send=(status,value)=>{pendingResponse={status,value};};
      if ((business.gstin || business.udyam) && input.consent !== true) throw new AppError('Consent is required before checking business identifiers.', 403, 'CONSENT_REQUIRED');
      if(path==='/api/registration-check'){
        if(input.consent!==true)throw new AppError('Consent is required before checking business identifiers.',403,'CONSENT_REQUIRED');
        const registration=data.gst.get(business.gstin);
        const status=!gstFormat(business.gstin)?'invalid_format':!registration?'not_found':registration.status!=='Active'?'inactive':![registration.legal_name,registration.trade_name].some(name=>same(name,business.businessName))?'business_name_mismatch':'matched';
        const messages={invalid_format:'Enter a valid 15-character GSTIN with a correct checksum.',not_found:'GSTIN was not found in the supplied mock registry. Check the number.',inactive:'The supplied mock registry does not show this GST registration as active.',business_name_mismatch:'The business name must match the legal or trade name in the supplied mock registry.',matched:'Active registration and business name matched the supplied mock registry. Certificate checks are still required during KYC.'};
        // A preliminary lookup never creates a verification ID or saves an identifier
        // into conversational memory, and cannot bypass the document consent flow.
        const recommendation=status==='matched'?(journey?journeyRecommendation(journey.state,data,business):recommend(business,data)):null;
        const {profile:privateProfile,...publicRecommendation}=recommendation||{};
        send(200,{registration:{status,maskedGstin:mask(business.gstin),message:messages[status]},recommendation:recommendation?publicRecommendation:null});return;
      }
      let checkedForRequest;
      if(input.verificationId&&path!=='/api/verify'){
        checkedForRequest=store.getVerification(session.hash,business,input.verificationId);
        if(!checkedForRequest&&kyc&&!business.gstin&&!business.udyam){
          const candidate=store.verificationByOwner(session.hash,input.verificationId);
          if(candidate?.caseId){const context=kyc.context(session.hash,candidate.caseId);const withoutIds=p=>profile({...p,gstin:'',udyam:''});if(hash(JSON.stringify(withoutIds(context.profile)))===hash(JSON.stringify(withoutIds(business))))checkedForRequest=candidate;}
        }
        if(!checkedForRequest)throw new AppError('Business details changed or verification expired. Repeat the document checks.',409,'STALE_VERIFICATION');
        if(checkedForRequest&&journey&&(checkedForRequest.journeyId!==input.sessionId||checkedForRequest.requirementsRevision!==journey.revision))throw new AppError('Session requirements changed. Repeat verification.',409,'STALE_VERIFICATION');
        if(checkedForRequest?.caseId&&kyc){const c=kyc.get(session.hash,checkedForRequest.caseId);if(c.verificationId!==input.verificationId)throw new AppError('KYC results have changed. Reload the latest checks.',409,'STALE_VERIFICATION');const context=kyc.context(session.hash,c.id);business={...business,gstin:business.gstin||context.evidence.gstin||'',udyam:business.udyam||context.evidence.udyam||''};}
      }
      if (path === '/api/recommend') { send(200, journey?{...journeyRecommendation(journey.state,data,business),sessionId:input.sessionId,revision:journey.revision}:recommend(business, data)); return; }
      if (path === '/api/quote') {
        const priced=quote(business,input.items,data);
        if(journey)await journey.client.query('UPDATE advisor_requirements SET state=$2,updated_at=now() WHERE session_id=$1',[input.sessionId,{...journey.state,selectedProducts:quoteItems(priced.items)}]);
        send(200,{...priced,...(journey?{sessionId:input.sessionId,requirementsRevision:journey.revision}:{})});return;
      }
      if (path === '/api/advisor') {
        limit('ai:' + session.hash, 6);
        if (!Array.isArray(input.messages) || input.messages.length > 12 || input.messages.some(m => !m || !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string' || m.content.length > 2000)) throw new AppError('Send up to 12 short conversation messages.');
        const result = await advisor(config, business, input.messages, recommend(business, data), data, store.advisorConversation(session.hash));
        if(result.mode==='ai'&&result.conversationState)store.saveAdvisorConversation(session.hash,result.conversationState);
        if(result.fallbackReason){console.warn('Advisor request failed:',result.fallbackReason);result.reply=({AI_RATE_LIMIT:'Our AI advisor is receiving many requests. Please try again shortly.',AI_INVALID_REPLY:'We couldn’t process that response. Please try again.',AI_NETWORK_ERROR:'Connection problem. Please check your internet connection.',AI_TIMEOUT:'The advisor took too long to respond. Please try again.'}[result.fallbackReason]||'The advisor is temporarily unavailable. Please try again.');if(input.profile?.language==='hi')result.reply=({AI_RATE_LIMIT:'हमारे AI सलाहकार को अभी बहुत अनुरोध मिल रहे हैं। कृपया थोड़ी देर बाद कोशिश करें।',AI_INVALID_REPLY:'हम इस जवाब को समझ नहीं पाए। कृपया फिर से कोशिश करें।',AI_NETWORK_ERROR:'कनेक्शन में समस्या है। कृपया इंटरनेट जाँचें।',AI_TIMEOUT:'सलाहकार को जवाब देने में ज़्यादा समय लगा। कृपया फिर से कोशिश करें।'}[result.fallbackReason]||'सलाहकार अभी उपलब्ध नहीं है। कृपया फिर से कोशिश करें।');delete result.fallbackReason;}
        delete result.conversationState;
        if (result.proposedProfile) { try { result.proposedProfile = profile(result.proposedProfile); } catch { result.proposedProfile = null; } }
        send(200, result); return;
      }
      if (path === '/api/verify') {
        limit('verify:' + session.hash, 4);
        const person = contact(input.contact);
        if(input.consent!==true)throw new AppError('Please consent before business verification.',403,'CONSENT_REQUIRED');
        if(kyc&&input.consentVersion!=='2026-10-smart-kyc-v3')throw new AppError('Reload the page and accept the updated document storage consent before running checks.',409,'CONSENT_REFRESH_REQUIRED');
        if(input.caseId!==undefined&&input.caseId!==null&&(typeof input.caseId!=='string'||!/^[a-f0-9-]{36}$/.test(input.caseId)))throw new AppError('Invalid KYC case ID.');
        if(!Array.isArray(input.documents||[])||(input.documents||[]).length>4)throw new AppError('Documents must be a list.');
        const documents=(input.documents||[]).map(doc=>{
          if(!doc||typeof doc!=='object')throw new AppError('Invalid document entry.');
          if(!doc.documentId)return doc;if(!kyc)throw new AppError('Private document storage is unavailable.',503);
          const saved=kyc.file(session.hash,doc.documentId,input.sessionId||'');if(saved.kind!==doc.kind)throw new AppError('Document category does not match the saved file.');return {kind:doc.kind,name:saved.filename,dataUrl:saved.payload.dataUrl};
        });
        const result=await verify(data,config,business,{...input,documents,contact:person,contactName:person.name,requiresGst:Array.isArray(input.items)&&input.items.some(x=>data.products.find(p=>p.id===x.productId)?.requiresGst)});
        const evidence=privateKyc(result);
        result.requirementsRevision=journey?.revision??null;result.journeyId=input.sessionId||'';
        let savedCase;
        if(kyc)savedCase=await kyc.save(session.hash,input.sessionId||'',input.caseId,{profile:business,contact:person,journeyId:input.sessionId||'',revision:journey?.revision??null,evidence:{gstin:evidence.eligibilityGst,udyam:evidence.eligibilityUdyam}},documents,result,evidence.rows);
        const persisted={...verificationSnapshot(result),contactHash:hash(JSON.stringify(person)),...(journey?{journeyId:input.sessionId,requirementsRevision:journey.revision}:{})};
        const id=store.verification(session.hash,business,persisted);if(savedCase)kyc.bind(session.hash,savedCase.id,id);
        send(200,{id,...result,storageMode:kyc?'encrypted_local':'temporary',retentionDays:7});return;
      }
      if (path === '/api/orders') {
        const person = contact(input.contact), priced = quote(business, input.items, data);
        if (priced.monthly > business.budget) throw new AppError('This package exceeds your stated budget. Update the budget or package.');
        if (typeof input.verificationId !== 'string') throw new AppError('Complete the verification step first.');
        const checked = checkedForRequest||store.getVerification(session.hash, business, input.verificationId);
        if(journey&&(!checked||checked.journeyId!==input.sessionId||checked.requirementsRevision!==journey.revision))throw new AppError('Session requirements changed. Repeat verification before ordering.',409,'STALE_VERIFICATION');
        if((checked?.needsFieldReview||checked?.documents?.some(d=>d.reviewFields&&Object.keys(d.reviewFields).length))&&input.fieldsReviewed!==true)throw new AppError('Review the extracted document fields before continuing.',403,'REVIEW_FIELDS_REQUIRED');
        if (!checked || checked.contactHash !== hash(JSON.stringify(person))) throw new AppError('Business/contact details changed. Please repeat verification.');
        const requestKey = text(input.requestKey, 100); if (!/^[a-f0-9-]{36}$/.test(requestKey)) throw new AppError('A valid checkout request key is required.');
        send(201, store.createOrder(session.hash, requestKey, business, person, {...priced,...(journey?{sessionId:input.sessionId,requirementsRevision:journey.revision}:{})}, checked)); return;
      }
      };
      if(input.sessionId!==undefined){
        if(!conversations)throw new AppError('PostgreSQL is required for this journey.',503,'DATABASE_UNAVAILABLE');
        if(!uuid(input.sessionId))throw new AppError('Invalid session ID.');
        try{await conversations.withState(session.hash,input.sessionId,async(saved,revision,client)=>{
          if(input.revision!==revision)throw new AppError('Requirements changed. Reload the session before continuing.',409,'STALE_REQUIREMENTS');
          // Identifiers remain consented checkout inputs, never conversational memory.
          const canonical=journeyProfile(saved,true);
          const business=profile({...canonical,language:input.profile?.language||canonical.language,gstin:input.profile?.gstin||'',udyam:input.profile?.udyam||''});
          return execute(business,{state:saved,revision,client});
        });}catch(error){if(error instanceof AppError)throw error;throw new AppError('Conversation storage is unavailable. Please retry.',503,'DATABASE_UNAVAILABLE');}
      }else await execute(profile(input.profile));
      if(pendingResponse)send(pendingResponse.status,pendingResponse.value);
    } catch (error) {
      send(error instanceof AppError ? error.status : 500, { error: error instanceof AppError ? error.message : 'Something went wrong. Please retry.', code: error instanceof AppError ? error.code : 'INTERNAL_ERROR' });
    }
  });
  return { server, store, data, conversations,kyc };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (existsSync(resolve(ROOT, '.env'))) process.loadEnvFile(resolve(ROOT, '.env'));
  const app = createApp();
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be from 1 to 65535.');
  if (process.env.HOST && !['127.0.0.1', 'localhost'].includes(process.env.HOST)) throw new Error('This prototype supports loopback HOST only.');
  const configured=aiConfig();
  app.server.listen(port, process.env.HOST || '127.0.0.1', () => console.log(`Udyam Digital: http://localhost:${port} (${configured.apiKey ? configured.provider+' configured' : 'guided mode'})`));
  app.server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? 'Port is in use. Choose another PORT in .env.' : 'Server could not start. Check local configuration.'); process.exitCode = 1; });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => app.server.close(() => { app.store.close(); Promise.resolve(app.conversations?.close()).finally(()=>process.exit(0)); }));
}
