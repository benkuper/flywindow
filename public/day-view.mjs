import {assess,atHour,bearingName,dateKey,degrees,finite,profileAt,timeLabel,windAtHeight,windUnit} from './shared/core.mjs';
import {esc,number} from './ui.mjs';

const windBand=speed=>speed<3?'calm':speed<12?'light':speed<22?'moderate':speed<35?'fresh':'strong';
const screenSymbol={match:'✓',caution:'!',outside:'×',closed:'×',unknown:'?'};
const hourText=(epoch,zone)=>timeLabel(epoch,zone).slice(0,2);
const round500=value=>Math.ceil(value/500)*500;

function windGlyph(speed,direction,unit){
  if(finite(speed)===null)return '<span class="wg-missing">—</span>';
  const band=windBand(speed),label=windUnit(speed,unit);
  if(finite(direction)===null||speed<2)return `<span class="wg-wind ${band}"><span class="wg-calm">•</span><strong>${label}</strong></span>`;
  return `<span class="wg-wind ${band}"><svg viewBox="0 0 24 24" aria-hidden="true" style="transform:rotate(${degrees(direction+180)}deg)"><path d="M12 21V4m0 0-5 7m5-7 5 7" fill="none" stroke="currentColor" stroke-width="var(--arrow-width)" stroke-linecap="round" stroke-linejoin="round"/></svg><strong>${label}</strong></span>`;
}

function heatLevel(hour,altitude,terrain){
  const solar=finite(hour?.solar),depth=finite(hour?.boundaryLayer);
  if(hour?.isDay!==1||solar===null||depth===null||terrain===null||solar<100||depth<=0||altitude<terrain||altitude>terrain+depth)return 0;
  const energy=Math.min(1,(solar-100)/750),heightFraction=(altitude-terrain)/depth;
  return Math.round((.22+.8*energy)*(.98-.22*heightFraction)*100)/100;
}

function matrix(hours,rows,profile,forecast,site,selected,zone,unit,limits,variant,terrain){
  const localHours=hours.map(hour=>({hour,levels:profileAt(profile,hour.time),screen:assess(site,forecast,hour.time,limits)}));
  const meanCap=Math.min(limits.maxWind,finite(site.limits?.maxWind)??Infinity),gustCap=Math.min(limits.maxGust,finite(site.limits?.maxGust)??Infinity);
  const times=`<div class="wg-row wg-times"><div class="wg-label"><strong>m AMSL</strong><small>${hours.length} hourly slots</small></div>${localHours.map(({hour})=>`<button class="wg-time ${hour.time===selected?'selected':''}" data-action="time" data-time="${hour.time}" title="Select ${esc(timeLabel(hour.time,zone,true))}" aria-label="Select ${esc(timeLabel(hour.time,zone,true))}">${hourText(hour.time,zone)}</button>`).join('')}</div>`;
  const aloft=rows.map(altitude=>`<div class="wg-row wg-alt-row"><div class="wg-label"><strong>${number(altitude)}</strong></div>${localHours.map(({hour,levels})=>{
    const wind=windAtHeight(levels,altitude),heat=heatLevel(hour,altitude,terrain);
    const explanation=wind?`GFS ${number(altitude)} m AMSL: ${number(wind.wind)} km/h from ${bearingName(wind.direction)}${wind.interpolated?` (interpolated between ${wind.between.join(' and ')} hPa)`:''}`:'No usable GFS wind level at this altitude and hour';
    return `<div class="wg-cell ${hour.time===selected?'selected':''} ${heat?'heated':''}" data-altitude="${altitude}" data-heat="${heat}" style="--heat:${heat}" title="${esc(explanation)}">${windGlyph(wind?.wind,wind?.direction,unit)}</div>`;
  }).join('')}</div>`).join('');
  const surface=`<div class="wg-row wg-surface"><div class="wg-label" title="Mean / gust screening caps; the hour symbol includes other site filters"><strong>Launch</strong><small>≤${windUnit(meanCap,unit)} / ≤${windUnit(gustCap,unit)}<br>${esc(unit)}</small></div>${localHours.map(({hour,screen})=>`<button class="wg-surface-cell ${screen.status} ${hour.time===selected?'selected':''}" data-action="time" data-time="${hour.time}" title="${esc(timeLabel(hour.time,zone,true))}: ${esc(screen.label)}. ${esc(screen.reasons.join(' '))}" aria-label="${esc(timeLabel(hour.time,zone,true))}: ${esc(screen.label)}; mean wind ${windUnit(hour.wind,unit)} ${esc(unit)}, gust ${windUnit(hour.gust,unit)} ${esc(unit)}"><span class="wg-screen-mark">${screenSymbol[screen.status]}</span>${windGlyph(hour.wind,hour.direction,unit)}</button>`).join('')}</div>`;
  return `<div class="windgram ${variant}" style="--hour-count:${hours.length}">${times}${aloft}${surface}</div>`;
}

function surfaceDetails(hour,screen,zone,unit){
  if(!hour)return '';
  const item=(label,value,unitText='')=>`<div class="wg-extra-item"><small>${label}</small><strong>${value}${unitText?` <span>${unitText}</span>`:''}</strong></div>`;
  return `<section class="wg-extra" aria-label="Selected hour surface forecast"><div class="wg-extra-head"><strong>${esc(timeLabel(hour.time,zone,true))} · Surface forecast</strong><span class="wg-screen-summary ${screen.status}">${screenSymbol[screen.status]} ${esc(screen.label)}</span></div><div class="wg-extra-grid">${item('Mean / gust',`${windUnit(hour.wind,unit)} / ${windUnit(hour.gust,unit)}`,esc(unit))}${item('Solar',number(hour.solar),'W/m²')}${item('Mixing depth',number(hour.boundaryLayer),'m AGL')}${item('Cloud',number(hour.cloud),'%')}${item('Rain',number(hour.rain,1),'mm/h')}${item('CAPE',number(hour.cape),'J/kg')}</div><p>${esc(screen.reasons.join(' '))}</p></section>`;
}

export function renderDayView({site,forecast,profile,day,epoch,zone,unit,limits,topAltitude=4000,profileLoading=false}){
  const hours=(forecast?.hours??[]).filter(h=>dateKey(h.time,zone)===day).sort((a,b)=>a.time-b.time);
  if(!hours.length)return '<p class="muted">No hourly forecast available for this day.</p>';
  const modelGround=finite(profile?.elevationM)??finite(forecast?.elevationM)??finite(site.elevationM)??0;
  const surfaceTerrain=finite(forecast?.elevationM);
  const top=Math.min(4000,Math.max(topAltitude,round500(modelGround+500))),bottom=round500(modelGround);
  const rows=[];for(let altitude=top;altitude>=bottom;altitude-=500)rows.push(altitude);
  const altitudeOptions=[];for(let altitude=2000;altitude<=4000;altitude+=500)altitudeOptions.push(altitude);
  const chosen=atHour(forecast,epoch)??hours[0],screen=assess(site,forecast,chosen.time,limits);
  const profileNotice=profile?.error?`<p class="warning-text">Wind aloft unavailable: ${esc(profile.error)} <button class="text-button" data-action="retry-profile">Retry</button></p>`:!profile?`<p class="loading-text">${profileLoading?'<span class="spinner"></span> Loading':'Load'} GFS wind aloft. ${profileLoading?'':'<button class="text-button" data-action="retry-profile">Load profile</button>'}</p>`:'';
  const groups12=[hours.slice(0,12),hours.slice(12,24),hours.slice(24)].filter(x=>x.length);
  const groups6=[];for(let i=0;i<hours.length;i+=6)groups6.push(hours.slice(i,i+6));
  return `<section class="hourly-windgram detail-section"><div class="wg-heading"><div><h3>Wind & heating</h3><p>${esc(day||'')} · ${esc(zone)} · hourly</p></div><label>Top <select id="day-top-altitude" aria-label="Top altitude">${altitudeOptions.map(x=>`<option value="${x}" ${x===top?'selected':''}>${number(x)} m</option>`).join('')}</select></label></div><div class="wg-legend"><span class="wg-heat-key"></span><span>Heating within model mixing layer</span><span class="wg-arrow-key">➜</span><span>Arrow thickness / colour = wind strength</span><span class="wg-screen-key">✓ / ! / × / ?</span><span>Launch screen: match / caution / out / unknown</span></div>${profileNotice}${!rows.length?'<p class="warning-text">GFS model terrain is above the 4000 m display ceiling; only launch weather is shown.</p>':''}<div class="windgrams">${matrix(hours,rows,profile,forecast,site,epoch,zone,unit,limits,'full',surfaceTerrain)}${groups12.map(group=>matrix(group,rows,profile,forecast,site,epoch,zone,unit,limits,'half',surfaceTerrain)).join('')}${groups6.map(group=>matrix(group,rows,profile,forecast,site,epoch,zone,unit,limits,'quarter',surfaceTerrain)).join('')}</div><p class="wg-note">500 m display grid to 4000 m AMSL · GFS winds interpolated between pressure levels, with no extrapolation. Orange shading combines surface solar input and model mixing depth; it is not a climb-rate forecast. Launch symbols apply your full site screen, including wind, gust, direction, rain and daylight. Surface and GFS model terrain may differ.</p>${surfaceDetails(chosen,screen,zone,unit)}</section>`;
}
