import {degrees,finite,bearingName,windUnit,timeLabel} from './shared/core.mjs';
export const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function link(raw){try{const u=new URL(raw);return ['http:','https:'].includes(u.protocol)?esc(u.href):'#';}catch{return '#';}}
export const number=(v,places=0)=>finite(v)===null?'—':Number(v).toFixed(places);
const paths={
  wing:'M3 13Q12 1 21 13M3 13q9-5 18 0M5 12l7 9 7-9M12 21v-8',
  search:'m21 21-5-5M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16',
  locate:'M12 2v4m0 12v4M2 12h4m12 0h4M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10',
  pin:'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0ZM15 10a3 3 0 1 0-6 0 3 3 0 0 0 6 0',
  wind:'M3 8h12a3 3 0 1 0-3-3M2 12h17a3 3 0 1 1-3 3M4 16h5',
  sun:'M12 2v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2M17 12a5 5 0 1 0-10 0 5 5 0 0 0 10 0',
  cloud:'M6 18h12a4 4 0 0 0 0-8 6 6 0 0 0-11-2 5 5 0 0 0-1 10Z',
  mountain:'m2 20 7-15 4 8 3-5 6 12ZM6 12l3 2 2-3',
  refresh:'M20 7a9 9 0 0 0-16 0M4 3v4h4M4 17a9 9 0 0 0 16 0m0 4v-4h-4',
  settings:'M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6m-6 0v6',
  close:'m6 6 12 12M6 18 18 6',
  star:'m12 3 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z',
  flag:'M5 22V3c5-4 9 4 15 0v10c-6 4-10-4-15 0',
  list:'M9 5h12M9 12h12M9 19h12M3 5h1m-1 7h1m-1 7h1',
  map:'m2 5 6-3 8 3 6-3v17l-6 3-8-3-6 3ZM8 2v17M16 5v17',
  info:'M12 11v6m0-10v1M22 12a10 10 0 1 0-20 0 10 10 0 0 0 20 0',
  check:'m5 12 4 4L19 6',
  arrow:'M12 20V4m-6 6 6-6 6 6',
  external:'M14 3h7v7m0-7L10 14M10 3H3v18h18v-7',
  clock:'M12 6v6l4 2M22 12a10 10 0 1 0-20 0 10 10 0 0 0 20 0',
  alert:'m12 3 10 18H2ZM12 9v5m0 3v1',
  chevron:'m9 5 7 7-7 7',
  globe:'M22 12a10 10 0 1 0-20 0 10 10 0 0 0 20 0M2 12h20M12 2c6 5 6 15 0 20-6-5-6-15 0-20',
  help:'M9 8a3 3 0 1 1 5 2c-2 1-2 2-2 4m0 3v1M22 12a10 10 0 1 0-20 0 10 10 0 0 0 20 0'
};
export const icon=(name,cls='')=>`<svg class="icon ${esc(cls)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.info}"/></svg>`;
export const COLORS={match:'#087f67',caution:'#c18112',outside:'#d85455',unknown:'#80919b',closed:'#814860'};
export function windArrow(direction,size=20){
  if(finite(direction)===null)return '<span class="missing">—</span>';
  // Meteorological direction is FROM. The arrow points in the direction the air travels.
  return `<svg class="wind-arrow" width="${size}" height="${size}" viewBox="0 0 24 24" style="transform:rotate(${degrees(direction+180)}deg)" aria-label="Wind from ${esc(bearingName(direction))}"><path d="M12 3 7 11h4v10h2V11h4Z" fill="currentColor"/></svg>`;
}
export function rose(sectors,direction=null,status='unknown',size=66){
  const xy=(a,r)=>[50+r*Math.sin(a*Math.PI/180),50-r*Math.cos(a*Math.PI/180)];
  const wedge=(s)=>{
    let start=s.start,end=s.end;if(end<=start)end+=360;if(end-start>=359.99)return `<circle cx="50" cy="50" r="34" fill="${s.rating===1?'#efcb82':'#9ad7c5'}"/>`;
    const a=xy(start,34),b=xy(end,34);return `<path d="M50 50L${a[0]} ${a[1]}A34 34 0 ${end-start>180?1:0} 1 ${b[0]} ${b[1]}Z" fill="${s.rating===1?'#efcb82':'#9ad7c5'}"/>`;
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 100 100" class="rose" aria-label="Usable wind sectors; north is up"><circle cx="50" cy="50" r="35" fill="#f3f6f3" stroke="#dbe3df"/>${(sectors||[]).map(wedge).join('')}<path d="M50 15v70M15 50h70" stroke="#bcc9c2" stroke-width="0.6"/><circle cx="50" cy="50" r="16" fill="white" stroke="${COLORS[status]||COLORS.unknown}" stroke-width="2"/>${finite(direction)!==null?`<g transform="rotate(${degrees(direction+180)} 50 50)"><path d="m50 39-5 9h3v13h4V48h3Z" fill="${COLORS[status]||COLORS.unknown}"/></g>`:'<text x="50" y="55" text-anchor="middle" fill="#71827b" font-size="14">?</text>'}<text x="50" y="10" text-anchor="middle" font-family="system-ui" fill="#62746c" font-size="10">N</text></svg>`;
}
export const badge=(status,label)=>`<span class="badge ${esc(status)}"><span class="status-dot"></span>${esc(label)}</span>`;
export const empty=(title,text,extra='')=>`<div class="empty-state">${icon('wind')}<h3>${esc(title)}</h3><p>${esc(text)}</p>${extra}</div>`;
export function lineChart(hours,keys,{zone='UTC',selected=null,height=156,unit='',labels={},colours={},convert=x=>x,scaleMax=null,bands={},referenceLines=[]}={}){
  if(!hours.length)return '<p class="muted">No hourly data.</p>';
  const W=640,H=height,left=39,right=12,top=16,bottom=30,w=W-left-right,h=H-top-bottom;
  const values=hours.flatMap(p=>keys.map(k=>finite(p[k])===null?null:convert(p[k]))).filter(v=>v!==null);
  if(!values.length)return '<p class="muted">This field is unavailable from the selected model.</p>';
  const max=scaleMax??Math.max(5,Math.ceil(Math.max(...values)/5)*5),overflow=values.some(v=>v>max);
  const x=i=>left+i*w/Math.max(1,hours.length-1),y=v=>top+h-(Math.max(0,Math.min(v,max))/max)*h;
  const colour=(key,value)=>[...(bands[key]||[])].reverse().find(b=>value>=b.min)?.color||colours[key]||'#178c77';
  let s=`<svg class="data-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Hourly ${esc(keys.map(k=>labels[k]||k).join(' and '))}, ${esc(unit)}"><text x="${left}" y="10" class="chart-unit">${esc(unit)}</text>`;
  for(let i=0;i<4;i++){const v=max*i/3,yy=y(v);s+=`<line x1="${left}" y1="${yy}" x2="${W-right}" y2="${yy}" stroke="#e7ece8"/><text x="${left-7}" y="${yy+4}" text-anchor="end" class="chart-label">${i===3&&overflow?'≥ ':''}${Math.round(v)}</text>`;}
  for(const line of referenceLines){const yy=y(line.value);s+=`<line x1="${left}" y1="${yy}" x2="${W-right}" y2="${yy}" stroke="${line.color}" stroke-width="1" stroke-dasharray="3 4"/><text x="${W-right-3}" y="${yy-3}" text-anchor="end" fill="${line.color}" class="chart-label">${esc(line.label)}</text>`;}
  for(const key of keys){let previous=null;hours.forEach((p,i)=>{const v=finite(p[key]);if(v===null){previous=null;return;}const value=convert(v),dash=key==='gust'?'stroke-dasharray="5 3"':'';if(previous)s+=`<path d="M${previous.x},${y(previous.value).toFixed(1)} L${x(i).toFixed(1)},${y(value).toFixed(1)}" fill="none" stroke="${colour(key,Math.max(previous.value,value))}" stroke-width="2.5" ${dash}/>`;else s+=`<circle cx="${x(i)}" cy="${y(value)}" r="2" fill="${colour(key,value)}"/>`;previous={x:x(i).toFixed(1),value};});}
  const sel=hours.findIndex(h=>h.time===selected);if(sel>=0)s+=`<line x1="${x(sel)}" y1="${top}" x2="${x(sel)}" y2="${H-bottom}" stroke="#1c3731" stroke-width="1" stroke-dasharray="3 4"/>`;
  hours.forEach((p,i)=>{if(i%3===0||i===hours.length-1)s+=`<text x="${x(i)}" y="${H-8}" text-anchor="middle" class="chart-label">${esc(timeLabel(p.time,zone))}</text>`;
    const interval=w/Math.max(1,hours.length-1);s+=`<rect x="${x(i)-interval/2}" y="${top}" width="${interval}" height="${h}" fill="transparent" data-action="time" data-time="${p.time}" class="chart-hit"><title>${esc(timeLabel(p.time,zone))}: ${esc(keys.map(k=>`${labels[k]||k} ${number(finite(p[k])===null?null:convert(p[k]),1)} ${unit}`).join('; '))}</title></rect>`;});
  return s+'</svg>';
}
export function soundingChart(levels,ground){
  const good=levels.filter(p=>p.height!==null&&p.height<=4000&&(p.temperature!==null||p.dewpoint!==null)).sort((a,b)=>a.height-b.height);
  const upper=levels.filter(p=>p.height>4000&&(p.temperature!==null||p.dewpoint!==null)).sort((a,b)=>a.height-b.height)[0],lower=good.at(-1);
  if(upper&&lower&&lower.height<4000&&upper.height-lower.height<=1500){const fraction=(4000-lower.height)/(upper.height-lower.height),between=key=>finite(lower[key])===null||finite(upper[key])===null?null:lower[key]+(upper[key]-lower[key])*fraction;good.push({height:4000,temperature:between('temperature'),dewpoint:between('dewpoint')});}
  if(good.length<2)return '<p class="muted">Insufficient above-ground levels for a sounding.</p>';
  const W=520,H=620,left=49,right=18,top=24,bottom=41,w=W-left-right,h=H-top-bottom;
  const minHeight=Math.max(0,finite(ground)??good[0].height),maxHeight=Math.min(4000,Math.ceil(Math.max(...good.map(p=>p.height))/500)*500);
  if(maxHeight<=minHeight)return '<p class="muted">Insufficient height range for a sounding.</p>';
  // A dry-adiabatic cooling path (~9.8°C/km) stays vertical. Height remains linear in metres.
  const skew=9.8/1000,shifted=(t,z)=>t+skew*(z-minHeight);
  const values=good.flatMap(p=>[p.temperature,p.dewpoint].filter(v=>v!==null).map(v=>shifted(v,p.height)));
  let minX=Math.floor(Math.min(...values)/10)*10-10,maxX=Math.ceil(Math.max(...values)/10)*10+10;
  if(maxX-minX<70){const extra=(70-(maxX-minX))/2;minX-=extra;maxX+=extra;}
  const x=(t,z)=>left+(shifted(t,z)-minX)/(maxX-minX)*w,y=z=>top+h-(z-minHeight)/(maxHeight-minHeight)*h;
  let s=`<svg class="sounding-chart" viewBox="0 0 ${W} ${H}" role="img" data-skew-c-per-km="9.8" data-max-altitude="${maxHeight}" aria-label="Skewed GFS temperature and dew point forecast versus linear altitude in metres above sea level, up to ${maxHeight} metres. A dry-adiabatic cooling path is vertical."><defs><clipPath id="sounding-plot-clip"><rect x="${left}" y="${top}" width="${w}" height="${h}"/></clipPath></defs><rect x="${left}" y="${top}" width="${w}" height="${h}" fill="#182b35"/><g clip-path="url(#sounding-plot-clip)">`;
  for(let z=Math.ceil(minHeight/500)*500;z<=maxHeight;z+=500)s+=`<line x1="${left}" y1="${y(z)}" x2="${W-right}" y2="${y(z)}" stroke="${z%1000===0?'#40545d':'#30444c'}" stroke-width="1"/>`;
  for(let t=Math.floor(minX/10)*10-100;t<=maxX;t+=10){s+=`<line x1="${x(t,minHeight)}" y1="${y(minHeight)}" x2="${x(t,maxHeight)}" y2="${y(maxHeight)}" stroke="#405965" stroke-width="1"/>`;if(t>=minX&&t<=maxX)s+=`<line x1="${x(t,minHeight)}" y1="${y(minHeight)}" x2="${x(t,minHeight)}" y2="${y(maxHeight)}" stroke="#30444c" stroke-width="1" stroke-dasharray="3 6"/>`;}
  for(let i=1;i<good.length;i++)if(good[i].temperature!==null&&good[i-1].temperature!==null&&good[i].temperature>good[i-1].temperature&&good[i].height<=maxHeight)s+=`<rect x="${left}" y="${y(good[i].height)}" width="${w}" height="${y(good[i-1].height)-y(good[i].height)}" fill="#b77948" opacity=".18"/>`;
  for(const [key,color]of [['temperature','#f39a78'],['dewpoint','#75bfe2']]){let d='',open=false;for(const p of good){if(p[key]===null||p.height>maxHeight){open=false;continue;}d+=`${open?'L':'M'}${x(p[key],p.height)},${y(p.height)} `;open=true;}s+=`<path class="sounding-${key}" d="${d}" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;}
  s+='</g>';
  for(let z=Math.ceil(minHeight/500)*500;z<=maxHeight;z+=500)s+=`<text x="${left-7}" y="${y(z)+4}" text-anchor="end" class="chart-label">${z}</text>`;
  for(let t=Math.ceil(minX/10)*10;t<=maxX;t+=10)s+=`<text x="${x(t,minHeight)}" y="${H-15}" text-anchor="middle" class="chart-label">${t}°</text>`;
  s+=`<line x1="${left}" y1="${H-bottom}" x2="${W-right}" y2="${H-bottom}" stroke="#819d9c"/><text x="${left}" y="14" class="chart-unit">m AMSL · model surface ${number(ground)} m</text><text x="${W-right}" y="${H-3}" text-anchor="end" class="chart-unit">°C at chart base</text>`;
  return s+'</svg>';
}
