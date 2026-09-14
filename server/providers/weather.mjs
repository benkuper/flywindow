import {config} from '../config.mjs';
import {fetchJson,HttpError} from '../http.mjs';
import {finite,coordinates} from '../../public/shared/core.mjs';
export const MODELS=['best_match','gfs_global','icon_global','ecmwf_ifs025'];
export const FIELDS={wind:'wind_speed_10m',gust:'wind_gusts_10m',direction:'wind_direction_10m',temperature:'temperature_2m',dewpoint:'dew_point_2m',rain:'precipitation',rainProbability:'precipitation_probability',cloud:'cloud_cover',lowCloud:'cloud_cover_low',midCloud:'cloud_cover_mid',highCloud:'cloud_cover_high',code:'weather_code',isDay:'is_day',cape:'cape',boundaryLayer:'boundary_layer_height',solar:'shortwave_radiation',visibility:'visibility',pressure:'surface_pressure'};
export const LEVELS=[1000,975,950,925,900,850,800,750,700,600,500,400];
const PRESSURE_FIELDS={temperature:'temperature',dewpoint:'dew_point',wind:'wind_speed',direction:'wind_direction',height:'geopotential_height'};
function validZone(zone){try{new Intl.DateTimeFormat('en',{timeZone:zone}).format();return zone;}catch{return 'UTC';}}
export function normalizeWeather(raw,{lat,lon,model='best_match',profile=false}={}){
  if(!Array.isArray(raw?.hourly?.time)||!raw.hourly.time.length)throw new HttpError(502,'Weather provider returned no hourly time series.');
  const times=raw.hourly.time;
  if(!times.every(t=>typeof t==='number'&&Number.isFinite(t)&&t>946684800))throw new HttpError(502,'Weather provider did not return requested UTC epoch timestamps.');
  if(times.some((t,i)=>i>0&&t<=times[i-1]))throw new HttpError(502,'Weather provider timestamps are not strictly increasing.');
  for(const [key,values] of Object.entries(raw.hourly)){if(key!=='time'&&Array.isArray(values)&&values.length!==times.length)throw new HttpError(502,`Weather field length mismatch: ${key}.`);}
  const hours=times.map((time,i)=>{
    const hour={time,...Object.fromEntries(Object.entries(FIELDS).map(([key,field])=>[key,finite(raw.hourly[field]?.[i])]))};
    if(hour.wind!==null&&hour.wind<0)hour.wind=null;if(hour.gust!==null&&hour.gust<0)hour.gust=null;
    if(hour.direction!==null&&(hour.direction<0||hour.direction>360))hour.direction=null;
    for(const k of ['rain','cape','boundaryLayer','solar','visibility'])if(hour[k]!==null&&hour[k]<0)hour[k]=null;
    for(const k of ['rainProbability','cloud','lowCloud','midCloud','highCloud'])if(hour[k]!==null&&(hour[k]<0||hour[k]>100))hour[k]=null;
    if(hour.isDay!==null&&![0,1].includes(hour.isDay))hour.isDay=null;
    if(hour.code!==null&&![0,1,2,3,45,48,51,53,55,56,57,61,63,65,66,67,71,73,75,77,80,81,82,85,86,95,96,99].includes(hour.code))hour.code=null;
    if(profile)hour.levels=LEVELS.map(pressure=>({pressure,...Object.fromEntries(Object.entries(PRESSURE_FIELDS).map(([key,field])=>[key,finite(raw.hourly[`${field}_${pressure}hPa`]?.[i])]))}));
    return hour;
  });
  const units=raw.hourly_units||{};
  if(units.wind_speed_10m && units.wind_speed_10m!=='km/h')throw new HttpError(502,'Unexpected wind units from weather provider.');
  return {requested:{lat,lon},gridPoint:coordinates(raw.latitude,raw.longitude),elevationM:finite(raw.elevation),timezone:validZone(raw.timezone||'UTC'),model:profile?'GFS global family':model,provider:'Open-Meteo',sourceUrl:profile?'https://open-meteo.com/en/docs/gfs-api':'https://open-meteo.com/en/docs',runTime:null,profile,hours,units,missingFields:Object.entries(FIELDS).filter(([,field])=>!Array.isArray(raw.hourly[field])||raw.hourly[field].every(v=>v===null)).map(([key])=>key)};
}
export function createWeatherProvider(cache){
  const key=(p,model,kind)=>`weather-v4:${kind}:${model}:${p.lat.toFixed(4)}:${p.lon.toFixed(4)}:${kind==='profile'?config.profileUrl:config.weatherUrl}`;
  const attach=entry=>({...entry.data,fetchedAt:entry.fetchedAt,stale:!!entry.stale,cached:!!entry.cached,...(entry.warning?{warning:entry.warning}:{})});
  function urlFor(points,model,kind){
    const u=new URL(kind==='profile'?config.profileUrl:config.weatherUrl);
    u.searchParams.set('latitude',points.map(p=>p.lat.toFixed(4)).join(','));u.searchParams.set('longitude',points.map(p=>p.lon.toFixed(4)).join(','));
    let fields=kind==='wind'?['wind_speed_10m','wind_direction_10m','wind_gusts_10m']:Object.values(FIELDS);
    if(kind==='profile')fields=['temperature_2m','dew_point_2m','surface_pressure','wind_speed_10m','wind_gusts_10m','wind_direction_10m',...LEVELS.flatMap(p=>Object.values(PRESSURE_FIELDS).map(f=>`${f}_${p}hPa`))];
    u.searchParams.set('hourly',fields.join(','));u.searchParams.set('timezone','auto');u.searchParams.set('timeformat','unixtime');u.searchParams.set('wind_speed_unit','kmh');u.searchParams.set('forecast_days','7');
    if(kind!=='profile')u.searchParams.set('models',model);else u.searchParams.set('models','gfs_global');
    if(config.weatherKey)u.searchParams.set('apikey',config.weatherKey);return u;
  }
  async function batch(points,model='best_match',kind='surface'){
    if(!MODELS.includes(model))throw new HttpError(400,'Unknown weather model.');
    if(!['surface','wind'].includes(kind))throw new HttpError(400,'Invalid forecast kind.');
    const output=new Map(),pending=[];
    // Coalesce identical coordinates within a batch, even if several site records share a launch.
    const unique=new Map();for(const p of points){const k=key(p,model,kind);if(!unique.has(k))unique.set(k,p);}
    for(const [k,p] of unique){const old=await cache.get(k);if(old&&Date.now()-old.fetchedAt<config.forecastTtl)output.set(k,attach({...old,cached:true}));else pending.push({p,k,old});}
    if(pending.length){
      const groupKey=`batch:${pending.map(x=>x.k).sort().join('|')}`;
      try{
        const response=await cache.load(groupKey,10000,async()=>{
          const raw=await fetchJson(urlFor(pending.map(x=>x.p),model,kind),{provider:'Open-Meteo surface',maxBytes:8_000_000});
          const results=Array.isArray(raw)?raw:[raw];if(results.length!==pending.length)throw new HttpError(502,'Weather batch response count differs from request count.');
          return results.map((r,i)=>normalizeWeather(r,{...pending[i].p,model}));
        });
        for(let i=0;i<pending.length;i++){const entry=await cache.put(pending[i].k,response.data[i]);output.set(pending[i].k,attach(entry));}
      }catch(e){
        for(const {k,old} of pending){if(old&&Date.now()-old.fetchedAt<86400000)output.set(k,attach({...old,stale:true,cached:true,warning:e.message}));else output.set(k,{error:e.message});}
      }
    }
    return points.map(p=>({key:p.key??`${p.lat},${p.lon}`,forecast:output.get(key(p,model,kind))}));
  }
  async function single(p,model='best_match'){const [r]=await batch([{...p,key:'point'}],model);if(r.forecast.error)throw new HttpError(502,r.forecast.error);return r.forecast;}
  async function profile(p){
    const entry=await cache.load(key(p,'gfs_global','profile'),config.forecastTtl,async()=>normalizeWeather(await fetchJson(urlFor([p],'gfs_global','profile'),{provider:'Open-Meteo sounding',maxBytes:6_000_000}),{...p,profile:true}),{staleMax:86400000});
    return attach(entry);
  }
  return {batch,single,profile,urlFor};
}
