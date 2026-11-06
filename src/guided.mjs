import { recommend, profile } from './catalogue.mjs';

// Explicit rules for the no-key mode. This is never presented as a live LLM.
export function guidedAdvisor(business,messages,data,unavailable=false){
  const userMessages=messages.filter(m=>m.role==='user');
  const raw=userMessages.at(-1)?.content||'';
  const message=raw.toLowerCase().replace(/[०-९]/g,c=>String('०१२३४५६७८९'.indexOf(c)));
  const previousAssistant=messages.slice(0,-1).filter(m=>m.role==='assistant').at(-1)?.content?.toLowerCase()||'';
  const hi=business.language==='hi';
  const prefix=unavailable?(hi?'लाइव AI उपलब्ध नहीं है। गाइडेड जवाब: ':'Live AI is unavailable. Guided answer: '):'';
  // A short numeric reply should answer the most recent question, not rebuild the same quote.
  const bareCount=message.trim().match(/^(\d{1,4})$/);
  if(bareCount&&/email accounts?|number of email|ईमेल अकाउंट|ईमेल खाते/.test(previousAssistant)){
    const count=Number(bareCount[1]);
    const email=data.products.find(p=>p.id==='P16');
    const reply=hi
      ?`समझ गया—${count} ईमेल अकाउंट। अभी यह प्रोटोटाइप ईमेल की संख्या कर्मचारियों के आधार पर रखता है। पैकेज में Cloud Email की संख्या ${count} करें; कीमत ${count} × ₹${email.price}/महीना होगी।`
      :`Got it: ${count} email accounts. This prototype currently starts the email quantity from the employee count. Set Cloud Email to ${count} in the package quote; at the catalogue minimum, that is ${count} × ₹${email.price}/month before taxes.`;
    return {mode:'guided',reply:prefix+reply,proposedProfile:null};
  }
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
  const result=recommend(proposed||business,data);
  // Mention the exact catalogue 5G offer when asked; the current automatic rank prefers fibre.
  if(/\b5g\b|airfiber/.test(message)){
    const p=result.eligibleProducts.find(p=>p.id==='P04');
    if(p){
      const currentInternet=result.quote?.items.find(x=>['P01','P02','P03','P04','P05','P06'].includes(x.productId));
      const format=n=>n.toLocaleString('en-IN');
      const reply=hi
        ?`अच्छा चुनाव। ${p.name}: ${p.description} कैटलॉग कीमत ₹${format(p.price)}–₹${format(p.maxPrice)}/साइट/महीना है। एक बार का सेटअप ₹${format(p.setup)} और न्यूनतम अनुबंध ${p.contractMonths} महीने है। इंस्टॉलेशन का सामान्य अनुमान ${p.installDays} दिन है; उपलब्धता की पुष्टि ज़रूरी है। पैकेज में इसे चुनें और दूसरा इंटरनेट विकल्प हटाएँ।`
        :`Good choice. ${p.name}: ${p.description} The catalogue monthly price is ₹${format(p.price)}–₹${format(p.maxPrice)} per site. One-time setup is ₹${format(p.setup)}, with a ${p.contractMonths}-month minimum contract. Typical installation is estimated at ${p.installDays} days after availability confirmation. Select it in your package and remove the other internet option.`;
      return {mode:'guided',reply:prefix+reply,proposedProfile:proposed};
    }
  }
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
