import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
export const root=resolve(import.meta.dirname,'..');
if(existsSync(resolve(root,'.env'))) process.loadEnvFile(resolve(root,'.env'));
const bool=(k,d=false)=>process.env[k]===undefined?d:['1','true','yes'].includes(process.env[k].toLowerCase());
const num=(k,d,min,max)=>Math.max(min,Math.min(max,Number(process.env[k])||d));
export const config={
  port:num('PORT',3000,1,65535),host:process.env.HOST||'0.0.0.0',
  contact:process.env.CONTACT_EMAIL||'',
  weatherUrl:process.env.OPEN_METEO_URL||'https://api.open-meteo.com/v1/forecast',
  profileUrl:process.env.OPEN_METEO_PROFILE_URL||'https://api.open-meteo.com/v1/gfs',
  geocodeUrl:process.env.GEOCODING_URL||'https://geocoding-api.open-meteo.com/v1/search',
  weatherKey:process.env.OPEN_METEO_API_KEY||'',
  pgUrl:process.env.PGEARTH_URL||'https://paraglidingearth.com/api/getAroundLatLngSites.php',
  overpassUrl:process.env.OVERPASS_URL||'https://overpass-api.de/api/interpreter',
  stationUrl:process.env.FFVL_STATIONS_URL||'https://data.ffvl.fr/json/balises.json',
  readingsUrl:process.env.FFVL_READINGS_URL||'https://data.ffvl.fr/json/relevesmeteo.json',
  stationTimezone:process.env.FFVL_TIMESTAMP_TIMEZONE||'',
  pgEnabled:bool('ENABLE_PGEARTH',true),osmEnabled:bool('ENABLE_OSM_FALLBACK',true),
  ffvlEnabled:bool('ENABLE_FFVL',true),
  tileUrl:process.env.TILE_URL||'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  tileAttribution:process.env.TILE_ATTRIBUTION||'© OpenStreetMap contributors',
  tileAttributionUrl:process.env.TILE_ATTRIBUTION_URL||'https://www.openstreetmap.org/copyright',
  maxSites:num('MAX_SITES',60,1,150),requestTimeout:num('UPSTREAM_TIMEOUT_MS',18000,1000,45000),
  cacheDir:resolve(root,process.env.CACHE_DIR||'data/cache'),
  customFile:resolve(root,process.env.CUSTOM_SITES_FILE||'data/sites.geojson'),
  basicUser:process.env.BASIC_AUTH_USER||'',basicPass:process.env.BASIC_AUTH_PASSWORD||'',
  requestsPerMinute:num('REQUESTS_PER_MINUTE',180,10,1000),
  upstreamHourlyBudget:num('UPSTREAM_HOURLY_REQUEST_BUDGET',240,1,5000),
  forecastTtl:num('FORECAST_CACHE_SECONDS',1200,300,3600)*1000,
  allowLocal:bool('ALLOW_LOCAL_TEST_UPSTREAMS',false),
  testData:bool('TEST_DATA',false),
};
if(config.testData && !config.allowLocal) throw new Error('TEST_DATA requires ALLOW_LOCAL_TEST_UPSTREAMS. Never enable these in production.');
if(Boolean(config.basicUser)!==Boolean(config.basicPass)) throw new Error('Set both BASIC_AUTH_USER and BASIC_AUTH_PASSWORD, or neither.');
export function upstreamUrl(raw){
  const u=new URL(raw);
  if(u.protocol!=='https:' && !(config.allowLocal && u.protocol==='http:' && ['127.0.0.1','localhost','[::1]'].includes(u.hostname))) throw new Error('Upstreams require HTTPS (except explicitly enabled loopback tests).');
  return u;
}
