import {profile,quote,AppError} from './catalogue.mjs';
import {freshMemory,blankProfile,publicRequirements} from './conversation-memory.mjs';
import {validatedPackages} from './advisor-flow.mjs';
import {redact} from './ai.mjs';
const confirmedFields=['segment','employees','sites','cityTier','budget','needs'];
export function formRequirements(input,previous={}){
 const p=profile({...input,gstin:'',udyam:''});p.businessName=redact(p.businessName);p.currentTools=redact(p.currentTools);
 const details={...freshMemory().details,...previous.details,knownFields:[...new Set([...(previous.details?.knownFields||[]),...confirmedFields,'currentTools'])],...Object.fromEntries(confirmedFields.map(k=>[k,p[k]])),currentTools:p.currentTools,selectedProductIds:[],action:'recommend',selectionMode:'merge'};
 if(p.needs.includes('cctv')&&Number.isInteger(p.cameraCount)){details.cameraCount=p.cameraCount;details.knownFields=[...new Set([...details.knownFields,'cameraCount'])];}
 if(!p.needs.includes('cctv')){details.cameraCount=0;details.locations=[];details.knownFields=details.knownFields.filter(k=>!['cameraCount','locations'].includes(k));}
 if(!p.needs.includes('mobile')){details.mobileLines=0;details.mobilePlanType=null;}
 if(!p.needs.includes('email'))details.emailAccounts=0;
 const savedProfile={...p};delete savedProfile.businessName;
 return {...freshMemory(),...previous,profile:savedProfile,form:{businessName:p.businessName},formConfirmed:true,details,selectedProducts:[],items:[],offers:[],lastRecommendation:undefined,awaitingQuestion:''};
}
export function journeyProfile(state,complete=false){
 const known=new Set(state.details?.knownFields||[]);
 if(complete&&confirmedFields.some(k=>!known.has(k)))throw new AppError('Complete the business requirements before requesting a package.',409,'INCOMPLETE_REQUIREMENTS');
 const p={...blankProfile('en'),...state.profile,businessName:state.form?.businessName||'New business',gstin:'',udyam:''};
 return profile(p);
}
export function journeyRecommendation(state,data,checkedBusiness){
 const known=new Set(state.details?.knownFields||[]),business=checkedBusiness||journeyProfile(state),details={...freshMemory().details,...state.details,selectedProductIds:[],selectionMode:'merge',action:'recommend'};
 if(confirmedFields.some(k=>!known.has(k)))return {quote:null,eligibleProducts:[],options:[],warnings:['Complete the business requirements before generating a package.']};
 if(business.needs.includes('cctv')&&(!known.has('cameraCount')||!Number.isInteger(details.cameraCount)||details.cameraCount<1))return {quote:null,eligibleProducts:[],options:[],warnings:['Tell the advisor how many cameras you need before reviewing a CCTV package.']};
 if(state.selectedProducts?.length){try{const selected=quote(business,state.selectedProducts,data);return {quote:selected,eligibleProducts:validatedPackages(business,details,data,state).eligibleProducts,options:[],warnings:selected.warnings};}catch{/* Changed eligibility falls back to a new backend-validated recommendation. */}}
 const r=validatedPackages(business,details,data,state);
 return {quote:r.quote,eligibleProducts:r.eligibleProducts,options:r.options,warnings:[...r.warnings,...r.issues]};
}
export function journeyView(state,revision,data){return {revision,requirements:publicRequirements(state),advisorProfile:state.profile?journeyProfile(state):null,formConfirmed:!!state.formConfirmed,...(data?{recommendation:journeyRecommendation(state,data)}:{})};}
