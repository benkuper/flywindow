# Verification record — 2026-09-13

## What passed

**44 Node tests passed, zero failures**, using Node 22.16.0. `npm run check`
also syntax-checks every JavaScript module. The retained report is
`tests/artifacts/backend-test.log`.

The tests cover rule precedence, missing/stale forecast behaviour, wind-direction
boundaries, units, UTC/local-time handling, date-line distances, source parsing,
explicit landing associations, hostile XML rejection, cache behaviour, actual
localhost HTTP routes, batched forecast alignment, atmospheric-profile retrieval,
FFVL normalization/freshness, input validation, null request bodies, restricted
static-file serving and response security headers.

**22 browser interaction checks passed**, at 1600×1050 desktop and 390×844 mobile
viewports, with no captured JavaScript runtime exceptions. The machine-readable
report is `tests/artifacts/ui-test-report.json`; screenshots are
`desktop-test.png` and `mobile-test.png` in the same directory. Screenshots visibly
say **TEST DATA** and use non-geographic test tiles. They are test evidence, not
screenshots of real conditions or evidence of a live public deployment.

Browser checks include automatic geolocation-to-search flow with simulated
coordinates, returned site cards, day/hour synchronization, map/list status colours,
pressure profiles and below-ground masking, explicit primary/alternative landings,
separate landing weather, map landing markers, parsed site descriptions, wind-sample
arrows, unit changes, favourites, phone map/list transitions, phone detail panels,
southern-hemisphere coordinate search and horizontal-overflow checks.

### Browser test mode used here

The authoring environment's managed Chromium policy prohibits navigation. Its
policies were not modified or bypassed. Instead, the suite used its explicit
`BROWSER_NO_NAVIGATION=1` harness: local authored HTML/CSS/JS was loaded into an
empty page, a restricted Python bridge called **only this application's localhost
HTTP API**, and browser geolocation was simulated. Map tiles were synthetic data
URLs. No external map/data requests were made by this harness.

This validates UI code, layout and interactions against real localhost backend
responses, but it is **not a normal-navigation, real-provider browser end-to-end
acceptance test**. The Node tests separately use actual HTTP. On an unrestricted
development machine, `npm run test:ui` defaults to regular browser HTTP navigation
and still uses explicitly marked local upstream fixtures and synthetic tiles.

## What did not pass / could not be verified

The actual live diagnostic was attempted with production provider URLs and a fresh
cache. External requests failed with **EAI_AGAIN / TimeoutError** in the restricted
network environment. Its unedited structured result is
`tests/artifacts/environment-live-check.json`.

This does **not** establish that providers are down, nor that their actual live
payloads match the parsers. It means live connectivity and integration compatibility
remain to be verified from the deployed host. In particular, the current FFVL JSON
feed schemas and PGEarth XML response/redirect path are not certified by fixtures.

No public server was deployed. Docker/Caddy images could not be fetched or run here.
TLS issuance, actual browser geolocation permission flow, external basemap tiles,
long-term quota behaviour and live provider output have not been operationally
validated. No accuracy claim or flight-safety validation is made for the screening
rules or default thresholds.

## Reproduce

Backend, with no package install:

```sh
npm run check
```

Optional browser tests:

```sh
python -m pip install playwright
python -m playwright install chromium
npm run test:ui
```

Use `CHROMIUM_PATH` to select an already installed Chromium binary. The suite binds
loopback ports 4319 and 4320 and shuts down its processes. Keep those ports free.
`BROWSER_NO_NAVIGATION=1` is for environments where navigation is restricted; it
must not be reported as normal browser network verification.

Real external checks, run from your host:

```sh
npm run doctor -- YOUR_LATITUDE YOUR_LONGITUDE
# Or inside the running Docker app:
docker compose exec app node scripts/doctor.mjs YOUR_LATITUDE YOUR_LONGITUDE
```

The diagnostic refuses test-mode upstream exceptions, uses a new temporary cache,
checks schema/usable values rather than just HTTP 200, returns a non-zero exit for
core failures, and writes `data/diagnostics-last.json`. Review all warnings; FFVL
is regional and the absence of nearby site records is not itself proof of failure.
The diagnostic does not confirm your browser's basemap requests or flight suitability.

## Operational acceptance checklist

Open your actual HTTPS domain on desktop and phone. Confirm geolocation or manual
search, current source-backed site names, source wind sectors, forecast valid times,
selected-hour synchronization, profile levels, explicit landing associations and
current observation timestamps. Compare several records and forecasts against the
original sources, especially after API or model changes. Test an empty-coverage
region and temporarily disabled provider: the UI must show the gap, not a positive
status based on missing data. Check browser console/server logs, access controls,
attribution, provider terms and quota usage before wider release.
