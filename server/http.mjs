import {config,upstreamUrl} from './config.mjs';
export class HttpError extends Error {constructor(status,message){super(message);this.status=status;}}
export const providerStatus=new Map();
let active=0; const waiters=[];const budget=[];const circuit=new Map();
const limit=async()=>{if(active<4){active++;return;}await new Promise(r=>waiters.push(r));};
const release=()=>{const next=waiters.shift();if(next)next();else active--;};
export async function fetchText(raw,{method='GET',body,headers={},provider='Upstream',maxBytes=8_000_000}={}){
  const url=upstreamUrl(raw),now=Date.now();
  if((circuit.get(url.hostname)||0)>now)throw new HttpError(503,`${provider} is cooling down after an upstream error. Retry shortly.`);
  while(budget.length && budget[0]<now-3600000)budget.shift();
  if(budget.length>=config.upstreamHourlyBudget)throw new HttpError(429,'Server upstream-request budget reached. Cached results remain available.');
  budget.push(now);await limit();
  try{
    let current=url,requestMethod=method,requestBody=body,response;
    const pgHosts=new Set(['paraglidingearth.com','www.paraglidingearth.com','paragliding.earth','www.paragliding.earth']);
    const signal=AbortSignal.timeout(config.requestTimeout);
    for(let redirects=0;;redirects++){
      response=await fetch(current,{method:requestMethod,body:requestBody,headers:{Accept:'application/json, application/xml, text/xml;q=0.9','User-Agent':`Flywindow/1.0 (${config.contact||'self-hosted paragliding planner'})`,...headers},signal,redirect:'manual'});
      if(![301,302,303,307,308].includes(response.status))break;
      await response.body?.cancel();
      if(redirects>=3||!response.headers.get('location'))throw new HttpError(502,`${provider} returned an invalid or excessive redirect chain.`);
      const next=upstreamUrl(new URL(response.headers.get('location'),current));
      const sameHost=next.host===current.host;
      if(!sameHost&&!(provider==='ParaglidingEarth'&&pgHosts.has(current.hostname)&&pgHosts.has(next.hostname)&&!next.port))throw new HttpError(502,`${provider} redirected to another host. Update the configured endpoint after verifying the provider.`);
      if(next.username||next.password)throw new HttpError(502,`${provider} returned a credential-bearing redirect.`);
      if(response.status===303||([301,302].includes(response.status)&&requestMethod==='POST')){requestMethod='GET';requestBody=undefined;}
      current=next;
    }
    if(!response.ok){
      const retry=Number(response.headers.get('retry-after'))||60;
      if([429,502,503].includes(response.status))circuit.set(url.hostname,Date.now()+Math.min(retry,900)*1000);
      throw new HttpError(502,`${provider} returned HTTP ${response.status}. Check availability, access rights and configured endpoint.`);
    }
    if(Number(response.headers.get('content-length'))>maxBytes)throw new HttpError(502,`${provider} response exceeds size limit.`);
    const reader=response.body.getReader();const chunks=[];let length=0;
    for(;;){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>maxBytes){await reader.cancel();throw new HttpError(502,`${provider} response exceeds size limit.`);}chunks.push(value);}
    const text=Buffer.concat(chunks).toString('utf8');
    providerStatus.set(provider,{state:'ok',lastSuccess:new Date().toISOString(),host:url.host});return text;
  }catch(e){
    const message=e instanceof HttpError?e.message:`${provider} could not be reached (${e.cause?.code||e.name||'network error'}).`;
    providerStatus.set(provider,{state:'error',lastError:new Date().toISOString(),message,host:url.host});
    throw e instanceof HttpError?e:new HttpError(502,message);
  }finally{release();}
}
export async function fetchJson(url,options){
  const text=await fetchText(url,options);
  try{return JSON.parse(text);}catch{throw new HttpError(502,`${options?.provider||'Upstream'} did not return valid JSON.`);}
}
