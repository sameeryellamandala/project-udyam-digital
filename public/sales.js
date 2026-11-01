const $=selector=>document.querySelector(selector);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>'₹'+Number(n||0).toLocaleString('en-IN');
let data={queue:[],summary:{}};

async function request(path,body){
  const response=await fetch(path,{method:body?'POST':'GET',credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
  const result=await response.json();if(!response.ok){const error=new Error(result.error||'Could not load the queue.');error.status=response.status;throw error;}return result;
}
function renderMetrics(){
  const metrics=[['Dropped enquiries',data.total??data.queue.length],['High priority',data.priorityCounts?.high??0],['Queued for follow-up',data.priorityCounts?.queued??0],['Open help requests',(data.supportCases||[]).filter(x=>x.status==='received').length],['Baseline activation',`${data.summary.conversionPct??0}%`]];
  $('#metrics').innerHTML=metrics.map(([label,value])=>`<div class="metric-card"><span>${esc(label)}</span><b>${esc(value)}</b></div>`).join('');
}
function renderFilters(){
  const select=$('#segment-filter'),previous=select.value;
  const segments=[...new Set(data.queue.map(x=>x.segment))].sort();
  select.innerHTML='<option value="all">All segments</option>'+segments.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
  if(segments.includes(previous))select.value=previous;
}
function renderQueue(){
  const priority=$('#priority-filter').value,segment=$('#segment-filter').value;
  const filtered=data.queue.filter(x=>(priority==='all'||x.priority===priority)&&(segment==='all'||x.segment===segment));
  $('#queue').innerHTML=filtered.map(x=>`<tr>
    <td><b>${esc(x.leadId)}</b><small>${esc(x.source)}</small></td>
    <td>${esc(x.segment)}<small>${esc(x.city)} · Tier ${esc(x.cityTier)} · ${esc(x.employees)} employees · ${esc(x.sites)} site(s)</small><small>Current internet: ${esc(x.currentInternet||'Not recorded')}</small></td>
    <td><span class="stage-pill">${esc(x.stage)}</span><small>${esc(x.quoteState)}</small><small class="blocker">${esc(x.dropReason)}</small></td>
    <td><b>Requested</b><small>${x.productsOfInterest.length?x.productsOfInterest.map(esc).join('<br>'):'Not recorded'}</small><b>Eligible now</b><small>${x.eligibleProducts.length?x.eligibleProducts.slice(0,6).map(esc).join('<br>'):'None under recorded profile'}</small>${x.unmetInterests.length?`<small class="blocker">Needs review: ${x.unmetInterests.map(esc).join(', ')}</small>`:''}</td>
    <td>${x.estimatedMin?`${money(x.estimatedMin)}–${money(x.estimatedMax)}`:'Not enough product data'}<small>Catalogue estimate only; confirm before quoting.</small></td>
    <td><b class="priority ${esc(x.priority.toLowerCase())}">${esc(x.priority)} · ${esc(x.priorityScore)}</b><small>${x.priorityFactors.map(esc).join('<br>')}</small></td>
    <td>${x.handoffStatus==='queued'?`<span class="queued">Queued</span><small>${x.handedOffAt?new Date(x.handedOffAt).toLocaleDateString():'Saved locally'}</small>`:`<button class="text-btn handoff" data-handoff="${esc(x.leadId)}">Queue for sales</button>`}</td>
  </tr>`).join('')||'<tr><td colspan="7">No leads match these filters.</td></tr>';
  $('#queue-count').textContent=`Showing ${filtered.length} of the top ${data.queue.length} prioritized leads; ${data.total??data.queue.length} dropped leads are in the dataset. Priority uses stage, blocker, site count, catalogue interest, and GSTIN presence.`;
  document.querySelectorAll('[data-handoff]').forEach(button=>button.addEventListener('click',async()=>{
    button.disabled=true;button.textContent='Saving…';
    try{await request('/api/sales/handoff',{leadId:button.dataset.handoff});$('#notice').textContent='Lead queued locally for salesperson follow-up.';await load();}
    catch(error){$('#notice').textContent=error.message;button.disabled=false;button.textContent='Queue for sales';}
  }));
}
function renderSupportQueue(){
 const cases=data.supportCases||[];
 $('#support-queue').innerHTML=cases.map(x=>`<tr><td><b>${esc(x.orderId.slice(0,16))}…</b></td><td>${esc(x.topic)}<div class="support-message">${esc(x.message||'No message provided.')}</div>${(x.replies||[]).map(r=>`<div class="support-reply"><b>Staff · ${esc(r.status)}</b><p>${esc(r.message)}</p><small>${esc(new Date(r.createdAt).toLocaleString())}</small></div>`).join('')}</td><td>${esc(x.orderStatus)}</td><td>${esc(x.segment)}<small>${esc(x.employees)} employees · ${esc(x.sites)} site(s) · ${money(x.monthlyMin)}–${money(x.monthlyMax)}/mo</small></td><td>${esc(x.kycStatus)}</td><td>${esc(new Date(x.createdAt).toLocaleString())}<small>${esc(x.status)}</small></td><td><form class="support-reply-form" data-reply="${esc(x.id)}"><label>Reply to customer<textarea class="field" name="message" minlength="5" maxlength="1000" required rows="3"></textarea></label><label>Status<select class="field" name="status"><option value="replied">Replied</option><option value="resolved">Resolved</option></select></label><button class="btn" type="submit">Send reply</button></form></td></tr>`).join('')||'<tr><td colspan="7">No customer help requests yet.</td></tr>';
 document.querySelectorAll('[data-reply]').forEach(form=>form.onsubmit=async e=>{e.preventDefault();const button=form.querySelector('button');button.disabled=true;try{await request('/api/sales/support/reply',{id:form.dataset.reply,message:form.elements.message.value,status:form.elements.status.value});await load();$('#staff-status').textContent='Reply saved. The customer can refresh their order tracker to read it.';}catch(error){$('#staff-status').textContent=error.message;button.disabled=false;}});
}
async function load(){
  $('#notice').textContent='Loading synthetic lead data…';
  try{data=await request('/api/sales/queue');$('#staff-login').hidden=true;$('#sales-workspace').hidden=false;renderMetrics();renderFilters();renderQueue();renderSupportQueue();$('#notice').textContent='Synthetic lead data loaded. Names and contact identifiers are excluded.';}
  catch(error){$('#staff-status').textContent=error.message;if(error.status===401){$('#staff-login').hidden=false;$('#sales-workspace').hidden=true;$('#support-queue').innerHTML='';}}
}
$('#refresh').addEventListener('click',load);
$('#priority-filter').addEventListener('change',renderQueue);
$('#segment-filter').addEventListener('change',renderQueue);
load();

$('#staff-login-form').onsubmit=async e=>{e.preventDefault();try{await request('/api/kyc/reviewer/login',{token:$('#staff-code').value});$('#staff-code').value='';$('#staff-status').textContent='Signed in to the local staff demo.';await load();}catch(error){$('#staff-code').value='';$('#staff-status').textContent=error.message;}};
$('#staff-logout').onclick=async()=>{await request('/api/kyc/reviewer/logout',{});$('#sales-workspace').hidden=true;$('#support-queue').innerHTML='';$('#staff-login').hidden=false;$('#staff-status').textContent='Signed out.';};
