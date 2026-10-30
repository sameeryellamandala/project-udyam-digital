import { recommend, profile } from './catalogue.mjs';

// Explicit rules for the no-key mode. This is never presented as a live LLM.
export function guidedAdvisor(business,messages,data,unavailable=false){
  const raw=messages.filter(m=>m.role==='user').at(-1)?.content||'';
  const message=raw.toLowerCase().replace(/[०-९]/g,c=>String('०१२३४५६७८९'.indexOf(c)));
  const next={...business}; const changes=[];
  const staff=message.match(/(\d+)\s*(?:employees?|people|staff|users?|कर्मचारी|लोग)/)||message.match(/(?:team of|कर्मचारी)\s*(\d+)/);
  const sites=message.match(/(\d+)\s*(?:sites?|locations?|branches?|stores?|शाखा|दुकान)/);
  const budget=message.match(/(?:budget|under|within|बजट|अंदर)\s*(?:is|of|है|:)?\s*[₹रु.\s]*([\d,]+)/)||message.match(/₹\s*([\d,]+)/)||message.match(/([\d,]+)\s*(?:rupees|रुपये|per month|\/month)/);
  if(staff){next.employees=Number(staff[1]);changes.push('team size');}
  if(sites){next.sites=Number(sites[1]);changes.push('locations');}
  if(budget){next.budget=Number(budget[1].replace(/,/g,''));changes.push('budget');}
  const type=[['prof',/clinic|doctor|office|coaching|क्लिनिक|ऑफ़िस|कार्यालय/],['micro',/kirana|salon|pharmacy|retail|किराना|सैलून/],['multi',/restaurant chain|multi.site|chain of|रेस्तरां/],['mfg',/manufactur|factory|machine|फैक्टरी|कारखाना/]].find(([,r])=>r.test(message));
  if(type){next.segment=type[0];changes.push('business type');}
  const tier=message.match(/tier\s*([12])/);if(tier){next.cityTier=Number(tier[1]);changes.push('city tier');}
  const patterns={internet:/internet|broadband|fibre|fiber|इंटरनेट/,mobile:/sims?\b|mobile lines?|मोबाइल|सिम/,email:/e-?mail|ईमेल/,backup:/backup|failover|बैकअप/,security:/security|antivirus|सुरक्षा/,pos:/billing|\bpos\b|बिलिंग/,whatsapp:/whatsapp|व्हाट्स/,cctv:/cctv|camera|कैमरा/,iot:/\biot\b|machine monitoring/};
  const mentioned=Object.entries(patterns).filter(([,r])=>r.test(message)).map(([key])=>key);
  const asksWhy=/why|explain|क्यों|समझा/.test(message);
  if(mentioned.length&&!asksWhy){next.needs=mentioned;changes.push('services');}
  let proposed=null;try{if(changes.length)proposed=profile(next);}catch{}
  const result=recommend(proposed||business,data),hi=business.language==='hi';
  const prefix=unavailable?(hi?'लाइव AI उपलब्ध नहीं है। ':'Live AI is unavailable. '):'';
  let reply=prefix+(hi?'गाइडेड मोड: ':'Guided mode: ');
  if(changes.length&&!proposed)reply+=hi?'यह संख्या मान्य नहीं है। नीचे दिए विवरण जाँचें।':'That change is outside the supported limits. Please check the business fields.';
  else if(result.quote){
    reply+=(hi?`आपकी ज़रूरतों के लिए कैटलॉग पैकेज ₹${result.quote.monthly.toLocaleString('en-IN')}/महीना है (कर अलग)। `:`The catalogue package for these needs is ₹${result.quote.monthly.toLocaleString('en-IN')}/month before taxes. `);
    reply+=result.quote.items.map(x=>`${x.name} × ${x.quantity}: ${x.reason}`).join('\n');
    if(result.warnings.length)reply+='\n'+result.warnings.join('\n');
    reply+='\n'+(proposed?(hi?'सुझाव लागू करें, विवरण जाँचें और पैकेज खोजें।':'Apply the suggestions, review your details, then find your package.'):(hi?'क्या आपको ईमेल, बैकअप या मोबाइल SIM भी चाहिए?':'Do you also need email, backup or work SIMs?'));
  }else reply+=hi?'अभी कोई पैकेज इस बजट में नहीं आता। बजट बढ़ाएँ या कम सेवाएँ चुनें।':'No eligible package fits that budget yet. Increase the budget or choose fewer services.';
  return {mode:'guided',reply,proposedProfile:proposed};
}
