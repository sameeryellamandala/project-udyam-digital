let active=null;
export function stopVoiceInput(){if(active){active.abort();active=null;}}
export function wireVoiceInput({language,onDraft,translate=x=>x}){
 const button=document.querySelector('#voice-input'),input=document.querySelector('#message'),status=document.querySelector('#voice-input-status');
 if(!button||!input)return;
 const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
 const say=text=>{if(status){status.classList.remove('sr-only');status.textContent=translate(text);}};
 if(!Recognition){button.disabled=true;button.title=translate('Voice typing is not supported in this browser. Please type your message.');return;}
 button.title=translate('Voice typing may use your browser speech service. Review the text before sending.');
 button.onclick=()=>{
  if(active){stopVoiceInput();return;}
  if(!window.isSecureContext){say('Voice typing requires HTTPS.');return;}
  const recognition=new Recognition();active=recognition;
  recognition.lang=({en:'en-IN',hi:'hi-IN',te:'te-IN',ta:'ta-IN',kn:'kn-IN',ml:'ml-IN',mr:'mr-IN'})[language]||'en-IN';
  recognition.interimResults=true;recognition.continuous=false;
  const original=input.value;let finalText='',failed=false;
  recognition.onstart=()=>{button.setAttribute('aria-pressed','true');button.textContent='■';say('Listening… Click the microphone again to stop.');};
  recognition.onresult=event=>{
   let interim='';for(let i=event.resultIndex;i<event.results.length;i++){const text=event.results[i][0].transcript;if(event.results[i].isFinal)finalText+=text+' ';else interim+=text;}
   const value=[original,finalText+interim].filter(Boolean).join(' ').slice(0,2000);
   input.value=value;onDraft(value);
  };
  recognition.onerror=event=>{failed=true;say(event.error==='not-allowed'?'Microphone permission was denied. You can still type.':event.error==='no-speech'?'No speech detected. Please try again.':'Voice typing could not connect. Please type or try again.');};
  recognition.onend=()=>{if(active===recognition)active=null;button.setAttribute('aria-pressed','false');button.textContent='🎤';if(!failed)say('Review your message, then press Send.');};
  try{recognition.start();}catch{active=null;say('Voice typing could not start. Please try again.');}
 };
}
