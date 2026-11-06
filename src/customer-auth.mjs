import {verifyToken} from '@clerk/backend';
import {createHash} from 'node:crypto';
import {AppError} from './catalogue.mjs';
export function customerAuth(config={}){
 const {publishableKey='',secretKey='',jwtKey='',verifier=verifyToken}=config;
 let domain='';
 if(publishableKey){
   const decoded=Buffer.from(publishableKey.split('_')[2]||'','base64').toString('utf8');
   domain=decoded.endsWith('$')?decoded.slice(0,-1):'';
   if(!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(domain))throw new Error('Invalid Clerk publishable-key configuration.');
 }
 const enabled=!!domain&&!!(secretKey||jwtKey);
 return {enabled,domain,publicConfig:{enabled,publishableKey:enabled?publishableKey:null,domain:enabled?domain:null},
  async identity(req,origin){
   const header=req.headers.authorization;
   const token=header?.startsWith('Bearer ')?header.slice(7):/(?:^|;\s*)__session=([^;]+)/.exec(req.headers.cookie||'')?.[1];
   if(!token&&!header)return null;
   if(!enabled&&!header)return null;
   if(!enabled||!token||token.length>12000)throw new AppError('Sign-in could not be verified. Please sign in again.',401,'AUTH_REQUIRED');
   try{
    const claims=await verifier(token,{secretKey,jwtKey:jwtKey||undefined,issuer:'https://'+domain,authorizedParties:[origin]});
    if(!/^user_[a-zA-Z0-9]+$/.test(claims.sub||'')||!claims.sid||claims.iss!=='https://'+domain||claims.azp!==origin)throw new Error();
    return {owner:createHash('sha256').update('clerk-account:'+claims.iss+':'+claims.sub).digest('hex')};
   }catch{
    // An expired cookie must not prevent an anonymous visitor signing in.
    // It never grants account ownership; explicit bad bearer tokens fail closed.
    if(!header)return null;
    throw new AppError('Sign-in expired or could not be verified. Please sign in again.',401,'AUTH_REQUIRED');
   }
  }
 };
}
