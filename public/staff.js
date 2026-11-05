const $=selector=>document.querySelector(selector);
async function request(path,input){
  const response=await fetch('/api'+path,{method:input?'POST':'GET',credentials:'same-origin',headers:input?{'Content-Type':'application/json'}:{},body:input?JSON.stringify(input):undefined});
  const data=await response.json();if(!response.ok){const error=new Error(data.error||'Staff request failed.');error.status=response.status;throw error;}return data;
}
function render(signedIn){
  $('#staff-login').hidden=signedIn;$('#staff-workspace').hidden=!signedIn;$('#sign-out').hidden=!signedIn;
  if(signedIn)$('#staff-status').textContent='Staff session active.';
}
async function checkSession(){
  try{const data=await request('/staff/session');render(data.signedIn);if(!data.signedIn)$('#staff-status').textContent='Sign in with your staff access code to continue.';}
  catch(error){render(false);$('#staff-status').textContent=error.message;}
}
$('#staff-login-form').addEventListener('submit',async event=>{
  event.preventDefault();const form=event.currentTarget,button=form.querySelector('button');button.disabled=true;$('#staff-status').textContent='Signing in…';
  try{await request('/kyc/reviewer/login',{token:$('#staff-code').value});form.reset();render(true);}
  catch(error){$('#staff-status').textContent=error.message;}
  finally{button.disabled=false;}
});
$('#sign-out').addEventListener('click',async()=>{
  const button=$('#sign-out');button.disabled=true;
  try{await request('/kyc/reviewer/logout',{});render(false);$('#staff-status').textContent='Signed out.';}
  catch(error){$('#staff-status').textContent=error.message;}
  finally{button.disabled=false;}
});
await checkSession();
