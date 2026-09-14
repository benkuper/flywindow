/** Isolated upstream emulator for automated tests only. Production never imports this module. */
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
export function fixtureWeather(url){
  const lats=(url.searchParams.get('latitude')||'45.9').split(',').map(Number),lons=(url.searchParams.get('longitude')||'6.2').split(',').map(Number);
  const fields=(url.searchParams.get('hourly')||'wind_speed_10m').split(',');const now=new Date(),start=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate())/1000;
  const levels={1000:100,975:310,950:530,925:760,900:990,850:1480,800:1990,750:2530,700:3070,600:4200,500:5630,400:7130};
  const result=lats.map((lat,index)=>{
    const hourly={time:Array.from({length:168},(_,i)=>start+i*3600)},units={time:'unixtime'};
    for(const field of fields){
      units[field]=field.includes('wind_speed')||field.includes('wind_gusts')?'km/h':field.includes('direction')?'°':field.includes('temperature')||field.includes('dew_point')?'°C':field.includes('height')?'m':field==='cape'?'J/kg':field==='shortwave_radiation'?'W/m²':field==='precipitation'?'mm':'%';
      hourly[field]=hourly.time.map((time,i)=>{const h=(i+2)%24,day=Math.floor(i/24),s=Math.max(0,Math.sin((h-6)/12*Math.PI));const p=field.match(/_(\d+)hPa$/);if(p){const height=levels[p[1]]||1000;if(field.startsWith('geopotential_height'))return height;if(field.startsWith('temperature'))return 23-height*0.0065+(height===1990?2:0);if(field.startsWith('dew_point'))return 16-height*0.007;if(field.startsWith('wind_speed'))return 8+height/150;if(field.startsWith('wind_direction'))return 125+height/100;}
        return ({temperature_2m:15+10*s,dew_point_2m:9+3*s,wind_speed_10m:8+8*s+day,wind_gusts_10m:12+12*s+day,wind_direction_10m:125,precipitation:day===3&&h>14?0.5:0,precipitation_probability:day===3?55:10,weather_code:day===3?61:2,is_day:h>=7&&h<=18?1:0,cloud_cover:22+day*7,cloud_cover_low:15,cloud_cover_mid:20,cloud_cover_high:30,cape:80+120*s,boundary_layer_height:180+1800*s,shortwave_radiation:650*s,visibility:24000,surface_pressure:890})[field]??null;
      });
    }
    return {latitude:lat,longitude:lons[index]??lons[0],elevation:1100,timezone:'Europe/Paris',utc_offset_seconds:7200,hourly,hourly_units:units};
  });return result.length===1?result[0]:result;
}
export function createMockServer(){return createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');const send=data=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));};
  if(url.pathname==='/pg'){res.setHeader('Content-Type','application/xml');res.end(await readFile(new URL('./fixtures/pgearth.xml',import.meta.url)));}
  else if(url.pathname==='/weather'||url.pathname==='/gfs')send(fixtureWeather(url));
  else if(url.pathname==='/geo')send({results:[{id:1,name:'TEST · Annecy area',admin1:'Synthetic fixture',country:'France',country_code:'FR',latitude:45.9,longitude:6.2,timezone:'Europe/Paris'}]});
  else if(url.pathname==='/stations')send([{idbalise:'1',nom:'TEST · Ridge sensor',latitude:45.909,longitude:6.22,altitude:1220,active:1},{idbalise:'2',nom:'TEST · Valley sensor',latitude:45.882,longitude:6.18,altitude:490,active:1}]);
  else if(url.pathname==='/observations')send([{idbalise:'1',date:new Date(Date.now()-240000).toISOString(),vitesseVentMoy:13,vitesseVentMax:20,directVentMoy:130,temperature:18},{idbalise:'2',date:new Date(Date.now()-7200000).toISOString(),vitesseVentMoy:8,vitesseVentMax:12,directVentMoy:115,temperature:22}]);
  else if(url.pathname==='/overpass')send({elements:[{type:'node',id:999,lat:45.89,lon:6.3,tags:{name:'TEST · OSM takeoff','free_flying:site':'takeoff','free_flying:site_orientation':'SE;S',ele:'900'}}]});
  else if(url.pathname==='/failure'){res.writeHead(503);res.end('Test upstream failure');}
  else {res.writeHead(404);res.end('Not found');}
});}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)createMockServer().listen(Number(process.env.MOCK_PORT)||4319,'127.0.0.1',()=>console.log('TEST upstream on 4319'));
