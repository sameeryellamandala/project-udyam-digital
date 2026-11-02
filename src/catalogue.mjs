import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export class AppError extends Error {
  constructor(message, status = 400, code = 'INVALID_INPUT') { super(message); this.status = status; this.code = code; }
}

export function csv(text) {
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (!quoted && (c === ',' || c === '\n')) { row.push(cell.replace(/\r$/, '')); cell = ''; if (c === '\n') { if (row.some(Boolean)) rows.push(row); row = []; } }
    else cell += c;
  }
  if (quoted) throw new AppError('Unclosed quoted field in source CSV.');
  if (cell || row.length) { row.push(cell.replace(/\r$/, '')); rows.push(row); }
  const headers = rows.shift()?.map(x => x.replace(/^\uFEFF/, '')) || [];
  return rows.map(r => Object.fromEntries(headers.map((h, i) => [h, r[i] || ''])));
}

export function loadData(dir) {
  const read = name => csv(readFileSync(resolve(dir, name), 'utf8'));
  const products = read('product_catalogue.csv').map(p => ({
    id: p.product_id, name: p.product_name, description: p.description, category: p.category, unit: p.unit,
    price: Number(p.price_min_inr_per_month), maxPrice: Number(p.price_max_inr_per_month), setup: Number(p.one_time_setup_inr),
    contractMonths: Number(p.min_contract_months), installDays: Number(p.typical_install_days),
    tiers: p.available_city_tiers.split(';').map(Number), minEmployees: Number(p.min_employees), minSites: Number(p.min_sites),
    requiresGst: p.requires_gstin === 'Y', requiresOneOf: p.requires_one_of ? p.requires_one_of.split('|') : [], segments: p.target_segments.split(';')
  }));
  if (products.length !== 25 || products.some(p => !p.id || !Number.isFinite(p.price))) throw new Error('Invalid product catalogue. Expected 25 products.');
  return { products, gst: new Map(read('mock_gstin_registry.csv').map(r => [r.gstin, r])), udyam: new Map(read('mock_udyam_registry.csv').map(r => [r.udyam_number, r])) };
}

export function text(value, max = 200) { if (typeof value !== 'string' || value.trim().length > max) throw new AppError(`Expected text up to ${max} characters.`); return value.trim(); }
function integer(value, min, max, label) { if (!Number.isInteger(value) || value < min || value > max) throw new AppError(`${label} must be a whole number from ${min} to ${max}.`); return value; }
export const needsList = ['internet', 'mobile', 'email', 'backup', 'security', 'pos', 'whatsapp', 'cctv', 'iot'];
export function profile(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new AppError('Business profile is required.');
  if (!['micro', 'prof', 'multi', 'mfg'].includes(raw.segment)) throw new AppError('Choose a business type.');
  if (!Array.isArray(raw.needs) || !raw.needs.length || raw.needs.some(n => !needsList.includes(n))) throw new AppError('Choose at least one supported service.');
  const businessName = text(raw.businessName, 120); if (!businessName) throw new AppError('Business name is required.');
  return { businessName, segment: raw.segment, employees: integer(raw.employees, 1, 10000, 'Team size'), sites: integer(raw.sites, 1, 1000, 'Locations'),
    cityTier: integer(raw.cityTier, 1, 2, 'City tier'), budget: integer(raw.budget, 1, 10000000, 'Budget'), needs: [...new Set(raw.needs)].sort(),
    currentTools: text(raw.currentTools || '', 500), language: raw.language === 'hi' ? 'hi' : 'en',
    gstin: text(raw.gstin || '', 15).toUpperCase(), udyam: text(raw.udyam || '', 19).toUpperCase() };
}

export function gstFormat(id) {
  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(id)) return false;
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'; let sum = 0, factor = 2;
  for (let i = 13; i >= 0; i--) { let v = chars.indexOf(id[i]) * factor; sum += Math.floor(v / 36) + v % 36; factor = factor === 2 ? 1 : 2; }
  return chars[(36 - sum % 36) % 36] === id[14];
}

export function eligibility(p, business, data) {
  const reasons = [];
  if (!p.tiers.includes(business.cityTier)) reasons.push('unavailable in this city tier');
  if (business.employees < p.minEmployees) reasons.push(`needs at least ${p.minEmployees} employees`);
  if (business.sites < p.minSites) reasons.push(`needs at least ${p.minSites} locations`);
  if (p.requiresGst && (!gstFormat(business.gstin) || data.gst.get(business.gstin)?.status !== 'Active')) reasons.push('needs a valid active GSTIN');
  return reasons;
}

export function quote(business, items, data) {
  if (!Array.isArray(items) || !items.length || items.length > 25) throw new AppError('Choose between 1 and 25 products.');
  const ids = new Set();
  const lines = items.map(item => {
    if (!item || typeof item !== 'object') throw new AppError('Invalid quote item.');
    const p = data.products.find(p => p.id === item.productId);
    if (!p) throw new AppError('Unknown product.');
    if (ids.has(p.id)) throw new AppError(`Duplicate product: ${p.name}.`); ids.add(p.id);
    const quantity = integer(item.quantity, 1, 10000, 'Quantity');
    if (p.unit === 'per site' && quantity !== business.sites) throw new AppError(`${p.name}: choose one unit per location (${business.sites}).`);
    const reasons = eligibility(p, business, data);
    if (reasons.length) throw new AppError(`${p.name}: ${reasons.join('; ')}.`, 400, 'INELIGIBLE_PRODUCT');
    return { productId: p.id, name: p.name, description: p.description, reason:productReason(p,business,quantity), unit: p.unit, quantity, unitPrice: p.price, unitPriceMax:p.maxPrice, monthly: p.price * quantity, monthlyMax:p.maxPrice*quantity, setup: p.setup * quantity, contractMonths: p.contractMonths, installDays: p.installDays };
  });
  for (const line of lines) { const p = data.products.find(p => p.id === line.productId); if (p.requiresOneOf.length && !p.requiresOneOf.some(id => ids.has(id))) throw new AppError(`${p.name} needs one of: ${p.requiresOneOf.join(', ')}.`, 400, 'MISSING_DEPENDENCY'); }
  const monthly = lines.reduce((s, x) => s + x.monthly, 0), monthlyMax=lines.reduce((s,x)=>s+x.monthlyMax,0);
  const warnings=[];
  if(monthly>business.budget)warnings.push('The minimum catalogue total exceeds your monthly budget. Remove items or increase your budget before ordering.');
  else if(monthlyMax>business.budget)warnings.push('The catalogue price range may exceed your monthly budget. Confirm the final price before accepting.');
  return { items: lines, monthly, monthlyMax, checkoutMonthly:monthly, pricingPolicy:'catalogue_minimum_demo_v1',
    pricingNote:'Fixed demo quote uses each supplied catalogue minimum. The catalogue range is shown for reference. A real provider must confirm price and availability.',
    setup: lines.reduce((s, x) => s + x.setup, 0), contractMonths: Math.max(...lines.map(x => x.contractMonths)), installDays: Math.max(...lines.map(x => x.installDays)),
    taxNote: 'Fixed demo quote uses catalogue minimums. Setup is one-time; taxes are excluded.', warnings };
}

export function productReason(p,b,q) {
  const hi=b.language==='hi';
  const purposes={P01:['Reliable internet for everyday payments and work.','भुगतान और रोज़ के काम के लिए इंटरनेट।'],P02:['Extra bandwidth for shared work, video calls and business apps.','साझा काम, वीडियो कॉल और बिज़नेस ऐप के लिए अधिक स्पीड।'],P04:['Wireless internet when a fibre connection is not practical.','फाइबर उपलब्ध न होने पर वायरलेस इंटरनेट।'],P05:['Dedicated bandwidth for business-critical applications.','ज़रूरी बिज़नेस ऐप के लिए समर्पित बैंडविड्थ।'],P07:[`${q} separate work line(s); change the quantity to match your team.`,`${q} अलग काम के SIM; टीम के अनुसार संख्या बदलें।`],P09:['Keeps connectivity available when the main connection fails.','मुख्य इंटरनेट बंद होने पर बैकअप कनेक्शन।'],P16:[`Business email and shared office tools for ${q} team member(s).`,`${q} कर्मचारियों के लिए बिज़नेस ईमेल और ऑफ़िस टूल।`],P17:['Backs up business files; this is file backup, not internet failover.','बिज़नेस फ़ाइलों का बैकअप; यह इंटरनेट का बैकअप नहीं है।'],P19:['Billing, inventory and payment tools for your counter.','काउंटर के लिए बिलिंग, स्टॉक और भुगतान के टूल।'],P20:[`Endpoint protection for ${q} device(s); adjust for actual device count.`,`${q} डिवाइस की सुरक्षा; वास्तविक संख्या के अनुसार बदलें।`],P15:['A business WhatsApp channel for customer conversations.','ग्राहकों से बातचीत के लिए बिज़नेस WhatsApp।'],P23:['Remote camera viewing with cloud recordings.','क्लाउड रिकॉर्डिंग और कैमरा दूर से देखने की सुविधा।'],P24:['Monitor machine uptime and energy use.','मशीन के काम के समय और ऊर्जा उपयोग की निगरानी।']};
  return purposes[p.id]?.[hi?1:0] || (hi?'आपकी चुनी सेवा; शर्तें और संख्या जाँचें।':'Your selected service; review its quantity and conditions.');
}

export function recommend(business, data) {
  return recommendForNeeds(business,data,{});
}

export function recommendForNeeds(business, data, requestedQuantities = {}) {
  const available=data.products.filter(p=>!eligibility(p,business,data).length), warnings=[];
  const groups={internet:business.segment==='mfg'?['P05','P02','P01','P04']:business.segment==='micro'?['P01','P04']:['P02','P01','P04'],mobile:['P07'],email:['P16'],backup:['P09','P17'],security:['P20'],pos:['P19'],whatsapp:['P15'],cctv:['P23'],iot:['P24']};
  const primaryInternetIds=new Set(['P01','P02','P03','P04','P05','P06']);
  const requested=needsList.filter(n=>business.needs.includes(n));
  const quantity=p=>p.unit==='per site'?business.sites:p.unit==='per line'&&p.id==='P07'&&Number.isInteger(requestedQuantities.mobileLines)&&requestedQuantities.mobileLines>0?requestedQuantities.mobileLines:p.unit==='per user'&&p.id==='P16'&&Number.isInteger(requestedQuantities.emailAccounts)&&requestedQuantities.emailAccounts>0?requestedQuantities.emailAccounts:['per user','per device'].includes(p.unit)?business.employees:p.unit==='per line'?Math.min(business.employees,2):1;
  const candidates=new Map();
  function search(index,items,covered,rank,spent){
    if(index===requested.length){
      if(covered.length===requested.length){
        const signature=items.map(x=>`${x.productId}:${x.quantity}`).sort().join('|');
        const maximum=items.reduce((total,item)=>total+data.products.find(p=>p.id===item.productId).maxPrice*item.quantity,0);
        if(!candidates.has(signature))candidates.set(signature,{items,covered,rank,spent,maximum});
      }
      return;
    }
    const need=requested[index];
    for(const [priority,id] of groups[need].entries()){
      const p=available.find(p=>p.id===id);if(!p)continue;
      let next=[...items],cost=spent;
      if(p.requiresOneOf.length&&!p.requiresOneOf.some(id=>next.some(x=>x.productId===id))){
        if(next.some(item=>primaryInternetIds.has(item.productId)))continue;
        const dependency=available.filter(d=>p.requiresOneOf.includes(d.id)).sort((a,b)=>a.price*quantity(a)-b.price*quantity(b))[0];
        if(!dependency)continue;
        const q=quantity(dependency);next.push({productId:dependency.id,quantity:q});cost+=dependency.price*q;
      }
      if(!next.some(x=>x.productId===id)){const q=quantity(p);next.push({productId:id,quantity:q});cost+=p.price*q;}
      search(index+1,next,[...covered,need],rank+priority,cost);
    }
  }
  search(0,[],[],0,0);
  const ordered=[...candidates.values()].sort((a,b)=>{
    const fit=x=>x.maximum<=business.budget?0:x.spent<=business.budget?1:2;
    const byFit=fit(a)-fit(b);if(byFit)return byFit;
    if(fit(a)===2&&a.spent!==b.spent)return a.spent-b.spent;
    return a.rank-b.rank||a.spent-b.spent||a.maximum-b.maximum;
  });
  const best=ordered[0];
  if(!best){
    const reasons=requested.map(need=>{
      const blocked=groups[need].map(id=>data.products.find(p=>p.id===id)).filter(Boolean).map(p=>({product:p,reasons:eligibility(p,business,data)}));
      const explanation=blocked.flatMap(x=>x.reasons.map(reason=>`${x.product.name}: ${reason}`));
      return business.language==='hi'?`${need}: पात्रता या निर्भरता के कारण इसे पूरे पैकेज में शामिल नहीं कर सके। विवरण या सेवाएँ जाँचें।`:`We could not include ${need} in a complete eligible bundle${explanation.length?` (${[...new Set(explanation)].join('; ')})`:''}. Review the requirements or service availability.`;
    });
    warnings.push(...reasons);
    return {profile:business,quote:null,alternatives:[],warnings,eligibleProducts:available,coverage:{requested,covered:[]}};
  }
  const makeQuote=candidate=>quote(business,candidate.items,data);
  return {profile:business,quote:makeQuote(best),alternatives:ordered.slice(1,8).map(makeQuote),warnings,eligibleProducts:available,coverage:{requested,covered:best.covered}};
}
