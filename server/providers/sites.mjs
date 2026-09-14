import {readFile} from 'node:fs/promises';
import {config} from '../config.mjs';
import {fetchText,fetchJson,HttpError} from '../http.mjs';
import {parseXml,descendants,child,children,value,plain} from '../xml.mjs';
import {coordinates,distanceKm,orientationSectors,textSectors,finite,DIRECTIONS,clamp} from '../../public/shared/core.mjs';
export function safeUrl(raw,fallback='') {try{const u=new URL(raw);return ['https:','http:'].includes(u.protocol)?u.href:fallback;}catch{return fallback;}}
const pointFrom=(node,latName='lat',lonName='lng')=>coordinates(value(node,latName),value(node,lonName));
export function parsePgEarth(xml){
  const tree=parseXml(xml),search=descendants(tree,'search')[0];
  if(!search)throw new HttpError(502,'ParaglidingEarth returned an unexpected XML schema (no search element).');
  const landingNodes=descendants(search,'landing');
  const takeoffs=descendants(search,'takeoff');
  const sites=[];
  for(const t of takeoffs){
    const p=pointFrom(t),id=value(t,'pge_site_id');if(!p||!id)continue;
    if(value(t,'paragliding')==='0')continue;
    const o=child(t,'orientations'),obj=Object.fromEntries(DIRECTIONS.filter(d=>child(o,d)).map(d=>[d,value(o,d)]));
    const linked=landingNodes.filter(l=>value(l,'landing_pge_site_id')===id || children(t,'landing').includes(l));
    const sourceUrl=safeUrl(value(t,'pge_link'),`https://paraglidingearth.com/?site=${encodeURIComponent(id)}`);
    const landings=[];
    for(const l of linked){
      const lp=pointFrom(l,'landing_lat','landing_lng');
      if(lp)landings.push({id:`pg-${id}-landing-${landings.length}`,name:plain(value(l,'landing_name')||'Main landing'),...lp,elevationM:finite(value(l,'landing_altitude')),elevationReference:'Source datum unverified',description:plain(value(l,'landing_description')),association:'Documented in ParaglidingEarth record; current access not verified',source:'ParaglidingEarth',sourceUrl});
      for(const alt of descendants(l,'alternate_landing')){
        const ap=pointFrom(alt);if(ap)landings.push({id:`pg-${id}-landing-${landings.length}`,name:plain(value(alt,'name')||'Alternative landing'),...ap,elevationM:null,description:plain(value(alt,'description')),association:'Alternative documented in source record; suitability is conditional',source:'ParaglidingEarth',sourceUrl});
      }
    }
    const parking=child(t,'takeoff_parking'),park=pointFrom(parking,'takeoff_parking_lat','takeoff_parking_lng');
    sites.push({id:`pg-${id}`,name:plain(value(t,'name'))||`Site ${id}`,...p,country:plain(value(t,'countryCode')).toUpperCase(),
      elevationM:finite(value(t,'takeoff_altitude')),elevationReference:'Source datum unverified',
      sectors:orientationSectors(obj),description:plain(value(t,'takeoff_description')),access:plain(value(t,'going_there')),rules:plain(value(t,'flight_rules')),weatherNotes:plain(value(t,'weather')),comments:plain(value(t,'comments')),
      source:'ParaglidingEarth',sourceUrl,sourceModified:plain(value(t,'last_edit'))||null,verifiedAt:null,closed:false,
      landings,parking:park?{...park,description:plain(value(parking,'takeoff_parking_description'))}:null,
      alternateTakeoffs:descendants(t,'alternate_takeoff').flatMap(a=>{const p=pointFrom(a);return p?[{...p,name:plain(value(a,'name')),description:plain(value(a,'description'))}]:[]}),
      activities:['hike','thermals','soaring','xc','flatland','winch'].filter(k=>value(t,k)==='1')});
  }
  if(takeoffs.length && !sites.length && takeoffs.some(t=>value(t,'paragliding')!=='0'))throw new HttpError(502,'ParaglidingEarth records could not be normalized; check the upstream schema.');
  return sites;
}
export function parseOverpass(data){
  if(!Array.isArray(data?.elements))throw new HttpError(502,'OpenStreetMap returned an unexpected schema.');
  const sites=[],unlinkedLandings=[];
  for(const item of data.elements){
    const tags=item.tags||{},p=coordinates(item.lat??item.center?.lat,item.lon??item.center?.lon);if(!p)continue;
    const isLanding=tags['free_flying:site']==='landing'||tags['free_flying:landing']==='yes';
    const isTakeoff=tags['free_flying:site']==='takeoff'||tags['free_flying:takeoff']==='yes';
    const sourceUrl=`https://www.openstreetmap.org/${encodeURIComponent(item.type)}/${encodeURIComponent(item.id)}`;
    const basic={id:`osm-${item.type}-${item.id}`,...p,name:plain(tags.name||tags['name:en']||(isLanding?'Unnamed mapped landing':'Unnamed mapped takeoff')),source:'OpenStreetMap',sourceUrl,elevationM:finite(tags.ele),elevationReference:'OSM ele (AMSL)',description:plain(tags.description||tags.note||''),sourceModified:item.timestamp??null};
    if(isLanding){unlinkedLandings.push({...basic,association:'Unlinked OSM landing — not assigned to any takeoff'});if(!isTakeoff)continue;}
    if(!isTakeoff)continue;
    sites.push({...basic,country:'',sectors:textSectors(tags['free_flying:site_orientation']),access:plain(tags.access||''),rules:plain(tags['free_flying:site_restrictions']||''),weatherNotes:'',comments:'',verifiedAt:null,closed:tags.access==='no'||tags['free_flying:site:status']==='closed',landings:[],parking:null,activities:[],alternateTakeoffs:[]});
  }
  return {sites,unlinkedLandings,remark:plain(data.remark||'')};
}
export function parseCustom(data){
  if(data?.type!=='FeatureCollection'||!Array.isArray(data.features))throw new Error('Custom sites file must be a GeoJSON FeatureCollection.');
  return data.features.flatMap((f,index)=>{
    const props=f.properties||{},xy=f.geometry?.coordinates,p=Array.isArray(xy)?coordinates(xy[1],xy[0]):null;if(!p)return [];
    const sectors=Array.isArray(props.windSectors)?props.windSectors.filter(s=>finite(s.start)!==null&&finite(s.end)!==null).map(s=>({start:Number(s.start),end:Number(s.end),rating:s.rating===1?1:2,label:plain(s.label||'')})):textSectors(props.usableDirections);
    const landings=(Array.isArray(props.landings)?props.landings:[]).flatMap((l,i)=>{const p=coordinates(l.lat,l.lon);return p?[{...p,id:`custom-${index}-landing-${i}`,name:plain(l.name||'Associated landing'),elevationM:finite(l.elevationM),description:plain(l.description),source:plain(l.source||'Local operator record'),sourceUrl:safeUrl(l.sourceUrl),association:plain(l.association||'Explicit link supplied by the server operator; confirm current conditions')}]:[];});
    return [{id:`custom-${String(f.id??index).replace(/[^\w-]/g,'').slice(0,60)}`,name:plain(props.name||'Local site'),...p,country:plain(props.country||''),elevationM:finite(props.elevationM),elevationReference:plain(props.elevationReference||'Source datum unverified'),description:plain(props.description),access:plain(props.access),rules:plain(props.rules),weatherNotes:plain(props.weatherNotes),comments:'',sectors,landings,parking:null,source:plain(props.source||'Local operator record'),sourceUrl:safeUrl(props.sourceUrl),sourceModified:props.modifiedAt||null,verifiedAt:props.verifiedAt||null,closed:props.closed===true,limits:props.limits?{maxWind:finite(props.limits.maxWind),maxGust:finite(props.limits.maxGust)}:null,activities:[],alternateTakeoffs:[]}];
  });
}
export function createSitesProvider(cache){
  async function pgEarth(lat,lon,radius){
    const u=new URL(config.pgUrl);u.searchParams.set('lat',String(lat));u.searchParams.set('lng',String(lon));u.searchParams.set('distance',String(radius));u.searchParams.set('limit',String(config.maxSites));u.searchParams.set('style','detailled');
    return cache.load(`pge-v2:${u}`,6*3600000,async()=>parsePgEarth(await fetchText(u,{provider:'ParaglidingEarth'})),{staleMax:7*86400000});
  }
  async function osm(lat,lon,radius){
    const query=`[out:json][timeout:20];(nwr(around:${radius*1000},${lat},${lon})["free_flying:site"~"^(takeoff|landing)$"];nwr(around:${radius*1000},${lat},${lon})["free_flying:takeoff"="yes"];nwr(around:${radius*1000},${lat},${lon})["free_flying:landing"="yes"];);out center meta;`;
    return cache.load(`osm-v2:${config.overpassUrl}:${lat}:${lon}:${radius}`,12*3600000,async()=>parseOverpass(await fetchJson(config.overpassUrl,{provider:'OpenStreetMap / Overpass',method:'POST',body:new URLSearchParams({data:query}).toString(),headers:{'Content-Type':'application/x-www-form-urlencoded'}})),{staleMax:7*86400000});
  }
  return async function loadSites({lat,lon,radius,includeOsm=false}){
    let sites=[],unlinkedLandings=[],sources=[],warnings=[];
    try{const data=JSON.parse(await readFile(config.customFile,'utf8'));sites.push(...parseCustom(data));sources.push({name:'Local operator records',state:'ok'});}catch(e){if(e.code!=='ENOENT')warnings.push(`Custom sites: ${e.message}`);}
    let pgOk=false;
    if(config.pgEnabled){try{const result=await pgEarth(lat,lon,radius);sites.push(...result.data);pgOk=result.data.length>0;sources.push({name:'ParaglidingEarth',state:result.stale?'stale':'ok',fetchedAt:result.fetchedAt});if(result.stale)warnings.push('ParaglidingEarth is unavailable; cached site records are being shown.');}catch(e){warnings.push(e.message);sources.push({name:'ParaglidingEarth',state:'error'});}}
    if(config.osmEnabled && (includeOsm||!pgOk)){
      try{const result=await osm(lat,lon,radius);sites.push(...result.data.sites);unlinkedLandings=result.data.unlinkedLandings;sources.push({name:'OpenStreetMap',state:result.stale?'stale':'ok',fetchedAt:result.fetchedAt});if(result.data.remark)warnings.push(`Overpass: ${result.data.remark}`);if(result.stale)warnings.push('OSM site records are from a stale cache.');}catch(e){warnings.push(e.message);sources.push({name:'OpenStreetMap',state:'error'});}
    }
    sites=sites.map(s=>({...s,distanceKm:distanceKm({lat,lon},s)})).filter(s=>s.distanceKm<=radius).sort((a,b)=>a.distanceKm-b.distanceKm);
    const seen=new Set();sites=sites.filter(s=>!seen.has(s.id)&&seen.add(s.id));
    const total=sites.length,limited=total>=config.maxSites;
    return {sites:sites.slice(0,config.maxSites),unlinkedLandings:unlinkedLandings.filter(s=>distanceKm({lat,lon},s)<=radius).slice(0,100),sources,warnings,limited,maxSites:config.maxSites,scope:{lat,lon,radius},retrievedAt:Date.now(),coverageNote:'A site catalogue search, not a complete inventory. Source duplicates may remain. Landing links are never inferred from proximity.'};
  };
}
