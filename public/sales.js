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
 $('#support-queue').innerHTML=cases.map(x=>`<tr><td><b>${esc(x.orderId.slice(0,16))}…</b></td><td>${esc(x.topic)}<div class="support-message">${esc(x.message||'No message provided.')}</div>${(x.replies||[]).map(r=>`<div class="support-reply"><b>Staff · ${esc(r.status)}</b><p>${esc(r.message)}</p><small>${esc(new Date(r.createdAt).toLocaleString())}</small></div>`).join('')}</td><td>${esc(x.orderStatus)}</td><td>${esc(x.segment)}<small>${esc(x.employees)} employees · ${esc(x.sites)} site(s) · ${money(x.monthlyMin)}–${money(x.monthlyMax)}/mo</small></td><td>${esc(x.kycStatus)}</td><td>${esc(new Date(x.createdAt).toLocaleString())}<small>${esc(x.status)}</small></td><td><form class="support-reply-form" data-reply="${esc(x.id)}"><label>Reply to customer<textarea class="field" name="message" minlength="5" maxlength="1000" required rows="3"></textarea></label><label>Status<select class="field" name="status"><option value="replied">Replied</option><option value="resolved">Resolved</option></select></label><button class="btn" type="submit">Send reply</button></form><button type="button" class="text-btn" data-delete-support="${esc(x.id)}">Delete from queue</button></td></tr>`).join('')||'<tr><td colspan="7">No customer help requests yet.</td></tr>';
 document.querySelectorAll('[data-delete-support]').forEach(button=>button.addEventListener('click',async()=>{
   if(!confirm('Remove this help request from the staff queue? The customer history will be kept.'))return;
   button.disabled=true;
   try{await request('/api/sales/support/delete',{id:button.dataset.deleteSupport});await load();$('#staff-status').textContent='Request removed from the staff queue.';}
   catch(error){$('#staff-status').textContent=error.message;button.disabled=false;}
 }));
 document.querySelectorAll('[data-reply]').forEach(form=>form.onsubmit=async e=>{e.preventDefault();const button=form.querySelector('button');button.disabled=true;try{await request('/api/sales/support/reply',{id:form.dataset.reply,message:form.elements.message.value,status:form.elements.status.value});await load();$('#staff-status').textContent='Reply saved. The customer can refresh their order tracker to read it.';}catch(error){$('#staff-status').textContent=error.message;button.disabled=false;}});
}
async function load(){
  $('#notice').textContent='Loading synthetic lead data…';
  try{data=await request('/api/sales/queue');$('#staff-login').hidden=true;$('#sales-workspace').hidden=false;renderMetrics();renderFilters();renderQueue();renderSupportQueue();await loadOperations();$('#notice').textContent='Synthetic lead data loaded. Names and contact identifiers are excluded.';}
  catch(error){$('#staff-status').textContent=error.message;if(error.status===401){$('#staff-login').hidden=false;$('#sales-workspace').hidden=true;$('#support-queue').innerHTML='';}}
}
$('#refresh').addEventListener('click',load);
$('#priority-filter').addEventListener('change',renderQueue);
$('#segment-filter').addEventListener('change',renderQueue);
load();

$('#staff-login-form').onsubmit=async e=>{e.preventDefault();try{await request('/api/kyc/reviewer/login',{token:$('#staff-code').value});$('#staff-code').value='';$('#staff-status').textContent='Signed in to the local staff demo.';await load();}catch(error){$('#staff-code').value='';$('#staff-status').textContent=error.message;}};
$('#staff-logout').onclick=async()=>{await request('/api/kyc/reviewer/logout',{});$('#sales-workspace').hidden=true;$('#support-queue').innerHTML='';$('#staff-login').hidden=false;$('#staff-status').textContent='Signed out.';};

async function loadOperations(){
 const {orders}=await request('/api/sales/orders');
 const actions={ready_for_scheduling:['schedule'],installation_scheduled:['start','delay'],installation_in_progress:['complete','delay'],activation_pending:['activate'],installed:['activate']};
 const actionLabels={schedule:'Schedule installation',start:'Mark installation started',delay:'Report installation delay',complete:'Mark installation complete',activate:'Mark service activated (demo)',cancel:'Cancel order'};
 const statusLabels={review_required:'KYC review required',ready_for_scheduling:'Ready for scheduling',installation_scheduled:'Installation scheduled',installation_in_progress:'Installation in progress',activation_pending:'Activation pending',installed:'Installation complete',activated:'Activated (demo)',order_cancelled:'Cancelled'};
 $('#operations-orders').innerHTML=orders.map(o=>{
   const terminal=['activated','order_cancelled'].includes(o.status),options=terminal?[]:[...(actions[o.status]||[]),'cancel'];
   const dateMin=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata'}).format(new Date());
   return `<details class="operation-order"><summary><span class="operation-order-id">${esc(o.id)}</span><span class="stage-pill operation-stage ${esc(o.status)}">${esc(statusLabels[o.status]||o.status.replaceAll('_',' '))}</span></summary>${options.length?`<form class="operation-form" data-ops="${esc(o.id)}" data-version="${o.version}"><p class="operation-hint">Record the next staff update for this order. The customer will see it in the tracker after refresh.</p><div class="operation-fields"><div class="field-group"><label class="field-label" for="action-${esc(o.id)}">Next step</label><select class="field" id="action-${esc(o.id)}" name="action">${options.map(a=>`<option value="${a}">${actionLabels[a]}</option>`).join('')}</select></div><div class="field-group operation-date-field" data-date-group hidden><label class="field-label" data-date-label for="date-${esc(o.id)}">Expected installation date</label><input class="field" id="date-${esc(o.id)}" name="expectedDate" type="date" min="${dateMin}"><small class="hint">Required to schedule or report a delay.</small></div><div class="field-group operation-message-field"><label class="field-label" for="message-${esc(o.id)}">Customer update</label><textarea class="field" id="message-${esc(o.id)}" name="description" minlength="3" maxlength="500" required rows="3" placeholder="Example: Installation is planned for the confirmed date."></textarea></div></div><p class="operation-demo-note">Demo update only · no installer is contacted and no service is provisioned.</p><button class="btn" type="submit">Save order update</button></form>`:`<p class="operation-state-note">${o.status==='review_required'?'KYC review must pass before installation can be scheduled.':terminal?'No further staff updates are available for this order.':'No operations are available at this stage.'}</p>`}</details>`;
 }).join('')||'No orders yet.';
 for(const form of document.querySelectorAll('[data-ops]'))form.onsubmit=async event=>{
   event.preventDefault();const button=form.querySelector('button');button.disabled=true;
   try{await request('/api/sales/orders/update',{...Object.fromEntries(new FormData(form)),id:form.dataset.ops,version:Number(form.dataset.version)});await loadOperations();$('#staff-status').textContent='Order updated.';}
   catch(error){$('#staff-status').textContent=error.message;button.disabled=false;}
 };
 for(const form of document.querySelectorAll('[data-ops]')){
   const dateGroup=form.querySelector('[data-date-group]'),dateInput=form.elements.expectedDate;
   const updateDate=()=>{const action=form.elements.action.value,show=['schedule','delay'].includes(action);dateGroup.hidden=!show;dateInput.required=show;form.querySelector('[data-date-label]').textContent=action==='delay'?'Revised installation date':'Expected installation date';};
   form.elements.action.addEventListener('change',updateDate);updateDate();
 }
}

$('#toggle-priority-queue').addEventListener('click',event=>{
  const content=$('#priority-queue-content');
  content.hidden=!content.hidden;
  event.currentTarget.textContent=content.hidden?'View queue':'Hide queue';
  event.currentTarget.setAttribute('aria-expanded',String(!content.hidden));
});
