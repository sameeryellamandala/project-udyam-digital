let clerk=null;
export async function customerToken(){return clerk?.session?await clerk.session.getToken():null;}
function script(src,key){return new Promise((resolve,reject)=>{
 const node=document.createElement('script');node.src=src;node.async=true;node.crossOrigin='anonymous';if(key)node.dataset.clerkPublishableKey=key;
 node.onload=resolve;node.onerror=()=>reject(new Error('Sign-in could not load.'));document.head.append(node);
});}
export async function initializeAccount(){
 const button=document.querySelector('#customer-sign-in'),notice=document.querySelector('#account-notice');
 try{
  const config=await(await fetch('/api/auth/config')).json();
  if(!config.enabled){button.textContent='Sign-in not configured';button.disabled=true;document.querySelector('#sign-in-root').textContent='Customer sign-in is not configured. Please contact the app administrator.';return false;}
  const origin='https://'+config.domain;
  await script(origin+'/npm/@clerk/ui@1/dist/ui.browser.js');
  await script(origin+'/npm/@clerk/clerk-js@6/dist/clerk.browser.js',config.publishableKey);
  clerk=window.Clerk;
  await clerk.load({ui:{ClerkUI:window.__internal_ClerkUICtor}});
  const signedIn=!!clerk.user;if(!signedIn)document.querySelector('#mode').textContent='Sign-in required';
  if(signedIn){
   button.hidden=true;clerk.mountUserButton(document.querySelector('#customer-user'));
   document.querySelector('#customer-sign-out').hidden=false;
   document.querySelector('#customer-sign-out').onclick=async()=>{await clerk.signOut();sessionStorage.removeItem('udyam_active_chat');location.href='/';};
   notice.hidden=false;notice.innerHTML='<span>Signed in. Your orders and chats belong to your account.</span> <button class="text-btn" type="button" id="claim-browser-records">Link this browser’s previous records</button><small>Only records owned by this browser session can be linked. Uploaded KYC files are kept for up to seven days.</small>';
   document.querySelector('#claim-browser-records').onclick=async e=>{
    e.target.disabled=true;
    try{const token=await customerToken(),r=await fetch('/api/auth/claim',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:'{}'});if(!r.ok)throw new Error();const result=await r.json();if(!result.linkedOrders&&!result.linkedChats){notice.querySelector('span').textContent='No previous records were found in this browser session. Older guest records require the original browser session; they cannot be recovered by business name.';e.target.disabled=false;return;}sessionStorage.removeItem('udyam_active_chat');location.reload();}
    catch{notice.querySelector('span').textContent='Could not link records. Please retry; your saved data has been preserved.';e.target.disabled=false;}
   };
  }else{
   button.disabled=false;button.textContent='Sign in';button.onclick=()=>document.querySelector('#sign-in-root').scrollIntoView({behavior:'smooth'});document.querySelector('#sign-in-root').innerHTML='';clerk.mountSignIn(document.querySelector('#sign-in-root'),{routing:'hash',forceRedirectUrl:location.origin+'/',signUpForceRedirectUrl:location.origin+'/'});
   notice.hidden=false;notice.textContent='Sign in to restore your account’s orders and chats. Sign in is required before opening the business setup or placing an order.';
  }
  clerk.addListener(({user})=>{if(!!user!==signedIn){sessionStorage.removeItem('udyam_active_chat');location.href='/';}});
  return signedIn;
 }catch{button.disabled=false;button.textContent='Retry sign-in';button.onclick=()=>location.reload();notice.hidden=false;notice.textContent='Sign-in is temporarily unavailable. Please retry to open your business setup.';document.querySelector('#sign-in-root').textContent='Secure sign-in could not load. Use Retry sign-in above.';return false;}
}
