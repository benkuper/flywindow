import {wrap,clamp,finite,bearingName,atHour,windUnit} from './shared/core.mjs';
import {esc,link,rose,windArrow,COLORS,icon} from './ui.mjs';
/** Dependency-free, geographic slippy map. XYZ raster tiles, WGS84/Web Mercator, wrap-safe overlays. */
export function project(lat,lon,z){const n=256*2**z,r=clamp(lat,-85.05112878,85.05112878)*Math.PI/180;return {x:(lon+180)/360*n,y:(1-Math.asinh(Math.tan(r))/Math.PI)/2*n};}
export function unproject(x,y,z){const n=256*2**z;return {lat:clamp(Math.atan(Math.sinh(Math.PI*(1-2*y/n)))*180/Math.PI,-85.05112878,85.05112878),lon:wrap(x/n*360-180)};}
export class FlightMap{
  constructor(container,{onSite,onLanding,onMove,onStation}={}){
    this.el=container;this.onSite=onSite;this.onLanding=onLanding;this.onMove=onMove;this.onStation=onStation;
    this.center={lat:20,lon:0};this.zoom=2;this.tiles=new Map();this.markers=[];this.pointers=new Map();this.tileErrors=0;this.tileLoaded=0;this.data={sites:[],stations:[],wind:[],landings:[]};
    container.innerHTML='<div class="map-tiles"></div><svg class="map-lines"></svg><div class="map-points"></div><div class="map-attribution"></div><div class="tile-warning" hidden>Map tiles unavailable. Site data remains accessible in the list.</div><div class="map-zoom"><button aria-label="Zoom in" data-zoom="1">+</button><button aria-label="Zoom out" data-zoom="-1">−</button></div><div class="map-scale"></div>';
    this.tileLayer=container.querySelector('.map-tiles');this.lines=container.querySelector('.map-lines');this.points=container.querySelector('.map-points');
    container.querySelectorAll('[data-zoom]').forEach(b=>b.addEventListener('click',()=>this.zoomAt(this.zoom+Number(b.dataset.zoom))));
    container.tabIndex=0;container.setAttribute('aria-label','Interactive worldwide site map. Arrow keys pan, plus and minus zoom.');
    container.addEventListener('wheel',e=>{e.preventDefault();this.zoomAt(this.zoom+(e.deltaY<0?1:-1),this.local(e));},{passive:false});
    container.addEventListener('dblclick',e=>{if(e.target.closest('button,a'))return;this.zoomAt(this.zoom+1,this.local(e));});
    container.addEventListener('pointerdown',e=>this.down(e));container.addEventListener('pointermove',e=>this.move(e));
    for(const name of ['pointerup','pointercancel','lostpointercapture'])container.addEventListener(name,e=>this.up(e));
    container.addEventListener('keydown',e=>{if(e.target!==container)return;const shifts={ArrowLeft:[-100,0],ArrowRight:[100,0],ArrowUp:[0,-100],ArrowDown:[0,100]};if(shifts[e.key]){e.preventDefault();const c=project(this.center.lat,this.center.lon,this.zoom),[x,y]=shifts[e.key];this.center=unproject(c.x+x,c.y+y,this.zoom);this.draw();this.notify();}else if(['+','=','-'].includes(e.key)){e.preventDefault();this.zoomAt(this.zoom+(e.key==='-'?-1:1));}});
    this.observer=new ResizeObserver(()=>{this.draw();this.notify();});this.observer.observe(container);
  }
  configure(config){this.config=config;this.el.querySelector('.map-attribution').innerHTML=`<a href="${link(config.tileAttributionUrl)}" target="_blank" rel="noopener noreferrer">${esc(config.tileAttribution)}</a>`;this.draw();}
  local(e){const r=this.el.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};}
  down(e){if(e.target.closest('button,a')||e.button>0)return;this.el.setPointerCapture(e.pointerId);this.pointers.set(e.pointerId,this.local(e));this.snapshot();this.el.classList.add('dragging');}
  snapshot(){const values=[...this.pointers.values()];this.drag={center:project(this.center.lat,this.center.lon,this.zoom),zoom:this.zoom,point:values[0],distance:values.length>1?Math.hypot(values[0].x-values[1].x,values[0].y-values[1].y):null};}
  move(e){if(!this.pointers.has(e.pointerId))return;this.pointers.set(e.pointerId,this.local(e));const v=[...this.pointers.values()];
    if(v.length>1&&this.drag.distance){const d=Math.hypot(v[0].x-v[1].x,v[0].y-v[1].y),z=clamp(this.drag.zoom+Math.round(Math.log2(d/this.drag.distance)),2,18);if(z!==this.zoom){this.zoom=z;this.draw();}}
    else if(this.drag.point){const p=v[0];this.center=unproject(this.drag.center.x-(p.x-this.drag.point.x),this.drag.center.y-(p.y-this.drag.point.y),this.drag.zoom);this.draw();}
  }
  up(e){if(!this.pointers.has(e.pointerId))return;this.pointers.delete(e.pointerId);if(this.pointers.size)this.snapshot();else{this.el.classList.remove('dragging');this.notify();}}
  notify(){this.onMove?.({...this.center},this.zoom);}
  zoomAt(z,p){z=clamp(z,2,18);if(z===this.zoom)return;const W=this.el.clientWidth,H=this.el.clientHeight; p=p||{x:W/2,y:H/2};const old=project(this.center.lat,this.center.lon,this.zoom),anchor=unproject(old.x+p.x-W/2,old.y+p.y-H/2,this.zoom);const next=project(anchor.lat,anchor.lon,z);this.center=unproject(next.x-p.x+W/2,next.y-p.y+H/2,z);this.zoom=z;this.draw();this.notify();}
  setView(lat,lon,radius=50){this.center={lat:clamp(lat,-85,85),lon:wrap(lon)};const width=Math.max(300,this.el.clientWidth),scale=Math.cos(lat*Math.PI/180)*40075016/256;this.zoom=clamp(Math.floor(Math.log2(scale*width/(radius*2400))),2,16);this.draw();}
  focus(lat,lon){this.center={lat:clamp(lat,-85,85),lon:wrap(lon)};this.zoom=Math.max(this.zoom,12);this.draw();this.notify();}
  screen(lat,lon){const c=project(this.center.lat,this.center.lon,this.zoom),p=project(lat,lon,this.zoom),world=256*2**this.zoom;let dx=p.x-c.x;if(dx>world/2)dx-=world;if(dx<-world/2)dx+=world;return {x:this.el.clientWidth/2+dx,y:this.el.clientHeight/2+p.y-c.y};}
  windSamplePoints(density=6){
    const W=this.el.clientWidth,H=this.el.clientHeight;if(!W||!H)return [];
    const columns=[4,6,8].includes(density)?density:6,rows=Math.max(2,Math.min(Math.floor(64/columns),Math.round(columns*H/W)));
    const center=project(this.center.lat,this.center.lon,this.zoom),points=[];
    for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){
      const pixelX=(x+.5)*W/columns,pixelY=(y+.5)*H/rows;
      points.push({...unproject(center.x+pixelX-W/2,center.y+pixelY-H/2,this.zoom),key:`view-${x}-${y}`});
    }
    return points;
  }
  setData(data){this.data={...this.data,...data};this.drawOverlay();}
  draw(){if(this.frame)return;this.frame=requestAnimationFrame(()=>{this.frame=null;this.drawTiles();this.drawOverlay();});}
  drawTiles(){
    if(!this.config)return;const W=this.el.clientWidth,H=this.el.clientHeight;if(!W||!H)return;
    const c=project(this.center.lat,this.center.lon,this.zoom),left=c.x-W/2,top=c.y-H/2,n=2**this.zoom,used=new Set();
    for(let y=Math.floor(top/256);y<=Math.floor((top+H)/256);y++)for(let x=Math.floor(left/256);x<=Math.floor((left+W)/256);x++){
      if(y<0||y>=n)continue;const k=`${this.zoom}/${x}/${y}`;used.add(k);let img=this.tiles.get(k);
      if(!img){img=new Image();img.alt='';img.draggable=false;img.decoding='async';img.width=256;img.height=256;img.onload=()=>{this.tileLoaded++;this.el.querySelector('.tile-warning').hidden=true;};img.onerror=()=>{this.tileErrors++;if(!this.tileLoaded)this.el.querySelector('.tile-warning').hidden=false;};img.src=this.config.tileUrl.replace('{z}',String(this.zoom)).replace('{x}',String(((x%n)+n)%n)).replace('{y}',String(y));this.tiles.set(k,img);this.tileLayer.append(img);}
      img.style.transform=`translate(${Math.round(x*256-left)}px,${Math.round(y*256-top)}px)`;
    }
    for(const [k,img]of this.tiles)if(!used.has(k)){img.remove();this.tiles.delete(k);}
    const metres=40075016*Math.cos(this.center.lat*Math.PI/180)/(256*n),km=metres*80/1000;this.el.querySelector('.map-scale').textContent=`≈ ${km<1?Math.round(km*1000)+' m':km.toFixed(km<10?1:0)+' km'}`;
  }
  drawOverlay(){
    const d=this.data,W=this.el.clientWidth,H=this.el.clientHeight;if(!W||!H)return;this.points.replaceChildren();this.lines.setAttribute('viewBox',`0 0 ${W} ${H}`);this.lines.innerHTML='';
    const add=(p,html,cls,title,onClick)=>{
      const xy=this.screen(p.lat,p.lon);if(xy.x<-80||xy.y<-80||xy.x>W+80||xy.y>H+80)return;
      const el=document.createElement(onClick?'button':'div');el.className=`map-marker ${cls}`;el.style.left=xy.x+'px';el.style.top=xy.y+'px';el.innerHTML=html;el.title=title;if(onClick){el.type='button';el.setAttribute('aria-label',title);el.onclick=onClick;}this.points.append(el);return xy;
    };
    if(d.location)add(d.location,'<span></span>','user-location','Search centre');
    if(d.showWind)for(const w of d.wind||[]){const h=atHour(w.forecast,d.epoch);if(!h||h.wind===null)continue;add(w,`${windArrow(h.direction,30)}<span>${windUnit(h.wind,d.unit)}</span>`,'wind-grid',`Sampled 10 m forecast wind FROM ${bearingName(h.direction)} ${windUnit(h.wind,d.unit)} ${d.unit}`);}
    if(d.showStations)for(const s of d.stations||[])add(s,`${icon('wind')}<b>${windUnit(s.wind,d.unit)}</b>`,`station-marker ${s.fresh?'fresh':'old'}`,`${s.name}: observed ${windUnit(s.wind,d.unit)} ${d.unit}; ${s.fresh?'recent report':'stale or unknown timestamp'}`,()=>this.onStation?.(s));
    for(const site of d.sites||[]){const a=d.assessments?.get(site.id)||{status:'unknown',label:'Not assessed'},h=atHour(d.forecasts?.get(site.id),d.epoch);const selected=d.selected===site.id;
      const speed=windUnit(h?.wind,'km/h'),gust=windUnit(h?.gust,'km/h');
      const limit=Math.min(d.limits?.maxWind??25,finite(site.limits?.maxWind)??Infinity),windState=finite(h?.wind)===null?'unknown':h.wind>limit?'outside':h.wind>=limit*.8?'caution':'match';
      add(site,`${rose(site.sectors,h?.direction,a.status,selected?70:53)}<span class="site-speed ${windState}">${speed}<small> km/h</small></span>${selected?`<span class="marker-label">${esc(site.name)}</span>`:''}`,`site-marker ${selected?'selected':''}`,`${site.name}: ${speed} km/h forecast mean wind, gust ${gust} km/h. ${a.label}. Open site briefing.`,()=>this.onSite?.(site.id));
    }
    const selectedSite=d.sites?.find(s=>s.id===d.selected);
    for(const l of d.landings||[]){const b=this.screen(l.lat,l.lon);add(l,`${icon('flag')}<span>${esc(l.name)}</span>`,'landing-marker',`${l.name}. Associated landing, not a verified flight route.`,()=>this.onLanding?.(l));
      if(selectedSite){const a=this.screen(selectedSite.lat,selectedSite.lon);const line=document.createElementNS('http://www.w3.org/2000/svg','line');for(const [k,v]of Object.entries({x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:'#406f91','stroke-width':2,'stroke-dasharray':'5 7'}))line.setAttribute(k,v);this.lines.append(line);}
    }
  }
  destroy(){this.observer.disconnect();}
}
