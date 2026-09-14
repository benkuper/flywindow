#!/usr/bin/env node
/** Genuine provider diagnostic. It never accepts fixtures as live success. */
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {config,root} from '../server/config.mjs';
import {coordinates} from '../public/shared/core.mjs';
const args=process.argv.slice(2);
if(args.includes('--help')){
  console.log('Usage: npm run doctor -- LATITUDE LONGITUDE\nWithout coordinates, uses 45.9,6.2 as a diagnostic example only. Checks real configured providers with a fresh cache.');process.exit(0);
}
const point=args.length===0?{lat:45.9,lon:6.2}:args.length===2?coordinates(args[0],args[1]):null;
if(!point){console.error('Provide two decimal coordinates, latitude then longitude.');process.exit(2);}
if(config.testData||config.allowLocal){console.error('Refusing live diagnostic with TEST_DATA or ALLOW_LOCAL_TEST_UPSTREAMS enabled.');process.exit(2);}
const output=resolve(root,'data/diagnostics-last.json');
const temp=await mkdtemp(join(tmpdir(),'flywindow-live-'));
config.cacheDir=temp; // Force actual network checks, never pass on cached provider replies.
const {createApp}=await import('../server/index.mjs');
const app=createApp();await new Promise((done,fail)=>{app.once('error',fail);app.listen(0,'127.0.0.1',done);});
const origin=`http://127.0.0.1:${app.address().port}`;
const report={checkedAt:new Date().toISOString(),coordinates:point,mode:'Live configured providers; fresh temporary cache',checks:[]};
const auth=config.basicUser?{Authorization:'Basic '+Buffer.from(`${config.basicUser}:${config.basicPass}`).toString('base64')}:{};
const q=`lat=${point.lat}&lon=${point.lon}`;
async function check(name,path,validate,{optional=false}={}){
  const start=Date.now();let entry;
  try{
    const response=await fetch(origin+path,{headers:auth,signal:AbortSignal.timeout(125000)});
    const data=await response.json();if(!response.ok)throw new Error(data.error||`HTTP ${response.status}`);
    const result=validate(data);entry={name,state:result.warning?'WARN':'PASS',message:result.message};
  }catch(e){entry={name,state:optional?'WARN':'FAIL',message:e.message||'Connection failed'};}
  entry.elapsedMs=Date.now()-start;report.checks.push(entry);console.log(`${entry.state.padEnd(4)} ${name}: ${entry.message}`);
}
console.log(`Flywindow live diagnostic · ${point.lat}, ${point.lon}`);
console.log('No fixture data or existing cache is used. Browser tile rendering/permissions are separate checks.');
try{
  await check('Surface forecast',`/api/forecast?${q}`,d=>{
    const hours=d.hours.filter(h=>h.wind!==null&&h.gust!==null&&h.direction!==null);
    if(!hours.length||d.stale)throw new Error('No fresh usable wind/direction/gust series was returned.');
    return {message:`${hours.length} usable hourly samples; timezone ${d.timezone}; model ${d.model}.`};
  });
  await check('Forecast sounding',`/api/profile?${q}`,d=>{
    const levels=d.hours?.flatMap(h=>h.levels||[]).filter(l=>l.height!==null&&l.temperature!==null&&l.dewpoint!==null)||[];
    if(!levels.length||d.stale)throw new Error('No fresh pressure-level temperature/dew-point/height series returned.');
    return {message:`${d.hours.length} hourly profiles; ${d.model}.`};
  });
  await check('Site catalogue',`/api/sites?${q}&radius=50`,d=>{
    const live=d.sources.filter(s=>s.state==='ok'&&s.name!=='Local operator records');
    if(!live.length)throw new Error(d.warnings.join(' | ')||'No enabled external site source succeeded.');
    return {warning:d.sites.length===0||d.sources.some(s=>s.state==='error'),message:`${d.sites.length} takeoffs; ${live.map(s=>s.name).join(', ')}; ${d.sites.filter(s=>s.landings.length).length} with associated landings.${d.warnings.length?' Warnings: '+d.warnings.join(' | '):''}`};
  });
  await check('Worldwide geocoding','/api/geocode?q=Cape%20Town',d=>{
    if(!Array.isArray(d.results)||!d.results.length)throw new Error('No geocoding result returned for diagnostic place query.');
    return {message:`${d.results.length} parsed place result(s).`};
  });
  await check('FFVL observations',`/api/stations?${q}&radius=50`,d=>{
    if(d.state==='error'||d.state==='stale'||d.state==='disabled')throw new Error((d.warnings||[]).join(' | ')||`FFVL state: ${d.state}`);
    return {warning:!d.stations?.length,message:`${d.stations?.length||0} nearby reports; ${d.stations?.filter(s=>s.fresh).length||0} fresh. Regional coverage only; no reports here need not indicate an error.${d.note?' '+d.note:''}`};
  },{optional:true});
  const states=await fetch(origin+'/api/status',{headers:auth}).then(r=>r.json());
  report.providers=states.providers;
  report.ok=!report.checks.some(c=>c.state==='FAIL');
  await mkdir(resolve(root,'data'),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');
  console.log(`\n${report.ok?'Core checks passed. Review any warnings.':'One or more core integrations need attention.'}\nReport: ${output}`);
  process.exitCode=report.ok?0:1;
}finally{
  app.closeAllConnections();await new Promise(r=>app.close(r));await rm(temp,{recursive:true,force:true});
}
