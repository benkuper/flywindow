"""Browser regression tests with local upstream fixtures only. Never contacts tile/data providers."""
from pathlib import Path
import base64, json, os, re, shutil, subprocess, tempfile, time, urllib.request
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'tests'/'artifacts'; OUT.mkdir(exist_ok=True)
cache=tempfile.mkdtemp(prefix='flywindow-ui-')
env=dict(os.environ,BASIC_AUTH_USER='',BASIC_AUTH_PASSWORD='',ENABLE_PGEARTH='true',ENABLE_OSM_FALLBACK='true',ENABLE_FFVL='true',PORT='4320',HOST='127.0.0.1',ALLOW_LOCAL_TEST_UPSTREAMS='true',TEST_DATA='true',CACHE_DIR=cache,
 OPEN_METEO_URL='http://127.0.0.1:4319/weather',OPEN_METEO_PROFILE_URL='http://127.0.0.1:4319/gfs',GEOCODING_URL='http://127.0.0.1:4319/geo',PGEARTH_URL='http://127.0.0.1:4319/pg',OVERPASS_URL='http://127.0.0.1:4319/overpass',FFVL_STATIONS_URL='http://127.0.0.1:4319/stations',FFVL_READINGS_URL='http://127.0.0.1:4319/observations')
procs=[];checks=[];errors=[];modes=[]
def check(name,condition):
 if not condition: raise AssertionError(name)
 checks.append(name);print('PASS',name)
def ready(url):
 for _ in range(100):
  try:
   with urllib.request.urlopen(url,timeout=1) as r:
    if r.status==200:return
  except Exception:time.sleep(.1)
 raise RuntimeError('Test server did not start: '+url)
tile='<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e7edde"/><path d="M0 50Q90 120 256 50M0 150Q150 230 256 130M80 0Q150 120 90 256" fill="none" stroke="#d4dfca" stroke-width="2"/><text x="12" y="240" font-family="sans-serif" font-size="10" fill="#a4b595">TEST TILE · NOT GEOGRAPHIC DATA</text></svg>'

def open_app(page):
 """Normal browser navigation, or local-source injection when sandbox navigation is prohibited.
 The latter does not change browser policies or make external requests. HTTP is exercised
 by a restricted Python bridge to our own already-tested localhost application.
 """
 if os.environ.get('BROWSER_NO_NAVIGATION')!='1':
  page.goto('http://127.0.0.1:4320/',wait_until='networkidle');modes.append('HTTP navigation');return
 modes.append('Local source injection; localhost HTTP bridge; simulated geolocation')
 def bridge(path, options=None):
  if not isinstance(path,str) or not path.startswith('/api/') or '..' in path:raise ValueError('Only local application API routes are permitted')
  options=options or {};body=options.get('body');request=urllib.request.Request('http://127.0.0.1:4320'+path,data=body.encode() if body else None,headers=options.get('headers',{}),method=options.get('method','GET'))
  try:
   with urllib.request.urlopen(request,timeout=60) as r:result={'status':r.status,'body':r.read().decode()}
  except urllib.error.HTTPError as e:result={'status':e.code,'body':e.read().decode()}
  if path=='/api/config':
   config=json.loads(result['body']);config['tileUrl']='data:image/svg+xml;base64,'+base64.b64encode(tile.encode()).decode();result['body']=json.dumps(config)
  return result
 page.expose_function('__localApiBridge',bridge)
 html=(ROOT/'public/index.html').read_text()
 html=re.sub(r'<script[^>]*src=[^>]*></script>','',html)
 html=re.sub(r'<link[^>]*>','',html)
 page.set_content(html)
 page.add_style_tag(content=(ROOT/'public/styles.css').read_text())
 page.add_style_tag(content=(ROOT/'public/theme.css').read_text())
 page.add_style_tag(content=(ROOT/'public/layout.css').read_text())
 page.add_style_tag(content=(ROOT/'public/day-view.css').read_text())
 page.evaluate("""() => {
  window.fetch=async (path,opts={})=>{const r=await window.__localApiBridge(String(path),{method:opts.method||'GET',headers:opts.headers||{},body:opts.body});return new Response(r.body,{status:r.status,headers:{'Content-Type':'application/json'}});};
  Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition(success){setTimeout(()=>success({coords:{latitude:45.9,longitude:6.2}}),0);}}});
 }""")
 sources=[]
 for name in ['shared/core.mjs','ui.mjs','map.mjs','day-view.mjs','app.mjs']:
  code=(ROOT/'public'/name).read_text();code=re.sub(r'^import[^\n]*\n','',code,flags=re.M);code=re.sub(r'^export ', '',code,flags=re.M);sources.append(code)
 page.evaluate('async () => {\n'+'\n'.join(sources)+'\n}')
 page.wait_for_timeout(700)

try:
 procs.append(subprocess.Popen(['node','tests/mock-upstream.mjs'],cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE))
 ready('http://127.0.0.1:4319/geo')
 procs.append(subprocess.Popen(['node','server/index.mjs'],cwd=ROOT,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE))
 ready('http://127.0.0.1:4320/api/health')
 with sync_playwright() as p:
  edge=Path('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe')
  executable=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium') or shutil.which('google-chrome') or (str(edge) if edge.exists() else None)
  browser=p.chromium.launch(headless=True,**({'executable_path':executable} if executable else {}),args=['--no-sandbox'])
  context=browser.new_context(viewport={'width':1600,'height':1050},geolocation={'latitude':45.9,'longitude':6.2},permissions=['geolocation'])
  context.route('https://tile.openstreetmap.org/**',lambda route:route.fulfill(status=200,content_type='image/svg+xml',body=tile))
  page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
  open_app(page);page.locator('.site-card').nth(4).wait_for(state='attached')
  check('geolocation defaults to nearby search',page.locator('#area-name').inner_text()=='Around you')
  check('all fixture site cards rendered',page.locator('.site-card').count()==5)
  check('test environment is visibly labelled',page.locator('#test-banner').is_visible())
  page.locator('.day-tab').nth(1).click()
  page.locator('[data-tab="hourly"]').click();page.locator('.windgram.full .wg-time').nth(12).click()
  check('hourly windgram and shared timeline synchronize','12:00' in page.locator('#selected-time').inner_text())
  page.wait_for_selector('.windgram.full .wg-alt-row')
  altitudes=[int(x.replace(',','')) for x in page.locator('.windgram.full .wg-alt-row .wg-label strong').all_text_contents()]
  check('windgram uses descending 500 m altitude cuts',len(altitudes)>3 and all(a-b==500 for a,b in zip(altitudes,altitudes[1:])))
  check('selected-hour extras sit outside altitude grid','Rain' in page.locator('.wg-extra').inner_text() and 'Rain' not in page.locator('.windgram.full').inner_text())
  check('day grid shows hourly wind arrows and launch screening',page.locator('.windgram.full .wg-time').count()>=23 and page.locator('.windgram.full .wg-alt-row .wg-wind svg').count()>0 and page.locator('.windgram.full .wg-surface-cell').count()>=23)
  check('day heating and wind-strength bands remain visible in the grid',page.locator('.windgram.full .wg-cell.heated').count()>0 and page.locator('.windgram.full .wg-wind.fresh svg').count()>0 and page.locator('.windgram.full .wg-wind.moderate svg').count()>0)
  check('launch row names the screening caps','≤25 / ≤35' in page.locator('.windgram.full .wg-surface .wg-label').inner_text())
  check('day view altitude choices stop at 4000 m',max(int(x) for x in page.locator('#day-top-altitude option').evaluate_all('(els)=>els.map(el=>el.value)'))==4000)
  page.locator('#day-top-altitude').select_option('3500')
  check('chosen altitude top changes fixed-height grid',page.locator('.windgram.full .wg-alt-row .wg-label strong').first.inner_text()=='3500')
  page.locator('#day-top-altitude').select_option('4000')
  check('day view slides beside a visible map strip',page.locator('#workspace').evaluate("el=>el.classList.contains('day-view') && parseFloat(getComputedStyle(el).transitionDuration)>0") and page.locator('.map-panel').is_visible())
  page.locator('#sidebar-toggle').click()
  page.wait_for_timeout(450)
  check('takeoff list collapses to a rail',page.locator('#sidebar-toggle').get_attribute('aria-expanded')=='false' and page.locator('.site-sidebar').evaluate('(el)=>el.clientWidth<=45'))
  page.locator('#sidebar-toggle').click()
  check('takeoff list expands again',page.locator('#sidebar-toggle').get_attribute('aria-expanded')=='true' and page.locator('.site-card').count()==5)
  page.locator('.site-card').nth(1).locator('.site-select').click()
  check('switching sites keeps day view',page.locator('.detail-tabs [data-tab="hourly"]').get_attribute('aria-pressed')=='true')
  page.locator('.windgram.full .wg-alt-row .wg-wind svg').first.wait_for()
  page.screenshot(path=str(OUT/'day-view-test.png'),full_page=True)
  page.locator('.site-card').first.locator('.site-select').click()
  check('weather matching and rejecting cards both present',page.locator('.site-card .badge.match').count()>0 and page.locator('.site-card .badge.outside').count()>0)
  page.locator('[data-tab="sounding"]').click();page.wait_for_selector('.profile-table tbody tr')
  check('pressure-level sounding retrieved and rendered',page.locator('.profile-table tbody tr').count()>=4)
  check('sounding uses dry-adiabatic tilt',page.locator('.sounding-chart').get_attribute('data-skew-c-per-km')=='9.8')
  check('sounding is taller and capped at 4000 m',page.locator('.sounding-chart').get_attribute('data-max-altitude')=='4000' and page.locator('.sounding-chart').evaluate('(el)=>el.getBoundingClientRect().height>420') and max(int(x) for x in page.locator('.profile-table tbody td:nth-child(2)').all_text_contents())<=4000)
  page.wait_for_timeout(500)
  page.screenshot(path=str(OUT/'sounding-test.png'),full_page=True)
  check('below-ground pressure levels hidden',all(int(x)>=1100 for x in page.locator('.profile-table tbody td:nth-child(2)').all_text_contents()))
  page.locator('.detail-tabs [data-tab="landings"]').click();page.wait_for_selector('.landing-detail');page.wait_for_timeout(250)
  check('explicit landings and alternatives shown',page.locator('.landing-detail').count()==2)
  check('landing weather retrieved',page.locator('.landing-detail .data-provenance').count()==2)
  check('linked landings appear on map',page.locator('.landing-marker').count()==2)
  page.locator('[data-tab="site"]').click()
  check('site guide uses actual parsed source description','SYNTHETIC TEST RECORD' in page.locator('#detail').inner_text())
  page.locator('[data-tab="overview"]').click();page.wait_for_timeout(500)
  page.locator('#wind-layer').click();page.wait_for_timeout(350)
  check('overview charts render without stray text','})' not in page.locator('.detail-body').inner_text())
  first_axis=page.locator('.data-chart').first.locator('.chart-label').all_text_contents()[:4]
  page.locator('.site-card').nth(1).locator('.site-select').click()
  second_axis=page.locator('.data-chart').first.locator('.chart-label').all_text_contents()[:4]
  check('wind chart scale stays fixed across sites',first_axis==second_axis)
  check('sampled wind map overlay rendered',page.locator('.wind-grid').count()>0)
  check('site markers show forecast km/h',page.locator('.site-marker .site-speed').count()>0 and 'km/h' in page.locator('.site-marker .site-speed').first.inner_text())
  medium_count=page.locator('.wind-grid').count();page.locator('#wind-density').select_option('8')
  page.locator('.wind-grid').nth(medium_count).wait_for(state='attached')
  check('dense wind setting adds sampled arrows',page.locator('.wind-grid').count()>medium_count)
  positions=page.locator('.wind-grid').evaluate_all('(els)=>els.map(el=>[parseFloat(el.style.left),parseFloat(el.style.top)])')
  map_size=page.locator('#map').evaluate('(el)=>[el.clientWidth,el.clientHeight]')
  check('wind samples span the viewport',max(x for x,y in positions)-min(x for x,y in positions)>map_size[0]*.7 and max(y for x,y in positions)-min(y for x,y in positions)>map_size[1]*.7)
  dense_count=page.locator('.wind-grid').count()
  first_position=page.locator('.wind-grid').first.evaluate('(el)=>[parseFloat(el.style.left),parseFloat(el.style.top)]')
  wind_requests=[];page.on('request',lambda request:wind_requests.append(request.url) if '/api/wind' in request.url else None)
  page.locator('.map-zoom button').first.click()
  page.wait_for_timeout(1200)
  new_position=page.locator('.wind-grid').first.evaluate('(el)=>[parseFloat(el.style.left),parseFloat(el.style.top)]')
  check('zoom resamples wind at steady screen density',len(wind_requests)>0 and page.locator('.wind-grid').count()==dense_count and all(abs(a-b)<1 for a,b in zip(first_position,new_position)))
  page.locator('#settings-button').click();page.locator('select[name="unit"]').select_option('m/s');page.get_by_role('button',name='Save settings',exact=True).click()
  check('wind units update across interface','m/s' in page.locator('.site-card').first.inner_text())
  check('map site labels stay in km/h', 'km/h' in page.locator('.site-marker .site-speed').first.inner_text())
  page.locator('.site-card').first.locator('.favourite').click();page.locator('#favourites-filter').click()
  check('favourites filter works',page.locator('.site-card').count()==1)
  page.locator('#favourites-filter').click()
  page.screenshot(path=str(OUT/'desktop-test.png'),full_page=True)
  check('desktop has no page overflow',page.evaluate('document.documentElement.scrollWidth<=innerWidth && document.documentElement.scrollHeight<=innerHeight'))
  page.set_viewport_size({'width':1200,'height':800});page.locator('[data-tab="hourly"]').click();page.wait_for_timeout(550)
  check('mid-size day view fits without horizontal scrolling',page.locator('.windgrams').evaluate('(el)=>el.scrollWidth<=el.clientWidth'))
  check('mid-size page stays fixed',page.evaluate('document.documentElement.scrollWidth<=innerWidth && document.documentElement.scrollHeight<=innerHeight'))
  page.screenshot(path=str(OUT/'mid-day-view-test.png'),full_page=True)
  page.set_viewport_size({'width':820,'height':800})
  check('tablet day view and page fit',page.locator('.windgrams').evaluate('(el)=>el.scrollWidth<=el.clientWidth') and page.evaluate('document.documentElement.scrollWidth<=innerWidth && document.documentElement.scrollHeight<=innerHeight'))
  # Mobile independently requests browser location and exercises map/list and full-height briefing.
  mobile=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,geolocation={'latitude':45.9,'longitude':6.2},permissions=['geolocation'])
  mobile.route('https://tile.openstreetmap.org/**',lambda route:route.fulfill(status=200,content_type='image/svg+xml',body=tile))
  mp=mobile.new_page();mp.on('pageerror',lambda e:errors.append('mobile: '+str(e)))
  open_app(mp);mp.wait_for_selector('.site-card')
  check('mobile list visible by default',mp.locator('.site-sidebar').is_visible())
  mp.screenshot(path=str(OUT/'mobile-shell-test.png'),full_page=True)
  mp.locator('#sidebar-toggle').click();check('mobile takeoff rail reveals map',mp.locator('.map-panel').is_visible() and mp.locator('#sidebar-toggle').get_attribute('aria-expanded')=='false')
  mp.locator('#sidebar-toggle').click();check('mobile takeoff rail reopens list',mp.locator('.site-card').count()==5 and mp.locator('#sidebar-toggle').get_attribute('aria-expanded')=='true')
  mp.locator('[data-view="map"]').click();check('mobile map toggle works',mp.locator('.map-panel').is_visible())
  mp.locator('.site-marker').first.click();check('mobile marker opens site briefing',mp.locator('#detail').is_visible())
  mp.locator('[data-tab="hourly"]').click();mp.wait_for_selector('.windgram.quarter .wg-alt-row')
  mp.wait_for_timeout(400)
  check('mobile day view uses readable six-hour blocks',mp.locator('.windgram.quarter:visible').count()>=4 and mp.locator('.windgrams').evaluate('(el)=>el.scrollWidth<=el.clientWidth'))
  mp.screenshot(path=str(OUT/'mobile-day-view-test.png'),full_page=True)
  mp.set_viewport_size({'width':320,'height':700})
  check('small mobile day view fits',mp.locator('.windgrams').evaluate('(el)=>el.scrollWidth<=el.clientWidth') and mp.evaluate('document.documentElement.scrollWidth<=innerWidth && document.documentElement.scrollHeight<=innerHeight'))
  mp.set_viewport_size({'width':390,'height':844})
  mp.locator('.detail-tabs [data-tab="landings"]').click();mp.wait_for_selector('.landing-detail')
  mp.screenshot(path=str(OUT/'mobile-test.png'),full_page=True)
  check('mobile has no page overflow',mp.evaluate('document.documentElement.scrollWidth<=innerWidth && document.documentElement.scrollHeight<=innerHeight'))
  mp.locator('[data-action="close-detail"]').click();check('mobile briefing closes back to map',not mp.locator('#detail').is_visible())
  mp.locator('#mobile-list').click();mp.locator('#place-search').fill('-33.9, 18.4');mp.locator('#search-form').evaluate('(el)=>el.requestSubmit()');mp.locator('#area-name').filter(has_text='-33.900').wait_for()
  check('southern-hemisphere coordinate search is accepted','-33.900' in mp.locator('#area-name').inner_text())
  check('no browser runtime exceptions',not errors)
  browser.close()
 (OUT/'ui-test-report.json').write_text(json.dumps({'passed':len(checks),'checks':checks,'errors':errors,'data':'Synthetic local fixtures; no live provider validation','modes':modes},indent=2))
 print(f'{len(checks)} browser checks passed.')
finally:
 for proc in reversed(procs):
  proc.terminate()
  try:proc.wait(timeout=4)
  except subprocess.TimeoutExpired:proc.kill()
 shutil.rmtree(cache,ignore_errors=True)
