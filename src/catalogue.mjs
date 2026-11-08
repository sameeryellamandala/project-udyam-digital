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
  const sites=integer(raw.sites,1,1000,'Locations');
  let cameraCount=raw.cameraCount===undefined||raw.cameraCount===null||raw.cameraCount===''?null:integer(raw.cameraCount,1,10000,'Camera count');
  let locations;
  if(raw.locations!==undefined&&raw.locations!==null){
    if(!Array.isArray(raw.locations))throw new AppError('Location details must be a list.');
    if(raw.locations.length){
      if(raw.locations.length!==sites)throw new AppError('Provide details for every business location.');
      const ids=new Set();
      locations=raw.locations.map((location,index)=>{
        if(!location||typeof location!=='object')throw new AppError('Invalid business location.');
        const id=location.id||'branch-'+(index+1);
        if(typeof id!=='string'||!/^[-a-zA-Z0-9_]{1,40}$/.test(id)||ids.has(id))throw new AppError('Each location needs a unique valid ID.');
        ids.add(id);
        return {id,name:text(location.name||'Branch '+(index+1),100),city:text(location.city||'',100),
          cityTier:location.cityTier===null||location.cityTier===undefined||location.cityTier===''?null:integer(location.cityTier,1,2,'Location city tier'),
          cameraCount:location.cameraCount===null||location.cameraCount===undefined||location.cameraCount===''?null:integer(location.cameraCount,0,10000,'Location camera count')};
      });
      if(locations.every(location=>location.cameraCount!==null)){
        const total=locations.reduce((sum,location)=>sum+location.cameraCount,0);
        if(total>10000)throw new AppError('Total camera count must be at most 10000.');
        if(raw.needs.includes('cctv')&&total>0)cameraCount=total;
      }
    }
  }
  return { businessName, segment: raw.segment, employees: integer(raw.employees, 1, 10000, 'Team size'), sites,
    cityTier: integer(raw.cityTier, 1, 2, 'City tier'), budget: integer(raw.budget, 1, 10000000, 'Budget'), needs: [...new Set(raw.needs)].sort(),
    cameraCount,currentTools: text(raw.currentTools || '', 500), language: ['en','hi','te','ta','kn','ml','mr'].includes(raw.language) ? raw.language : 'en',
    gstin: text(raw.gstin || '', 15).toUpperCase(), udyam: text(raw.udyam || '', 19).toUpperCase(),...(locations?{locations}:{}) };
}

export function gstFormat(id) {
  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(id)) return false;
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'; let sum = 0, factor = 2;
  for (let i = 13; i >= 0; i--) { let v = chars.indexOf(id[i]) * factor; sum += Math.floor(v / 36) + v % 36; factor = factor === 2 ? 1 : 2; }
  return chars[(36 - sum % 36) % 36] === id[14];
}

export function eligibility(p, business, data, locationId) {
  const reasons = [];
  const locations=locationId?business.locations?.filter(location=>location.id===locationId):business.locations;
  if(locationId&&!locations?.length)reasons.push('unknown business location');
  if(locations?.length){
    for(const location of locations)if(!p.tiers.includes(location.cityTier))reasons.push(location.cityTier===null?`city tier is missing for ${location.name}`:`unavailable in Tier ${location.cityTier} at ${location.name}`);
  }else if(!p.tiers.includes(business.cityTier))reasons.push('unavailable in this city tier');
  if (business.employees < p.minEmployees) reasons.push(`needs at least ${p.minEmployees} employees`);
  if (business.sites < p.minSites) reasons.push(`needs at least ${p.minSites} locations`);
  if (p.requiresGst && (!gstFormat(business.gstin) || data.gst.get(business.gstin)?.status !== 'Active')) reasons.push('needs a valid active GSTIN');
  return reasons;
}

export function quote(business, items, data) {
  if (!Array.isArray(items) || !items.length || items.length > 25*Math.max(1,business.locations?.length||0)) throw new AppError('Choose between 1 and 25 products per location.');
  if(business.locations?.some(location=>location.cityTier===null))throw new AppError('Choose a city tier for every location.',409,'INCOMPLETE_LOCATIONS');
  if(business.locations?.length){
    items=items.flatMap(item=>{
      const product=data.products.find(product=>product.id===item?.productId);
      if(item?.locationId||!product)return [item];
      if(product.unit==='per site'){
        if(item.quantity!==business.sites)throw new AppError(`${product.name}: select the location or choose one unit per location.`);
        return business.locations.map(location=>({...item,quantity:1,locationId:location.id}));
      }
      if(product.unit==='per camera'){
        if(business.locations.some(location=>location.cameraCount===null)||business.locations.reduce((sum,location)=>sum+location.cameraCount,0)!==item.quantity)throw new AppError('Specify camera quantities for each location before pricing CCTV.',409,'INCOMPLETE_LOCATIONS');
        return business.locations.filter(location=>location.cameraCount>0).map(location=>({...item,quantity:location.cameraCount,locationId:location.id}));
      }
      if(product.requiresOneOf.length)throw new AppError(`Choose a location for ${product.name}.`,400,'LOCATION_REQUIRED');
      return [item];
    });
  }
  const ids = new Set();
  const lines = items.map(item => {
    if (!item || typeof item !== 'object') throw new AppError('Invalid quote item.');
    const p = data.products.find(p => p.id === item.productId);
    if (!p) throw new AppError('Unknown product.');
    const location=item.locationId?business.locations?.find(location=>location.id===item.locationId):null;
    if(item.locationId&&!location)throw new AppError('Choose a valid business location.',400,'INVALID_LOCATION');
    const key=p.id+':'+(location?.id||'shared');
    if (ids.has(key)) throw new AppError(`Duplicate product: ${p.name}.`); ids.add(key);
    const quantity = integer(item.quantity, 1, 10000, 'Quantity');
    if (p.unit === 'per site' && quantity !== (location?1:business.sites)) throw new AppError(`${p.name}: choose one unit per location (${location?1:business.sites}).`);
    const reasons = eligibility(p, business, data,location?.id);
    if (reasons.length) throw new AppError(`${p.name}: ${reasons.join('; ')}.`, 400, 'INELIGIBLE_PRODUCT');
    return { productId: p.id,...(location?{locationId:location.id,locationName:location.name,cityTier:location.cityTier}:{}), name: p.name, description: p.description, reason:productReason(p,business,quantity), unit: p.unit, quantity, unitPrice: p.price, unitPriceMax:p.maxPrice, monthly: p.price * quantity, monthlyMax:p.maxPrice*quantity, setup: p.setup * quantity, contractMonths: p.contractMonths, installDays: p.installDays };
  });
  for (const line of lines) { const p = data.products.find(p => p.id === line.productId); if (p.requiresOneOf.length && !lines.some(candidate=>p.requiresOneOf.includes(candidate.productId)&&(!business.locations?.length||candidate.locationId===line.locationId))) throw new AppError(`${p.name}${line.locationName?' at '+line.locationName:''} needs one of: ${p.requiresOneOf.join(', ')} at the same location.`, 400, 'MISSING_DEPENDENCY'); }
  const serviceProducts={internet:['P01','P02','P03','P04','P05','P06'],mobile:['P07','P08'],email:['P16'],backup:['P09','P17'],security:['P20','P21'],pos:['P19'],whatsapp:['P15'],cctv:['P23'],iot:['P24']};
  const requestedIds=new Set(business.needs.flatMap(need=>serviceProducts[need]||[]));
  const supportingIds=new Set();
  for(const line of lines.filter(line=>requestedIds.has(line.productId))){
    const product=data.products.find(product=>product.id===line.productId);
    for(const id of product.requiresOneOf)if(lines.some(candidate=>candidate.productId===id&&candidate.locationId===line.locationId))supportingIds.add(id+':'+(line.locationId||'shared'));
  }
  for(const line of lines)line.selectionType=requestedIds.has(line.productId)?'requested':supportingIds.has(line.productId+':'+(line.locationId||'shared'))?'supporting':'addon';
  const breakdown=Object.fromEntries(['requested','supporting','addon'].map(type=>{
    const selected=lines.filter(line=>line.selectionType===type);
    return [type,{monthly:selected.reduce((sum,line)=>sum+line.monthly,0),setup:selected.reduce((sum,line)=>sum+line.setup,0)}];
  }));
  const monthly = lines.reduce((s, x) => s + x.monthly, 0), monthlyMax=lines.reduce((s,x)=>s+x.monthlyMax,0);
  const warnings=[];
  if(monthly>business.budget)warnings.push('The minimum catalogue total exceeds your monthly budget. Remove items or increase your budget before ordering.');
  else if(monthlyMax>business.budget)warnings.push('The catalogue price range may exceed your monthly budget. Confirm the final price before accepting.');
  const locationTotals=business.locations?.map(location=>{
    const selected=lines.filter(line=>line.locationId===location.id);
    return {...location,monthly:selected.reduce((sum,line)=>sum+line.monthly,0),monthlyMax:selected.reduce((sum,line)=>sum+line.monthlyMax,0),setup:selected.reduce((sum,line)=>sum+line.setup,0)};
  });
  const sharedMonthly=lines.filter(line=>!line.locationId).reduce((sum,line)=>sum+line.monthly,0);
  return { items: lines, breakdown,...(locationTotals?{locationTotals,sharedMonthly}:{}), monthly, monthlyMax, checkoutMonthly:monthly, pricingPolicy:'catalogue_minimum_demo_v1',
    pricingNote:'Fixed demo quote uses each supplied catalogue minimum. The catalogue range is shown for reference. A real provider must confirm price and availability.',
    setup: lines.reduce((s, x) => s + x.setup, 0), contractMonths: Math.max(...lines.map(x => x.contractMonths)), installDays: Math.max(...lines.map(x => x.installDays)),
    taxNote: 'Fixed demo quote uses catalogue minimums. Setup is one-time; taxes are excluded.', warnings };
}

export function quoteItems(items){
  return items.map(item=>({productId:item.productId,quantity:item.quantity,...(item.locationId?{locationId:item.locationId}:{})}));
}

export function productReason(p,b,q) {
  const hi=b.language==='hi';
  const purposes={P01:['Reliable internet for everyday payments and work.','भुगतान और रोज़ के काम के लिए इंटरनेट।'],P02:['Extra bandwidth for shared work, video calls and business apps.','साझा काम, वीडियो कॉल और बिज़नेस ऐप के लिए अधिक स्पीड।'],P04:['Wireless internet when a fibre connection is not practical.','फाइबर उपलब्ध न होने पर वायरलेस इंटरनेट।'],P05:['Dedicated bandwidth for business-critical applications.','ज़रूरी बिज़नेस ऐप के लिए समर्पित बैंडविड्थ।'],P07:[`${q} separate work line(s); change the quantity to match your team.`,`${q} अलग काम के SIM; टीम के अनुसार संख्या बदलें।`],P09:['Keeps connectivity available when the main connection fails.','मुख्य इंटरनेट बंद होने पर बैकअप कनेक्शन।'],P16:[`Business email and shared office tools for ${q} team member(s).`,`${q} कर्मचारियों के लिए बिज़नेस ईमेल और ऑफ़िस टूल।`],P17:['Backs up business files; this is file backup, not internet failover.','बिज़नेस फ़ाइलों का बैकअप; यह इंटरनेट का बैकअप नहीं है।'],P19:['Billing, inventory and payment tools for your counter.','काउंटर के लिए बिलिंग, स्टॉक और भुगतान के टूल।'],P20:[`Endpoint protection for ${q} device(s); adjust for actual device count.`,`${q} डिवाइस की सुरक्षा; वास्तविक संख्या के अनुसार बदलें।`],P15:['A business WhatsApp channel for customer conversations.','ग्राहकों से बातचीत के लिए बिज़नेस WhatsApp।'],P23:['Remote camera viewing with cloud recordings.','क्लाउड रिकॉर्डिंग और कैमरा दूर से देखने की सुविधा।'],P24:['Monitor machine uptime and energy use.','मशीन के काम के समय और ऊर्जा उपयोग की निगरानी।']};
  return purposes[p.id]?.[hi?1:0] || (hi?'आपकी चुनी सेवा; शर्तें और संख्या जाँचें।':'Your selected service; review its quantity and conditions.');
}

export function recommend(business, data) {
  return recommendForNeeds(business,data,{cameraCount:business.cameraCount});
}

export function recommendForNeeds(business, data, requestedQuantities = {}) {
  if(business.locations?.length)return recommendForLocations(business,data,requestedQuantities);
  const available=data.products.filter(p=>!eligibility(p,business,data).length), warnings=[];
  const groups={internet:business.segment==='mfg'?['P05','P02','P01','P04']:business.segment==='micro'?['P01','P04']:['P02','P01','P04'],mobile:['P07'],email:['P16'],backup:['P09','P17'],security:['P20'],pos:['P19'],whatsapp:['P15'],cctv:['P23'],iot:['P24']};
  const primaryInternetIds=new Set(['P01','P02','P03','P04','P05','P06']);
  const requested=needsList.filter(n=>business.needs.includes(n));
  if(requested.includes('cctv')&&(!Number.isInteger(requestedQuantities.cameraCount)||requestedQuantities.cameraCount<1)){
    return {profile:business,quote:null,alternatives:[],warnings:['How many CCTV cameras do you need? Enter a camera count before preparing a complete package quote.'],eligibleProducts:available,coverage:{requested,covered:[]}};
  }
  const quantity=p=>p.unit==='per site'?business.sites:p.unit==='per camera'&&Number.isInteger(requestedQuantities.cameraCount)&&requestedQuantities.cameraCount>0?requestedQuantities.cameraCount:p.unit==='per line'&&p.id==='P07'&&Number.isInteger(requestedQuantities.mobileLines)&&requestedQuantities.mobileLines>0?requestedQuantities.mobileLines:p.unit==='per user'&&p.id==='P16'&&Number.isInteger(requestedQuantities.emailAccounts)&&requestedQuantities.emailAccounts>0?requestedQuantities.emailAccounts:['per user','per device'].includes(p.unit)?business.employees:p.unit==='per line'?Math.min(business.employees,2):1;
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
    // A single blocked service must not label every other requested service as
    // unavailable. Report only standalone eligibility/dependency blockers.
    const reasons=requested.flatMap(need=>{
      const products=groups[need].map(id=>data.products.find(p=>p.id===id)).filter(Boolean);
      const feasible=p=>!eligibility(p,business,data).length&&(!p.requiresOneOf.length||available.some(d=>p.requiresOneOf.includes(d.id)));
      if(products.some(feasible))return [];
      return products.map(p=>{
        const restrictions=eligibility(p,business,data);
        if(!restrictions.length&&p.requiresOneOf.length)restrictions.push(`needs an eligible supporting service: ${p.requiresOneOf.map(id=>data.products.find(d=>d.id===id)?.name||id).join(', ')}`);
        return business.language==='hi'?`${p.name}: ${restrictions.join('; ')}। इस सेवा की शर्तें पूरी करें या ज़रूरतें बदलें।`:`${p.name} cannot be included: ${restrictions.join('; ')}. Meet these requirements or change your requested services.`;
      });
    });
    if(!reasons.length)reasons.push(business.language==='hi'?'अनुरोधित सेवाओं की निर्भरताएँ एक साथ पूरी नहीं हो सकीं। सेवाओं की शर्तें जाँचें।':'The requested services cannot be combined with their catalogue dependencies. Review the service requirements.');
    warnings.push(...reasons);
    return {profile:business,quote:null,alternatives:[],warnings,eligibleProducts:available,coverage:{requested,covered:[]}};
  }
  const makeQuote=candidate=>quote(business,candidate.items,data);
  return {profile:business,quote:makeQuote(best),alternatives:ordered.slice(1,8).map(makeQuote),warnings,eligibleProducts:available,coverage:{requested,covered:best.covered}};
}

function recommendForLocations(business,data,requestedQuantities){
  const eligibleProducts=data.products.map(product=>({...product,availableLocationIds:business.locations.filter(location=>!eligibility(product,business,data,location.id).length).map(location=>location.id)})).filter(product=>product.availableLocationIds.length);
  const empty=message=>({profile:business,quote:null,alternatives:[],warnings:[message],eligibleProducts,coverage:{requested:business.needs,covered:[]}});
  const missingTier=business.locations.find(location=>location.cityTier===null);
  if(missingTier)return empty(`Is ${missingTier.name} in Tier 1 or Tier 2?`);
  if(business.needs.includes('cctv')){
    const missingCameras=business.locations.find(location=>location.cameraCount===null);
    if(missingCameras)return empty(`How many cameras do you need at ${missingCameras.name}? Enter 0 if none are needed there.`);
    if(!business.locations.some(location=>location.cameraCount>0))return empty('Specify a positive camera quantity at at least one location.');
  }
  const rankCandidates=(a,b)=>{
    const fit=entry=>entry.quote.monthlyMax<=business.budget?0:entry.quote.monthly<=business.budget?1:2;
    return fit(a)-fit(b)||(fit(a)===2?a.quote.monthly-b.quote.monthly:0)||a.rank-b.rank||a.quote.monthly-b.quote.monthly;
  };
  let candidates=[{items:[],rank:0}];
  for(const location of business.locations){
    const localBusiness={...business,locations:undefined,sites:1,cityTier:location.cityTier,cameraCount:location.cameraCount,
      needs:business.needs.filter(need=>need!=='cctv'||location.cameraCount>0)};
    if(!localBusiness.needs.length)continue;
    const local=recommendForNeeds(localBusiness,data,{...requestedQuantities,cameraCount:location.cameraCount});
    if(!local.quote)return empty(`${location.name}: ${local.warnings.join(' ')}`);
    const next=new Map();
    for(const candidate of candidates){
      for(const [rank,option]of [local.quote,...local.alternatives].entries()){
        const combined=new Map(candidate.items.map(item=>[item.productId+':'+(item.locationId||'shared'),item]));
        for(const line of option.items){
          const product=data.products.find(product=>product.id===line.productId);
          const scoped=product.unit==='per site'||product.unit==='per camera'||product.requiresOneOf.length>0;
          const item={productId:line.productId,quantity:line.quantity,...(scoped?{locationId:location.id}:{})};
          const key=item.productId+':'+(item.locationId||'shared'),prior=combined.get(key);
          combined.set(key,prior?{...item,quantity:Math.max(prior.quantity,item.quantity)}:item);
        }
        const items=[...combined.values()],signature=JSON.stringify(items);
        try{
          const priced=quote(business,items,data),entry={items,quote:priced,rank:candidate.rank+rank};
          if(!next.has(signature)||next.get(signature).rank>entry.rank)next.set(signature,entry);
        }catch(error){if(!(error instanceof AppError))throw error;}
      }
    }
    candidates=[...next.values()].sort(rankCandidates).slice(0,16);
    if(!candidates.length)return empty(`No complete eligible package is available for ${location.name}. Review its requirements.`);
  }
  const ordered=candidates.filter(candidate=>candidate.quote).sort(rankCandidates);
  if(!ordered.length)return empty('Select services for at least one location.');
  return {profile:business,quote:ordered[0].quote,alternatives:ordered.slice(1,8).map(candidate=>candidate.quote),warnings:[],eligibleProducts,coverage:{requested:business.needs,covered:business.needs}};
}
