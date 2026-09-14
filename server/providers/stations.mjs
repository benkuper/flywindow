import {config} from '../config.mjs';
import {fetchJson,HttpError} from '../http.mjs';
import {plain} from '../xml.mjs';
import {coordinates,distanceKm,finite} from '../../public/shared/core.mjs';
/** Epoch or explicitly zoned timestamps only. A naive FFVL date is not assumed UTC or Paris. */
export function parseObservationTime(value,timeZone=''){
  if(typeof value==='number'||/^\d{10,13}$/.test(String(value))){const n=Number(value);return n>1e12?n:n>946684800?n*1000:null;}
  if(typeof value!=='string')return null;
  if(/(?:Z|[+-]\d{2}:?\d{2})$/.test(value)){const n=Date.parse(value);return Number.isFinite(n)?n:null;}
  if(!timeZone)return null;
  const m=value.match(/^(\d{4})-(\d\d)-(\d\d)[ T](\d\d):(\d\d)(?::(\d\d))?$/);if(!m)return null;
  const wanted=Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+(m[6]||0));
  try{
    const fmt=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
    const wall=epoch=>{const p=Object.fromEntries(fmt.formatToParts(new Date(epoch)).map(p=>[p.type,p.value]));return Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);};
    let guess=wanted;for(let i=0;i<4;i++)guess+=wanted-wall(guess);
    const candidates=[guess-7200000,guess-3600000,guess-1800000,guess,guess+1800000,guess+3600000,guess+7200000].filter(t=>wall(t)===wanted);
    return candidates.length===1?candidates[0]:null; // DST-fold ambiguity remains unknown.
  }catch{return null;}
}
function rows(data,names){
  if(Array.isArray(data))return data;
  for(const name of names)if(Array.isArray(data?.[name]))return data[name];
  if(data&&typeof data==='object'){const values=Object.values(data);if(values.length&&values.every(v=>v&&typeof v==='object'&&!Array.isArray(v)))return values;}
  throw new HttpError(502,'FFVL returned an unexpected JSON schema.');
}
const idOf=x=>String(x.idbalise??x.idBalise??x.id??'');
export function parseStations(catalogue,observations,{timeZone=''}={}){
  const cat=rows(catalogue,['balises','stations']),obs=rows(observations,['releves','relevesmeteo','observations']);
  const byId=new Map();
  for(const o of obs){const id=idOf(o),time=parseObservationTime(o.date??o.timestamp,timeZone);const prev=byId.get(id);if(!prev||!time||!prev.time||time>prev.time)byId.set(id,{raw:o,time});}
  let located=0;
  const stations=cat.flatMap(s=>{
    const p=coordinates(s.latitude??s.lat,s.longitude??s.lon??s.lng);if(!p)return [];located++;
    const id=idOf(s);if(!id)return [];const o=byId.get(id);const r=o?.raw||{};
    const nonnegative=x=>{const v=finite(x);return v!==null&&v>=0?v:null;};
    const direction=finite(r.directVentMoy??r.direction);
    return [{id:`ffvl-${id}`,name:plain(s.nom??s.name??`FFVL ${id}`),...p,elevationM:finite(s.altitude??s.elevation),active:s.active??null,
      wind:nonnegative(r.vitesseVentMoy??r.wind),gust:nonnegative(r.vitesseVentMax??r.gust),direction:direction!==null&&direction>=0&&direction<=360?direction:null,
      temperature:finite(r.temperature),observedAt:o?.time??null,rawTime:plain(r.date??r.timestamp??''),timeZone:timeZone||null,
      source:'FFVL balises',sourceUrl:`https://www.balisemeteo.com/balise.php?idBalise=${encodeURIComponent(id)}`,history:[]}];
  });
  if(cat.length&&!located)throw new HttpError(502,'FFVL station coordinate schema is not recognized.');
  return stations;
}
export function createStationProvider(cache){
  const history=new Map();
  return async function stations(lat,lon,radius){
    if(!config.ffvlEnabled)return {stations:[],state:'disabled',warnings:['FFVL observations disabled by the server operator.']};
    try{
      const catalog=await cache.load(`ffvl-catalog-v1:${config.stationUrl}`,86400000,()=>fetchJson(config.stationUrl,{provider:'FFVL station catalogue'}),{staleMax:7*86400000});
      const readings=await cache.load(`ffvl-readings-v1:${config.readingsUrl}`,300000,()=>fetchJson(config.readingsUrl,{provider:'FFVL observations'}),{staleMax:3600000});
      const parsed=parseStations(catalog.data,readings.data,{timeZone:config.stationTimezone});
      const now=Date.now();
      for(const s of parsed){
        if(s.observedAt&&s.wind!==null&&s.observedAt>now-86400000&&s.observedAt<now+300000){let h=history.get(s.id)||[];if(!h.some(p=>p.time===s.observedAt))h.push({time:s.observedAt,wind:s.wind,gust:s.gust});h=h.filter(p=>p.time>now-86400000).sort((a,b)=>a.time-b.time).slice(-144);history.set(s.id,h);s.history=h;}
      }
      const warnings=[];if(readings.stale)warnings.push('FFVL upstream unavailable: observations are cached, not current.');
      const results=parsed.map(s=>({...s,distanceKm:distanceKm({lat,lon},s),fresh:!readings.stale&&s.observedAt!==null&&now-s.observedAt>=-300000&&now-s.observedAt<30*60000})).filter(s=>s.distanceKm<=radius).sort((a,b)=>a.distanceKm-b.distanceKm).slice(0,80);
      if(results.some(s=>s.observedAt===null&&s.rawTime))warnings.push('Some station timestamps have no zone. Their freshness is unknown; configure FFVL_TIMESTAMP_TIMEZONE only after verifying feed semantics.');
      return {stations:results,state:readings.stale?'stale':'ok',fetchedAt:readings.fetchedAt,warnings,coverage:'FFVL network only. No station nearby does not mean no hazards or no weather.'};
    }catch(e){return {stations:[],state:'error',warnings:[e.message],coverage:'FFVL network only.'};}
  };
}
