// Recognize standalone social turns only; mixed requests still reach the advisor.
export function socialReply(message,language='en'){
 const text=message.trim().toLowerCase().replace(/[!.,।]+/g,'').replace(/\s+/g,' ');
 if(/^(?:(?:ok+|okay|alright|great|cool) )?(?:thanks|thank you|thankyou|thank u)(?: (?:so much|a lot))?(?: for (?:helping(?: me)?|your help|the help|helping me out))?(?: (?:advisor|bye|goodbye))?$/.test(text)||/^(?:धन्यवाद|शुक्रिया)(?: आपकी मदद के लिए)?$/.test(text))return language==='hi'?'आपका स्वागत है! आगे कोई मदद चाहिए तो बताइए।':'You’re welcome! I’m here whenever you need more help.';
 if(/^(?:hi+|hey+|hello|नमस्ते)(?: (?:advisor|there))?$/.test(text))return language==='hi'?'नमस्ते! आज मैं आपकी कैसे मदद कर सकता हूँ?':'Hi! How can I help you today?';
 if(/^(?:bye|goodbye|see you|good night)$/.test(text))return language==='hi'?'फिर मिलेंगे! आगे मदद चाहिए तो अपनी चैट जारी रख सकते हैं।':'Goodbye! You can return to this chat whenever you need help.';
 return null;
}
