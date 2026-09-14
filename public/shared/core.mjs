/** Pure calculations shared by the browser, adapters and tests. All wind is km/h, all epochs are UTC seconds. */
export const DIRECTIONS = ['N','NE','E','SE','S','SW','W','NW'];
export const finite = value => value !== null && value !== undefined && value !== '' && typeof value !== 'boolean' && Number.isFinite(Number(value)) ? Number(value) : null;
export const clamp = (x, min, max) => Math.min(max, Math.max(min, x));
export const wrap = x => ((x + 180) % 360 + 360) % 360 - 180;
export const degrees = x => ((x % 360) + 360) % 360;
export function distanceKm(a, b) {
  const rad = Math.PI / 180, dLat = (b.lat-a.lat)*rad, dLon = (b.lon-a.lon)*rad;
  const h = Math.sin(dLat/2)**2 + Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dLon/2)**2;
  return 12742 * Math.asin(Math.sqrt(clamp(h, 0, 1)));
}
export function coordinates(lat, lon) {
  lat = finite(lat); lon = finite(lon);
  return lat !== null && lon !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? {lat, lon} : null;
}
export const bearingName = n => finite(n) === null ? '—' : DIRECTIONS[Math.round(degrees(n)/45)%8];
export function inSector(direction, start, end) {
  if ([direction,start,end].some(x => finite(x) === null)) return false;
  if (Math.abs(end-start) >= 360) return true;
  direction=degrees(direction); start=degrees(start); end=degrees(end);
  // Half-open sectors give each boundary a single, predictable owner.
  return start <= end ? direction >= start && direction < end : direction >= start || direction < end;
}
export function sectorFor(direction, sectors) {
  if (finite(direction) === null || !Array.isArray(sectors)) return null;
  const hits=sectors.filter(s=>inSector(direction,s.start,s.end));
  return hits.length ? Math.max(...hits.map(s=>s.rating ?? 2)) : 0;
}
export function orientationSectors(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const known = DIRECTIONS.some(d => Object.hasOwn(obj,d));
  if (!known) return null;
  return DIRECTIONS.flatMap((d,i)=> {
    const rating=finite(obj[d]);
    return rating!==null && rating>0 ? [{start:degrees(i*45-22.5),end:degrees(i*45+22.5),rating:rating>=2?2:1,label:d}] : [];
  });
}
export function textSectors(text) {
  if (typeof text !== 'string' || !text.trim()) return null;
  const parts=text.toUpperCase().split(/[;,\s]+/).filter(Boolean);
  // Do not guess the meaning of ranges such as SW-N or the slope aspect.
  if (!parts.every(p=>DIRECTIONS.includes(p))) return null;
  return parts.map(p=> {const n=DIRECTIONS.indexOf(p)*45;return {start:degrees(n-22.5),end:degrees(n+22.5),rating:2,label:p};});
}
export const DEFAULT_LIMITS = Object.freeze({maxWind:25,maxGust:35,maxSpread:15,maxRain:0.1,capeCaution:500});
export function validatedLimits(input={}) {
  return Object.fromEntries(Object.entries(DEFAULT_LIMITS).map(([k,v])=>[k,clamp(finite(input[k])??v, k==='maxRain'?0:1, {maxWind:80,maxGust:100,maxSpread:60,maxRain:5,capeCaution:5000}[k])]));
}
export function atHour(forecast, epoch) {
  if (!forecast?.hours?.length || !Number.isFinite(epoch)) return null;
  const lo=forecast.hours.find(h=>h.time===epoch);
  return lo ?? null; // Do not silently use the nearest, stale or wrong-day hour.
}
export function assess(site, forecast, epoch, limits=DEFAULT_LIMITS, now=Date.now()/1000) {
  const reasons=[], concerns=[];
  const result=(status,why)=>({status,label:{match:'Weather match',caution:'Caution',outside:'Outside filters',unknown:'Not assessed',closed:'Closed / restricted'}[status],reasons:why,concerns});
  if (site.closed === true) return result('closed',['A supplied site record marks this site closed. Verify the original notice.']);
  const h=atHour(forecast,epoch);
  if (!h) return result('unknown',['Forecast unavailable for the selected hour.']);
  const maxWind=Math.min(limits.maxWind,finite(site.limits?.maxWind)??Infinity);
  const maxGust=Math.min(limits.maxGust,finite(site.limits?.maxGust)??Infinity);
  if (finite(h.wind)!==null && h.wind>maxWind) reasons.push(`Mean wind ${h.wind.toFixed(0)} km/h exceeds ${maxWind} km/h screening limit.`);
  if (finite(h.gust)!==null && h.gust>maxGust) reasons.push(`Gusts ${h.gust.toFixed(0)} km/h exceed ${maxGust} km/h screening limit.`);
  if (finite(h.gust)!==null && finite(h.wind)!==null && h.gust-h.wind>limits.maxSpread) reasons.push('Gust spread exceeds the configured limit.');
  if (finite(h.rain)!==null && h.rain>limits.maxRain) reasons.push(`Precipitation ${h.rain.toFixed(1)} mm/h exceeds the screening limit.`);
  if ([95,96,99].includes(h.code)) reasons.push('Forecast weather code indicates a thunderstorm.');
  if (h.isDay===0) reasons.push('Outside daylight hours.');
  if (reasons.length) return result('outside',reasons);
  if (forecast.stale || now-forecast.fetchedAt/1000>7200) return result('unknown',['Forecast retrieval is stale. Refresh before assessing.']);
  if (epoch<now-3600) return result('unknown',['This hour is in the past; not an upcoming window.']);
  const missing=['wind','gust','direction','rain','code','isDay'].filter(k=>finite(h[k])===null);
  if (missing.length) return result('unknown',[`Missing required data: ${missing.join(', ')}.`]);
  const sector=sectorFor(h.direction,site.sectors);
  if (sector===null) return result('unknown',['No documented usable wind sectors. Orientation is not inferred from terrain.']);
  if (h.wind>=3 && sector===0) return result('outside',[`Wind FROM ${bearingName(h.direction)} does not match recorded usable sectors.`]);
  if (h.wind<3) concerns.push('Very light model wind: launch direction cannot be inferred reliably.');
  if (sector===1) concerns.push('Source marks this direction possible, not preferred.');
  if (h.cape!==null && h.cape>=limits.capeCaution) concerns.push(`CAPE ${Math.round(h.cape)} J/kg warrants a convective-weather check; CAPE is not thermal strength.`);
  if (h.visibility!==null && h.visibility<3000) concerns.push('Model visibility is below 3 km.');
  if (!site.landings?.length) concerns.push('No documented associated landing.');
  if (forecast.fetchedAt/1000>now+300) concerns.push('Data timestamp is ahead of the local clock.');
  if (concerns.length) return result('caution',['No tested weather limit was exceeded.',...concerns]);
  concerns.push('Landing weather, airspace, current closures, rotor, valley wind and pilot suitability are not cleared by this badge.');
  return result('match',[`Wind FROM ${bearingName(h.direction)} matches a recorded usable sector.`, 'Available surface forecast is within the configured screening limits.']);
}
const dateFormatters=new Map(),timeFormatters=new Map(),dateMemo=new Map();
export function dateKey(epoch, zone='UTC') {
  const key=zone+':'+epoch;if(dateMemo.has(key))return dateMemo.get(key);
  if(!dateFormatters.has(zone))dateFormatters.set(zone,new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}));
  const value=dateFormatters.get(zone).format(new Date(epoch*1000));dateMemo.set(key,value);if(dateMemo.size>10000)dateMemo.delete(dateMemo.keys().next().value);return value;
}
export function timeLabel(epoch,zone='UTC',withZone=false) {
  const key=zone+':'+withZone;if(!timeFormatters.has(key))timeFormatters.set(key,new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',minute:'2-digit',...(withZone?{timeZoneName:'short'}:{})}));return timeFormatters.get(key).format(new Date(epoch*1000));
}
export function dayWindows(site, forecast, day, zone, limits, now=Date.now()/1000) {
  const hours=(forecast?.hours??[]).filter(h=>dateKey(h.time,zone)===day && h.time>=Math.floor(now/3600)*3600);
  const windows=[];let active=null;
  for (const h of hours) {
    if (assess(site,forecast,h.time,limits,now).status==='match') {
      if (!active || h.time!==active.end) {active={start:h.time,end:h.time+3600};windows.push(active);} else active.end=h.time+3600;
    } else active=null;
  }
  return windows.sort((a,b)=>(b.end-b.start)-(a.end-a.start));
}
export function windUnit(value,unit='km/h') {
  if (finite(value)===null) return '—';
  return (value/({'km/h':1,'m/s':3.6,'kt':1.852,'mph':1.609344}[unit]??1)).toFixed(unit==='m/s'?1:0);
}
export function profileAt(profile, epoch) {
  const h=atHour(profile,epoch);
  if (!h) return [];
  const ground=finite(profile.elevationM);
  return (h.levels??[]).filter(l=>finite(l.height)!==null && (ground===null || l.height>=ground)).sort((a,b)=>a.height-b.height);
}
export function windAtHeight(levels, height) {
  height=finite(height);
  if(height===null)return null;
  const usable=(Array.isArray(levels)?levels:[]).filter(l=>finite(l.height)!==null&&finite(l.wind)!==null).sort((a,b)=>a.height-b.height);
  const exact=usable.find(l=>Math.abs(l.height-height)<1);
  if(exact)return {wind:exact.wind,direction:finite(exact.direction),interpolated:false,between:[exact.pressure]};
  const upper=usable.find(l=>l.height>height),lower=usable.findLast(l=>l.height<height);
  if(!lower||!upper||upper.height-lower.height>1500)return null;
  const fraction=(height-lower.height)/(upper.height-lower.height);
  if(finite(lower.direction)===null||finite(upper.direction)===null)return {wind:lower.wind+(upper.wind-lower.wind)*fraction,direction:null,interpolated:true,between:[lower.pressure,upper.pressure]};
  const vector=l=>{const angle=degrees(l.direction+180)*Math.PI/180;return {east:Math.sin(angle)*l.wind,north:Math.cos(angle)*l.wind};};
  const a=vector(lower),b=vector(upper),east=a.east+(b.east-a.east)*fraction,north=a.north+(b.north-a.north)*fraction;
  const speed=Math.hypot(east,north);
  return {wind:speed,direction:speed<.5?null:degrees(Math.atan2(east,north)*180/Math.PI+180),interpolated:true,between:[lower.pressure,upper.pressure]};
}
