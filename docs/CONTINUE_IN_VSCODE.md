# Continue this project in VS Code

## User's product requirements

A purely online, worldwide paragliding planning website. Nearby by default with
browser location; manual search worldwide. Map and list show forecast compatibility,
usable launch wind directions, wind through the day, thermal context, forecast
profiles, useful site information and explicitly associated landings. The user
wants real provider retrieval/aggregation, not another mockup or offline/PWA feature.

## Current implementation

Native ES modules plus Node 22.12+ standard-library HTTP server. No build step or
runtime dependencies. `npm start` starts the website. `npm run dev` watches server
edits; refresh the page for frontend changes. F5 debugs Node. Production uses actual
configured HTTP providers; tests alone use synthetic local provider fixtures.

Start with README.md and docs/TESTING.md. Run `npm run doctor -- LAT LON` from the
real host: external provider replies were not validated in the authoring sandbox.
The biggest practical acceptance task is verifying the actual live FFVL/PGEarth
payloads, access terms and the configured Open-Meteo variable combinations.

## Where to edit

- Layout/visuals: `public/index.html`, `public/styles.css`.
- App state, fetching and site panels: `public/app.mjs`.
- Geographic map interactions/layers: `public/map.mjs`.
- Charts, wind rose and safe formatting: `public/ui.mjs`.
- Forecast screening, units, time and geography: `public/shared/core.mjs`.
- HTTP routes/security: `server/index.mjs`.
- Providers: `server/providers/{sites,weather,stations,geocode}.mjs`.
- Endpoints and operator limits: `.env` / `server/config.mjs`.
- Local verified site records: `data/sites.geojson`; schema in ARCHITECTURE.md.

## Invariants to preserve

1. Shared selected UTC hour drives map, cards, charts and landing forecasts.
2. Missing data does not become a positive assessment. Keep fetched time distinct
   from forecast run time and observation report time.
3. Wind-sector wedges show where wind is FROM; arrows point downwind.
4. Landing associations must be explicit and sourced. Lines are relationships,
   not clearance, reachability calculations or proposed flight paths.
5. Current observations never masquerade as observations for a future selection.
6. No fabricated fallback numbers/sites outside explicitly marked test environments.
7. No implied safety rating or universal pilot-level wind limits. Settings are
   screening preferences, not validated launch instructions.
8. Keep provider origins, licences, altitude datum, units and uncertainty visible.
9. Global search is fundamental. Do not replace it with a fixed demo region.
10. Do not add offline caching/service workers instead of completing live integration.

## Useful next engineering work

Once provider replies pass on the actual server: validate site associations and
regional wind-sector records with authoritative site managers, add an authorised
soaring-specific thermal feed, add more authorised observation networks, and
introduce authoritative regional airspace/closure sources. These are integrations
with data contracts and licences, not cosmetic placeholder panels.

The existing custom slippy map keeps the package deployable with no build/dependency
setup. A later MapLibre/Leaflet migration is possible; preserve the same layer,
time-selection and attribution contracts and add dependency lockfiles/tests.
Do not replace the working backend with browser-side third-party calls or expose
server API keys while changing the frontend framework.

## Definition of an accepted change

Run `npm run check`; extend rule/provider tests; run the browser suite with its
local fixture server and then a real-provider smoke test where permitted. Inspect
both phone and desktop widths. Write down exact live checks, API failures and any
new external terms. Do not describe a fixture-only result as live validation.
