# Flywindow

A self-hosted **online website** for exploring nearby paragliding takeoffs,
usable wind sectors, hourly forecast compatibility, atmospheric profiles and
associated landings. Worldwide search; browser geolocation by default.

This is an actual browser frontend and Node HTTP backend with provider adapters.
It is not a static prototype, iframe collection, offline application or PWA.
Production uses the configured external APIs. It never substitutes fictional
weather or sites when a provider fails.

## Run it in VS Code

Requires **Node.js 22.12 or newer**, an internet connection and a modern browser.
No runtime packages, CDN JavaScript, database service, API-key wizard or frontend
build is required with the default public providers. Their usage terms still apply.

1. Extract the ZIP and open the `flywindow` folder in VS Code.
2. Copy `.env.example` to `.env`.
3. Run `npm start` in the integrated terminal.
4. Open **http://localhost:3000** and allow location access, or search anywhere.

macOS / Linux:

```sh
cp .env.example .env
npm start
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
npm start
```

No `npm install` is needed. `npm run dev` watches the Node server; refresh the
browser after frontend edits. Press F5 in VS Code to debug the server.

## What is implemented

| Requirement | Implementation |
|---|---|
| Worldwide, nearby by default | Browser geolocation, global place search, decimal coordinate search, draggable map and “Search this area”; no fixed home region. |
| Obvious site compatibility | Green / amber / red / grey statuses in map and list, with explicit reasons and an hourly strip. Unknown is never treated as favourable. |
| Usable wind directions | Preferred and possible compass sectors from source records on both map markers and site cards, plus forecast wind-flow arrows. |
| Wind through the day | Seven-day selector, one shared hourly timeline, fixed-scale colour-banded mean wind/gust charts, and a day table with surface and GFS wind by altitude. |
| Thermal context | Fixed-scale boundary-layer, solar-radiation and CAPE charts plus day-view indicators when supplied by the selected model; not a fabricated climb-rate product. |
| Sounding | GFS pressure-level temperature/dew-point/wind profile and table; below-model-ground levels masked. Explicitly a forecast profile, not an observed sonde or full Skew-T. |
| Map weather | Optional sparse, medium or dense viewport-based wind samples. Zooming or panning fetches new points while arrow spacing stays steady on screen. Site markers show mean wind in km/h. |
| Actual observations | FFVL adapter with station locations, recent readings, freshness and timestamp-confidence labels. Regional, not a global sensor network. |
| Linked landings | Explicit source-linked primary/alternative landings, map associations, separate landing forecasts and navigation links. Never guessed from proximity. |
| Site information | Source descriptions, recorded rules, access, parking, local-weather notes and original-source links when available. |
| Personal convenience | Favourites, radius, model and unit preferences; responsive desktop/mobile interface. No account needed. |

### First live check

The application code was tested against local fixtures and real localhost HTTP.
**External data calls could not be verified from the authoring environment because
outbound DNS/network access was unavailable.** Run the included diagnostic from
your server before relying on the integration:

```sh
npm run doctor -- 45.9 6.2
```

Replace these example coordinates with your own region. They are not the app's
default location. The command starts a temporary local instance, checks the real
configured site, forecast, profile, geocoding and station adapters, prints each
result, and writes `data/diagnostics-last.json`. No separately running app is
required. It uses a fresh temporary cache so an old cached response cannot pass
as successful live connectivity. Its output may contain your diagnostic
coordinates; do not publish that file without reviewing it.

A non-zero exit code means a core integration needs attention. FFVL availability
and no site coverage can produce warnings without invalidating a working global
forecast. Public endpoint access, schemas and availability can change. See
[troubleshooting](#troubleshooting) and [data sources](docs/DATA_SOURCES.md).

## Deploy to your server

This needs a running Node process or container, not static-only file hosting.
Serve it at the root of a hostname, for example `https://fly.example.com/`,
or behind a subdirectory proxy. Frontend assets and API calls resolve from the
application's URL, so both layouts work.

### GoldenGeek Plesk subdirectory

The live installation uses `https://www.goldengeek.org/tools/flywindow/`.
Plesk's Node 22 runs the private application at
`/var/www/vhosts/goldengeek.org/flywindow-app`, bound only to
`127.0.0.1:38321`. The public folder
`/var/www/vhosts/goldengeek.org/httpdocs/tools/flywindow` contains only the
`.htaccess` rewrite in `deploy/plesk-htaccess`, which removes the URL prefix
and proxies all requests to Node. Do not upload server code, `.env`, or cache
files into `httpdocs`.

The private app's `.env` needs `NODE_ENV=production`, `HOST=127.0.0.1`, and
`PORT=38321`. `deploy/plesk-ensure.sh` starts the process if its health check
fails; a per-minute user cron entry runs this script after crashes or reboots.
`ENABLE_FFVL=false` is set because the current public FFVL endpoints require
an API key; forecasts, sites, and place search remain enabled.
After updating the private source files, restart the process and check both
`/tools/flywindow/` and `/tools/flywindow/api/health` over HTTPS.

### Docker with your existing reverse proxy

Install Docker with the Compose plugin; copy `.env.example` to `.env`, review
provider terms, set `CONTACT_EMAIL`, and optionally set both basic-auth values.

```sh
docker compose up -d --build
docker compose logs -f app
```

The default container port is bound to **127.0.0.1:3000**, not exposed publicly.
Point your existing HTTPS reverse proxy to that address. Example Nginx and
systemd files are in `deploy/`. Health check: `/api/health`.

Run live checks inside the actual container:

```sh
docker compose exec app node scripts/doctor.mjs 45.9 6.2
```

### Docker with included Caddy HTTPS proxy

Point your domain's DNS to the server, allow incoming TCP 80/443, and ensure no
other service owns those ports. Set `DOMAIN=fly.example.com` and a real
`ACME_EMAIL` in `.env`, then:

```sh
docker compose -f compose.yml -f compose.https.yml up -d --build
docker compose -f compose.yml -f compose.https.yml logs -f
```

Visit your HTTPS domain. Caddy requests and renews its TLS certificate. An existing
proxy on the same ports should use the first deployment option instead. HTTPS
is needed for normal browser geolocation on a deployed domain; localhost is
suitable for development. Manual place search remains available when location
permission is refused.

To update, replace/edit the source and run the same command with `--build`.
To stop, run `docker compose ... down`. Do not add `-v` unless you intend to
remove persisted cache/custom data and, for the HTTPS stack, certificate data.

Docker images and Compose deployment could not be pulled/run in the authoring
environment; the Node server and browser code were tested locally. Test the
provided deployment recipe on your host and check its logs.

### Protect a private installation

Set both `BASIC_AUTH_USER` and `BASIC_AUTH_PASSWORD` and use HTTPS. The server
has input validation, body/response size bounds, limited outbound concurrency,
request limiting, an upstream request budget, server-side API keys and a CSP.
This is not a substitute for a security review before a large public launch.
Proxy clients share a conservative rate bucket; forged forwarded IP headers
are not trusted. Never commit `.env` or expose the Node port beside your proxy.

## Configuration and data

Defaults request ParaglidingEarth site records, Open-Meteo forecasts/geocoding,
OpenStreetMap tiles/Overpass fallback, and FFVL observations. Each can be changed
or disabled in `.env`. The weather API key, when used, stays on the server.
Map tile tokens are necessarily browser-visible; restrict them by origin where
supported. Third-party terms and attribution are separate from the MIT code licence.

Open-Meteo's hosted free tier is for **non-commercial** use within its limits.
A commercial/shared deployment may need a paid endpoint/key and a suitable map
provider. The server budget counts HTTP requests; provider billing may weight
multiple locations/variables differently. It is not a guarantee of quota compliance.

The server caches provider responses to reduce requests. This is **online service
caching**, not an offline app. Stale fallback responses are labelled and cannot
produce a favourable badge. Browser storage holds preferences/favourite IDs, not
an offline briefing or location history. Providers receive the queried region
or forecast coordinates; tile providers receive browser IP/Referer and tile requests.

Add locally verified records through `data/sites.geojson`; see the explicit schema
in [ARCHITECTURE.md](docs/ARCHITECTURE.md). Empty/example files are not a substitute
for the live worldwide catalogue. In Docker, put this file into `/app/data` in the
named volume, or add an explicit read-only file mount after creating the source file.

## What the assessment does — and does not — mean

The defaults are **unvalidated, adjustable screening settings**, not site limits,
instruction, or a recommendation to launch. “Weather match” means the available
surface forecast meets those filters and a recorded wind sector. It does not
validate terrain effects, airspace/NOTAMs, current permissions, landing reachability,
pilot suitability, wind aloft, storm avoidance or local conditions. Read the reasons,
source age and site guide, and make independent pre-flight and on-site checks.

No live worldwide airspace/closure feed, proprietary Meteo-Parapente thermal product,
complete SpotAiR aggregate, or Paragliding Map commercial dataset is integrated.
Their websites remain external reference links. Thermal displays are model
boundary-layer/heating diagnostics, **not predicted paraglider climb rate**, reliable
thermal-top/cloud-base heights, or permission to fly. Site/landing coverage is uneven.

## Testing and continuing development

```sh
npm run check   # syntax checks plus the backend/rule/provider/API tests
npm test
npm run doctor -- LATITUDE LONGITUDE  # live external checks
```

Optional browser suite (Python + Playwright only needed for tests, not hosting):

```sh
python -m pip install playwright
python -m playwright install chromium
npm run test:ui
```

See [TESTING.md](docs/TESTING.md) for what was actually run and the distinction
between fixture tests and live verification. [CONTINUE_IN_VSCODE.md](docs/CONTINUE_IN_VSCODE.md)
is the handoff for modifying the app; [ARCHITECTURE.md](docs/ARCHITECTURE.md) documents
the file structure, contracts and safety invariants.

## Troubleshooting

- **Grey sites / “could not be reached”:** run `npm run doctor`, check DNS/outbound
  HTTPS, provider availability, API terms, configured URL and the status panel in
  Settings. Provider failures are intentionally not replaced with fake numbers.
- **No nearby sites:** widen the radius, try another area, or enable the OSM supplement
  in Settings. Distinguish a failed source from an empty successful catalogue result.
  Unknown or incomplete wind sectors stay grey; missing landings stay explicit.
- **PGEarth endpoint redirects or changes:** check the provider documentation and
  update `PGEARTH_URL`. The client permits same-host HTTPS redirects and canonical
  PGEarth host aliases, but will not follow arbitrary cross-domain redirects.
- **Map blank:** check browser connectivity, tile URL/attribution and the tile
  provider's policy. No tile key is bundled. Visible map tiles load directly in
  the browser; the server diagnostic does not test your browser's tile permissions.
- **FFVL time unverified:** offset-free timestamps are not assumed to be UTC or Paris.
  Confirm the feed's timezone, then set `FFVL_TIMESTAMP_TIMEZONE` appropriately.
- **Cannot geolocate remotely:** use HTTPS and grant location permission; search by
  place/coordinates still works. Plain HTTP on a remote server is not equivalent
  to localhost for this browser feature.
- **429 / cooldown:** stop repeated refreshes, keep caching enabled, reduce radius/
  `MAX_SITES`, and review the actual provider quota. Do not solve quota failures by
  removing limits or rotating identities.
- **Some thermal/profile fields missing:** variable/model availability is not uniform.
  Missing values remain blank; choose another supported model or inspect the profile
  separately. A forecast run timestamp is not fabricated from retrieval time.
