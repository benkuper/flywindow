import {config} from '../config.mjs';
import {fetchJson,HttpError} from '../http.mjs';
import {coordinates} from '../../public/shared/core.mjs';
import {plain} from '../xml.mjs';
export function createGeocoder(cache){return async function geocode(q){
  const u=new URL(config.geocodeUrl);u.searchParams.set('name',q);u.searchParams.set('count','8');u.searchParams.set('language','en');u.searchParams.set('format','json');
  const result=await cache.load(`geocode-v1:${u}`,7*86400000,()=>fetchJson(u,{provider:'Open-Meteo geocoding'}));
  if(result.data.error)throw new HttpError(502,'Geocoding provider rejected the request.');
  return {results:(result.data.results||[]).flatMap(r=>{const p=coordinates(r.latitude,r.longitude);return p?[{...p,id:r.id,name:plain(r.name),admin:plain(r.admin1),country:plain(r.country),countryCode:plain(r.country_code),timezone:r.timezone||null}]:[]})};
};}
