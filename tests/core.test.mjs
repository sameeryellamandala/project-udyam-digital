import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { csv, loadData, profile, quote, recommend, gstFormat, eligibility } from '../src/catalogue.mjs';
import { documentIssues, verify, validateDocuments } from '../src/kyc.mjs';
import { createStore } from '../src/store.mjs';
import { createApp } from '../server.mjs';
import { redact } from '../src/ai.mjs';
import { guidedAdvisor } from '../src/guided.mjs';

const data = loadData('YTL_TrackA_Udyam_Digital_Data');
const makeProfile = patch => profile({ businessName: 'Demo Clinic', segment: 'prof', employees: 5, sites: 1, cityTier: 1, budget: 3000, needs: ['internet', 'email'], ...patch });

test('advisor redacts common contact and registration patterns from free text', () => {
  const id = data.gst.keys().next().value;
  const output = redact(`${id} UDYAM-KL-00-3078801 9876543210 demo@example.com`);
  assert.ok(!output.includes(id)); assert.ok(!output.includes('3078801')); assert.ok(!output.includes('9876543210')); assert.ok(!output.includes('demo@example.com'));
});

test('CSV parser handles commas, escaped quotes and final line; all 25 products load', () => {
  assert.deepEqual(csv('id,name\r\n1,"A, ""B"""\r\n2,C'), [{ id: '1', name: 'A, "B"' }, { id: '2', name: 'C' }]);
  assert.equal(data.products.length, 25);
});
test('synthetic GST checksums and X entity type are accepted; altered checksum rejected', () => {
  const id = data.gst.keys().next().value; assert.equal(id[5], 'X'); assert.equal(gstFormat(id), true);
  assert.equal(gstFormat(id.slice(0, 14) + (id[14] === '0' ? '1' : '0')), false);
});
test('catalogue eligibility enforces tier, size, sites and active registration', () => {
  const p03 = data.products.find(p => p.id === 'P03'), p10 = data.products.find(p => p.id === 'P10');
  assert.ok(eligibility(p03, makeProfile({ cityTier: 2 }), data).some(x => x.includes('city')));
  assert.ok(eligibility(p03, makeProfile(), data).some(x => x.includes('GST')));
  assert.ok(eligibility(p10, makeProfile(), data).some(x => x.includes('locations')));
  const inactive = [...data.gst.values()].find(r => r.status !== 'Active');
  assert.ok(eligibility(p03, makeProfile({ gstin: inactive.gstin }), data).some(x => x.includes('GST')));
});
test('quote prices server-side, separates setup, enforces dependencies and quantities', () => {
  const q = quote(makeProfile(), [{ productId: 'P01', quantity: 1, price: 1 }, { productId: 'P09', quantity: 1 }], data);
  assert.equal(q.monthly, 1498); assert.equal(q.setup, 1500); assert.equal(q.contractMonths, 12); assert.equal(q.installDays, 5);
  assert.throws(() => quote(makeProfile(), [{ productId: 'P09', quantity: 1 }], data), /needs one of/);
  assert.throws(() => quote(makeProfile(), [{ productId: 'P01', quantity: 2 }], data), /per location/);
  assert.throws(() => quote(makeProfile(), [{ productId: 'P07', quantity: -1 }], data), /Quantity/);
  assert.throws(() => quote(makeProfile(), [{ productId: 'P07', quantity: 1 }, { productId: 'P07', quantity: 2 }], data), /Duplicate/);
  assert.throws(() => quote(makeProfile(), [{ productId: 'invented', quantity: 1 }], data), /Unknown/);
});
test('recommendations differ by need and do not conceal an impossible budget', () => {
  const clinic = recommend(makeProfile(), data), retail = recommend(makeProfile({ segment: 'micro', needs: ['internet', 'pos'] }), data);
  assert.ok(clinic.quote.items.some(x => x.productId === 'P16')); assert.ok(retail.quote.items.some(x => x.productId === 'P19'));
  assert.ok(clinic.quote.monthly <= 3000); assert.ok(retail.quote.monthly <= 3000);
  const none = recommend(makeProfile({ budget: 10 }), data); assert.equal(none.quote, null); assert.equal(none.warnings.length, 2);
});
test('KYC requires consent and never treats missing documents as verified', async () => {
  await assert.rejects(verify(data, {}, makeProfile(), { consent: false }), /consent/);
  const result = await verify(data, {}, makeProfile(), { consent: true, documents: [] });
  assert.equal(result.status, 'review_required'); assert.ok(result.issues.some(x => x.includes('missing')));
  const gst = [...data.gst.values()].find(r => r.status === 'Active');
  const checked = await verify(data, {}, makeProfile({ businessName: gst.legal_name, gstin: gst.gstin }), { consent: true, documents: [] });
  assert.equal(checked.status, 'review_required'); assert.ok(checked.checks.some(x => x.includes('active'))); assert.ok(!checked.gstin.includes(gst.gstin));
});
test('document checks reject mismatches and use the fixed reference date', () => {
  const gst = [...data.gst.values()][0], p = makeProfile({ businessName: gst.legal_name, gstin: gst.gstin });
  const fields = { readable: true, businessName: gst.legal_name, address: gst.principal_place_of_business, documentDate: '2026-07-01' };
  assert.deepEqual(documentIssues('address', fields, p, gst), []);
  assert.ok(documentIssues('address', { ...fields, documentDate: '2026-01-01' }, p, gst).some(x => x.includes('90 days')));
  assert.ok(documentIssues('address', { ...fields, documentDate: '2026-07-16' }, p, gst).length);
  assert.ok(documentIssues('gst', { ...fields, gstin: 'different' }, p, gst).some(x => x.includes('does not match')));
});
test('upload validation rejects executable data, wrong signatures and duplicate categories', () => {
  assert.throws(() => validateDocuments([{ kind: 'gst', dataUrl: 'data:text/html;base64,PHNjcmlwdD4=' }]), /JPEG/);
  assert.throws(() => validateDocuments([{ kind: 'gst', dataUrl: 'data:image/png;base64,PHNjcmlwdD4=' }]), /contents/);
  const doc = { kind: 'gst', dataUrl: 'data:image/png;base64,'+readFileSync('YTL_TrackA_Udyam_Digital_Data/kyc_documents/K01_gst_certificate.png').toString('base64') };
  assert.throws(() => validateDocuments([doc, doc]), /duplicate/);
});

test('recommendations fit all needs before upgrading internet and cover full email team',()=>{
  const result=recommend(makeProfile({employees:8,budget:2100}),data);
  assert.equal(result.quote.items.find(x=>x.productId==='P16').quantity,8);
  assert.equal(result.quote.items.find(x=>x.productId==='P01').quantity,1);
  assert.equal(result.coverage.covered.length,2);
  const camera=recommend(makeProfile({needs:['cctv']}),data);
  assert.ok(camera.quote.items.some(x=>['P01','P02','P03','P04','P05','P06'].includes(x.productId)));
  assert.ok(camera.quote.items.some(x=>x.productId==='P23'));
});
test('guided advisor applies explicit English/Hindi needs without claiming live AI',()=>{
  const en=guidedAdvisor(makeProfile(),[{role:'user',content:'I run a retail shop with 8 employees. My budget is 2500. I need internet and billing.'}],data);
  assert.equal(en.mode,'guided');assert.equal(en.proposedProfile.employees,8);assert.equal(en.proposedProfile.budget,2500);assert.deepEqual(en.proposedProfile.needs,['internet','pos']);assert.ok(en.reply.includes('Guided mode'));
  const hi=guidedAdvisor(makeProfile({language:'hi'}),[{role:'user',content:'मेरे क्लिनिक में ६ कर्मचारी हैं। बजट २५०० है। इंटरनेट और ईमेल चाहिए।'}],data);
  assert.equal(hi.proposedProfile.employees,6);assert.equal(hi.proposedProfile.budget,2500);assert.ok(hi.reply.includes('गाइडेड मोड'));
});
test('expired or mismatched signatory IDs cannot pass field checks',()=>{
  const p=makeProfile(),fields={readable:true,signatoryName:'Demo Owner',businessName:p.businessName,validTill:'2026-07-01'};
  assert.ok(documentIssues('signatory',fields,p,null,null,'Demo Owner').some(x=>x.includes('expired')));
  assert.ok(documentIssues('signatory',{...fields,businessName:'Wrong Business',validTill:'2028-01-01'},p,null,null,'Demo Owner').some(x=>x.includes('business name')));
});
test('storage survives reopen, enforces ownership, expiry and checkout idempotency', () => {
  const dir = mkdtempSync(join(tmpdir(), 'udyam-store-')), file = join(dir, 'test.sqlite'); let store;
  try {
    store = createStore(file); const owner = store.session(), other = store.session(), p = makeProfile();
    const q = recommend(p, data).quote, checked = { status: 'review_required', gstin: '', udyam: '' };
    const id = store.verification(owner.hash, p, checked); assert.ok(store.getVerification(owner.hash, p, id));
    assert.equal(store.getVerification(other.hash, p, id), null); assert.equal(store.getVerification(owner.hash, makeProfile({ budget: 4000 }), id), null);
    const first = store.createOrder(owner.hash, 'retry-key', p, {}, q, checked), again = store.createOrder(owner.hash, 'retry-key', p, {}, q, checked);
    assert.equal(first.id, again.id); assert.equal(store.getOrder(other.hash, first.id), null);
    store.close(); store = createStore(file); assert.equal(store.getOrder(owner.hash, first.id).quote.monthly, q.monthly);
    store.db.prepare('UPDATE sessions SET expires_at=? WHERE id_hash=?').run('2000-01-01', owner.hash); store.cleanup(); assert.equal(store.getOrder(owner.hash, first.id), null);
  } finally { store?.close(); rmSync(dir, { recursive: true, force: true }); }
});
test('HTTP journey: guided advisor, review order, refresh, authorization and private assets', async t => {
  const app = createApp({ data, dbPath: ':memory:', apiKey: '' });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => { app.server.closeAllConnections(); app.server.close(); app.store.close(); });
  const base = 'http://127.0.0.1:' + app.server.address().port;
  const session = await fetch(base + '/api/session'), cookie = session.headers.get('set-cookie').split(';')[0];
  const call = (path, input, options = {}) => fetch(base + path, { method: input ? 'POST' : 'GET', headers: { cookie, origin: base, 'content-type': 'application/json', ...options.headers }, body: input ? JSON.stringify(input) : undefined, ...options });
  const p = makeProfile(), person = { name: 'Demo Owner', phone: '9876543210', address: '10 Demo Road, Test City 400001' };
  assert.equal((await (await call('/api/catalogue')).json()).products.length, 25);
  const advice = await (await call('/api/advisor', { profile: p, messages: [{ role: 'user', content: 'Need reliable internet' }] })).json(); assert.equal(advice.mode, 'guided');
  const rec = await (await call('/api/recommend', { profile: p })).json();
  assert.equal((await call('/api/verify', { profile: p, consent: false, contact: person })).status, 403);
  const checked = await (await call('/api/verify', { profile: p, consent: true, contact: person, documents: [] })).json(); assert.equal(checked.status, 'review_required');
  const input = { profile: p, consent: true, contact: person, items: rec.quote.items.map(x => ({ productId: x.productId, quantity: x.quantity })), verificationId: checked.id, requestKey: '00000000-0000-4000-8000-000000000001' };
  const placed = await call('/api/orders', input); assert.equal(placed.status, 201); const order = await placed.json(); assert.equal(order.status, 'review_required');
  const retry = await (await call('/api/orders', input)).json(); assert.equal(retry.id, order.id);
  assert.equal((await (await call('/api/orders/' + order.id)).json()).id, order.id);
  assert.equal((await fetch(base + '/api/orders/' + order.id)).status, 404);
  assert.equal((await call('/api/orders', { ...input, contact: { ...person, name: 'Changed Owner' } })).status, 400);
  for (const path of ['/.env', '/var/udyam.sqlite', '/YTL_TrackA_Udyam_Digital_Data/mock_gstin_registry.csv', '/server.mjs']) assert.equal((await fetch(base + path)).status, 404);
  assert.equal((await fetch(base + '/api/recommend', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example' }, body: JSON.stringify({ profile: p }) })).status, 403);
  const oversized = await fetch(base + '/api/recommend', { method: 'POST', headers: { origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ text: 'x'.repeat(66000) }) }); assert.equal(oversized.status, 413);
});
