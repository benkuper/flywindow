import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {createHash,timingSafeEqual} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {config,root} from './config.mjs';
import {Cache} from './cache.mjs';
import {HttpError,providerStatus} from './http.mjs';
import {createSitesProvider} from './providers/sites.mjs';
import {createWeatherProvider,MODELS} from './providers/weather.mjs';
import {createStationProvider} from './providers/stations.mjs';
import {createGeocoder} from './providers/geocode.mjs';
import {coordinates,finite} from '../public/shared/core.mjs';
const cache=new Cache(config.cacheDir);
const sites=createSitesProvider(cache),weather=createWeatherProvider(cache),stations=createStationProvider(cache),geocode=createGeocoder(cache);
const rate=new Map();
const publicDir=resolve(root,'public');
const mimes={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
function json(res,status,payload){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(payload));}
function queryPoint(url){const p=coordinates(url.searchParams.get('lat'),url.searchParams.get('lon'));if(!p)throw new HttpError(400,'Valid latitude (-90…90) and longitude (-180…180) are required.');return p;}
function radiusOf(url){const r=finite(url.searchParams.get('radius')??50);if(r===null||r<5||r>200)throw new HttpError(400,'Radius must be between 5 and 200 km.');return r;}
async function bodyJson(req){
  if(!String(req.headers['content-type']||'').startsWith('application/json'))throw new HttpError(415,'Content-Type must be application/json.');
  const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>16000)throw new HttpError(413,'Request body too large.');chunks.push(chunk);}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new HttpError(400,'Invalid JSON.');}
}
function authorized(req){
  if(!config.basicUser)return true;
  const expected='Basic '+Buffer.from(`${config.basicUser}:${config.basicPass}`).toString('base64');
  const hash=s=>createHash('sha256').update(s).digest();return timingSafeEqual(hash(String(req.headers.authorization||'')),hash(expected));
}
export function createApp(){return createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options','DENY');res.setHeader('Permissions-Policy','geolocation=(self), camera=(), microphone=()');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self'; font-src 'self'; frame-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
  try{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/api/health'&&req.method==='GET')return json(res,200,{ok:true,version:'1.0.0',testData:config.testData});
    if(!authorized(req)){res.setHeader('WWW-Authenticate','Basic realm="Flywindow", charset="UTF-8"');return json(res,401,{error:'Authentication required.'});}
    if(url.pathname.startsWith('/api/')){
      // Do not trust client-supplied X-Forwarded-For. Behind a proxy this is a conservative shared limit.
      const ip=req.socket.remoteAddress||'unknown',now=Date.now();let hits=rate.get(ip)||[];hits=hits.filter(t=>t>now-60000);
      if(hits.length>=config.requestsPerMinute){res.setHeader('Retry-After','60');throw new HttpError(429,'Request limit reached. Please retry in one minute.');}
      hits.push(now);rate.set(ip,hits);if(rate.size>10000)for(const [k,v]of rate)if(v.at(-1)<now-60000)rate.delete(k);
      if(req.method==='GET'&&url.pathname==='/api/config')return json(res,200,{name:'Flywindow',version:'1.0.0',testData:config.testData,tileUrl:config.tileUrl,tileAttribution:config.tileAttribution,tileAttributionUrl:config.tileAttributionUrl,models:MODELS,maxSites:config.maxSites,contact:config.contact,providers:{pgearth:config.pgEnabled,osm:config.osmEnabled,ffvl:config.ffvlEnabled},forecastCacheSeconds:config.forecastTtl/1000});
      if(req.method==='GET'&&url.pathname==='/api/status')return json(res,200,{providers:Object.fromEntries(providerStatus),testData:config.testData});
      if(req.method==='GET'&&url.pathname==='/api/geocode'){const q=(url.searchParams.get('q')||'').trim();if(q.length<2||q.length>100)throw new HttpError(400,'Search must contain 2–100 characters.');return json(res,200,await geocode(q));}
      if(req.method==='GET'&&url.pathname==='/api/sites'){const p=queryPoint(url);return json(res,200,await sites({...p,radius:radiusOf(url),includeOsm:url.searchParams.get('includeOsm')==='true'}));}
      if(req.method==='GET'&&url.pathname==='/api/forecast'){const p=queryPoint(url);return json(res,200,await weather.single(p,url.searchParams.get('model')||'best_match'));}
      if(req.method==='GET'&&url.pathname==='/api/profile'){return json(res,200,await weather.profile(queryPoint(url)));}
      if(req.method==='GET'&&url.pathname==='/api/stations'){const p=queryPoint(url);return json(res,200,await stations(p.lat,p.lon,radiusOf(url)));}
      if(req.method==='POST'&&url.pathname==='/api/forecasts'){
        const body=await bodyJson(req);if(!body||typeof body!=='object'||!Array.isArray(body.points)||body.points.length<1||body.points.length>16)throw new HttpError(400,'Supply 1–16 forecast points.');
        const points=body.points.map((p,i)=>{const c=coordinates(p?.lat,p?.lon);if(!c)throw new HttpError(400,`Invalid coordinates at point ${i}.`);return {...c,key:String(p.key??i).slice(0,120)};});
        return json(res,200,{results:await weather.batch(points,body.model||'best_match')});
      }
      if(req.method==='POST'&&url.pathname==='/api/wind'){
        const body=await bodyJson(req);
        if(!body||typeof body!=='object'||!Array.isArray(body.points)||body.points.length<1||body.points.length>64)throw new HttpError(400,'Supply 1–64 visible wind sample points.');
        const points=body.points.map((p,i)=>{const c=coordinates(p?.lat,p?.lon);if(!c)throw new HttpError(400,`Invalid wind coordinates at point ${i}.`);return {...c,key:String(p.key??i).slice(0,120)};});
        const results=[];for(let i=0;i<points.length;i+=16)results.push(...await weather.batch(points.slice(i,i+16),body.model||'best_match','wind'));
        return json(res,200,{points:results.map((r,i)=>({...points[i],forecast:r.forecast})),note:`${points.length} samples in the current map viewport. Arrows show 10 m model wind flowing downwind.`});
      }
      throw new HttpError(404,'API endpoint not found.');
    }
    if(!['GET','HEAD'].includes(req.method))throw new HttpError(405,'Method not allowed.');
    let pathname;try{pathname=decodeURIComponent(url.pathname);}catch{throw new HttpError(400,'Invalid path.');}
    if(pathname.includes('\0')||pathname.split('/').some(p=>p.startsWith('.')&&p!==''))throw new HttpError(404,'Not found.');
    const file=resolve(publicDir,'.'+(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(publicDir+sep))throw new HttpError(404,'Not found.');
    let data;try{const st=await stat(file);if(!st.isFile())throw new Error();data=await readFile(file);}catch{throw new HttpError(404,'Not found.');}
    const tag='"'+createHash('sha256').update(data).digest('hex').slice(0,24)+'"';res.setHeader('ETag',tag);
    res.setHeader('Cache-Control',extname(file)==='.html'?'no-cache':'public, max-age=300, must-revalidate');
    if(req.headers['if-none-match']===tag){res.writeHead(304);return res.end();}
    res.writeHead(200,{'Content-Type':mimes[extname(file)]||'application/octet-stream','Content-Length':data.length});res.end(req.method==='HEAD'?undefined:data);
  }catch(e){if(!res.headersSent)json(res,e.status||500,{error:e.status?e.message:'Unexpected server error.'});else res.end();if(!e.status)console.error(e);}
});}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const server=createApp();server.requestTimeout=65000;server.headersTimeout=15000;server.listen(config.port,config.host,()=>console.log(`Flywindow ${config.testData?'[TEST DATA] ':''}listening on http://${config.host}:${config.port}`));
  const stop=()=>server.close(()=>process.exit(0));process.on('SIGTERM',stop);process.on('SIGINT',stop);
}
