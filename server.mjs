import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { AppError, loadData, profile, recommend, quote, text } from './src/catalogue.mjs';
import { createStore, hash } from './src/store.mjs';
import { advisor } from './src/ai.mjs';
import { aiConfig } from './src/ai-config.mjs';
import { verify, REFERENCE_DATE } from './src/kyc.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const assets = new Map([['/locale.js', ['locale.js', 'text/javascript; charset=utf-8']],['/', ['index.html', 'text/html; charset=utf-8']], ['/index.html', ['index.html', 'text/html; charset=utf-8']], ['/app.js', ['app.js', 'text/javascript; charset=utf-8']], ['/style.css', ['style.css', 'text/css; charset=utf-8']]]);
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
export function createApp(options = {}) {
  const data = options.data || loadData(resolve(ROOT, process.env.DATA_DIR || 'YTL_TrackA_Udyam_Digital_Data'));
  const store = createStore(options.dbPath || resolve(ROOT, process.env.DB_PATH || 'var/udyam.sqlite'));
  const config = aiConfig(process.env,options);
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
      const token = /(?:^|;\s*)udyam_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
      const session = store.session(token);
      if (session.token) res.setHeader('Set-Cookie', `udyam_session=${session.token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800`);
      limit(session.hash, 120);
      if (req.method === 'GET' && path === '/api/session') { send(200, { mode: config.apiKey ? 'ai_configured' : 'guided', provider:config.provider, model: config.model, externalImageReading:config.provider==='openai'&&!!config.apiKey, referenceDate: REFERENCE_DATE }); return; }
      if (req.method === 'GET' && path === '/api/catalogue') { send(200, { products: data.products }); return; }
      if (req.method === 'GET' && path === '/api/orders') { send(200, { orders: store.orders(session.hash) }); return; }
      const orderPath = /^\/api\/orders\/(AB-[a-f0-9-]{36})$/.exec(path);
      if (orderPath && ['GET', 'DELETE'].includes(req.method)) {
        const order = store.getOrder(session.hash, orderPath[1]); if (!order) throw new AppError('Order not found in this session.', 404, 'NOT_FOUND');
        if (req.method === 'DELETE') { store.deleteOrder(session.hash, order.id); send(200, { deleted: true }); } else send(200, order); return;
      }
      if (req.method !== 'POST' || !['/api/recommend', '/api/quote', '/api/advisor', '/api/verify', '/api/orders'].includes(path)) throw new AppError('Endpoint not found.', 404, 'NOT_FOUND');
      const input = await body(req, path === '/api/verify' ? 12 * 1024 * 1024 : 64 * 1024);
      const business = profile(input.profile);
      if ((business.gstin || business.udyam) && input.consent !== true) throw new AppError('Consent is required before checking business identifiers.', 403, 'CONSENT_REQUIRED');
      if (path === '/api/recommend') { send(200, recommend(business, data)); return; }
      if (path === '/api/quote') { send(200, quote(business, input.items, data)); return; }
      if (path === '/api/advisor') {
        limit('ai:' + session.hash, 6);
        if (!Array.isArray(input.messages) || input.messages.length > 12 || input.messages.some(m => !m || !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string' || m.content.length > 2000)) throw new AppError('Send up to 12 short conversation messages.');
        const result = await advisor(config, business, input.messages, recommend(business, data), data);
        if (result.proposedProfile) { try { result.proposedProfile = profile(result.proposedProfile); } catch { result.proposedProfile = null; } }
        send(200, result); return;
      }
      if (path === '/api/verify') {
        limit('verify:' + session.hash, 4);
        const person = contact(input.contact);
        const result = await verify(data, config, business, { ...input, contactName: person.name });
        if (business.gstin && data.gst.has(business.gstin)) {
          const normalize = value => value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
          if (normalize(person.address) !== normalize(data.gst.get(business.gstin).principal_place_of_business)) { result.issues.push('Installation address differs from the registry; assisted review is needed.'); result.status = 'review_required'; }
        }
        result.contactHash = hash(JSON.stringify(person));
        const id = store.verification(session.hash, business, result); send(200, { id, ...result }); return;
      }
      if (path === '/api/orders') {
        const person = contact(input.contact), priced = quote(business, input.items, data);
        if (priced.monthly > business.budget) throw new AppError('This package exceeds your stated budget. Update the budget or package.');
        if (typeof input.verificationId !== 'string') throw new AppError('Complete the verification step first.');
        const checked = store.getVerification(session.hash, business, input.verificationId);
        if (!checked || checked.contactHash !== hash(JSON.stringify(person))) throw new AppError('Business/contact details changed. Please repeat verification.');
        const requestKey = text(input.requestKey, 100); if (!/^[a-f0-9-]{36}$/.test(requestKey)) throw new AppError('A valid checkout request key is required.');
        send(201, store.createOrder(session.hash, requestKey, business, person, priced, checked)); return;
      }
    } catch (error) {
      send(error instanceof AppError ? error.status : 500, { error: error instanceof AppError ? error.message : 'Something went wrong. Please retry.', code: error instanceof AppError ? error.code : 'INTERNAL_ERROR' });
    }
  });
  return { server, store, data };
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
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => app.server.close(() => { app.store.close(); process.exit(0); }));
}
