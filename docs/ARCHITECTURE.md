# Architecture and contracts

## Runtime

Browser native modules → same-origin Node API → provider-specific adapters →
bounded HTTP client and server cache → configured third-party sources.

Only map tiles are fetched directly by the browser, with visible attribution.
There is no external JavaScript CDN, framework build, service worker or database
service. Node's standard library serves only `public/`; `.env` and backend source
are not publicly served. Persistent provider cache lives in `data/cache/`.

The map implements Web Mercator XYZ positioning, visible-tile loading, pointer
panning, wheel/double-click/pinch zoom, keyboard movement, a scale, site wind roses,
linked landing markers and sampled wind/station overlays. Longitude wraps at the
dateline. Map latitude is limited by Web Mercator; geographic search still validates
the full -90…90 latitude range. Search radius 5–200 km; configurable max 60 sites.

## API

GET `/api/health`: lightweight process health and version; public even with Basic Auth.
GET `/api/config`: non-secret provider/model/UI settings.
GET `/api/status`: recent provider request outcomes (in-memory process state).
GET `/api/geocode?q=...`: place search, 2–100 characters.
GET `/api/sites?lat=...&lon=...&radius=50&includeOsm=false`: source-backed takeoffs,
  explicitly related landings, source states/warnings and site-cap information.
GET `/api/forecast?lat=...&lon=...&model=best_match`: one location, seven days.
POST `/api/forecasts`: JSON `{ "points": [{"key":"id", "lat":0, "lon":0}],
  "model":"best_match" }`; 1–16 locations, response order/key retained.
GET `/api/profile?lat=...&lon=...`: GFS pressure-level forecast.
GET `/api/stations?lat=...&lon=...&radius=50`: regional FFVL observations.
POST `/api/wind`: JSON `{ "points": [{"key":"view-0-0", "lat":0, "lon":0}],
  "model":"best_match" }`; 1–64 points. The browser samples a grid in the
  visible map viewport with 4, 6 (default), or 8 columns and aspect-based rows.
  Zoom and pan generate new coordinates while screen spacing remains steady.

Errors use JSON `{ "error": "description" }` with an HTTP error status. Batched
forecast failures can appear as per-result `forecast.error`, preserving usable
locations instead of replacing missing data. Callers must check both HTTP and
per-result state. Coordinates zero and negative hemispheres are valid.

## Forecast object

`requested`, `gridPoint`, `elevationM`, `timezone`, `provider`, `model`, `sourceUrl`,
`runTime: null`, `fetchedAt` in milliseconds, `stale`, `cached`, optional `warning`,
`hours`, `missingFields`, and `units`.

Each `hours[]` item has a UTC epoch-seconds `time`. Normalized scalar values are
numbers or null. `wind`, `gust`: km/h. `direction`: meteorological degrees FROM.
`rain`: mm. `boundaryLayer`: m AGL over model terrain. `solar`: W/m². `cape`: J/kg.
`temperature`/`dewpoint`: Celsius. `pressure`: hPa. Pressure-profile `levels[]`
contain pressure hPa, temperature/dewpoint C, wind km/h, direction degrees and
geopotential height m AMSL. Missing values never become zero via coercion.

Profile levels at/below unavailable/model ground are masked by `profileAt`.
Source takeoff elevation has an unverified datum and does not replace model terrain.
No pressure level is relabelled as a fixed above-ground height. The sounding chart
keeps height linear in metres AMSL and tilts the temperature axis by 9.8°C/km, so
a dry-adiabatic cooling path appears vertical. It is a simplified
temperature–height plot, not a full thermodynamic Skew-T diagram. The display
is capped at 4,000 m AMSL and uses a taller plotting area; a curve reaching that edge
is interpolated only across adjacent GFS levels at most 1,500 m apart. The
pressure-level table omits higher levels.

Day view uses a fixed 500 m AMSL display grid capped at 4,000 m. `windAtHeight` interpolates GFS
wind vectors between adjacent usable pressure levels only when their height gap is
at most 1,500 m; it never extrapolates beyond them or below model terrain. The
thermal background combines surface-model solar input and boundary-layer depth,
converted from model AGL to AMSL using surface-model terrain. It indicates
heating within a modeled mixing layer, not thermal climb rate or a safety result.
Hourly launch symbols come from the full `assess` screen and are separate from raw
wind strength colours. Cloud, rain, CAPE and other surface fields appear for the
selected hour outside the altitude grid.

## Rule engine

`public/shared/core.mjs` is shared by browser/tests and some backend normalizers.
`assess(site, forecast, epoch, limits)` reports structured state/reasons and caveats.
Known closure/adverse criteria take priority. Critical missing/stale/inapplicable
forecast data => unknown. Direction outside recorded sectors => outside (unless
a weak-wind case makes direction indeterminate). Possible sectors, weak winds,
high CAPE/low visibility and missing landing association can cause caution.
A favourable match is only surface-weather compatibility with screening settings.

Default screening values: mean wind 25 km/h, gust 35 km/h, gust-minus-mean spread
15 km/h, precipitation 0.1 mm/h, CAPE caution 500 J/kg. **These are unvalidated
software defaults**, conspicuously identified as such, not general paragliding
limits or a site/pilot capability recommendation. Local custom record limits can
be supplied when verified; personal limits cannot override a known closure.

Missing landing weather, airspace and current permission checks are not completed
by the colour. All green states retain this caveat. The rule engine is not a
meteorological terrain-flow model, storm-clearance tool or flight safety system.

## Server traffic and cache

Outbound concurrency 4, per-response size limits, bounded timeout, short cooldown
following selected upstream errors, configurable HTTP request budget. Site catalogues
can use a labelled stale fallback; forecasts older than the fresh TTL can only be
served as explicit stale data on failure. Weather stale fallback expires after
24 hours. Freshness of a sensor reading is determined independently by its report time.
Cache file count and memory entries are bounded. Coalescing avoids duplicate concurrent
requests for the same cache load. Different nearby points are not assumed identical.

Canonical same-host HTTPS redirects and known PGEarth host aliases are allowed;
arbitrary cross-domain redirects are rejected. Upstream URLs are operator settings,
never browser-supplied proxy targets. Plain HTTP is reserved for explicitly enabled
loopback fixture tests. Secrets stay server-side and are not printed in diagnostics.

## Custom verified site records

Create `data/sites.geojson` using the shape below, replacing all illustrative
values with sourced real records. This illustrative record is **not included as
production data**. Do not claim landings or wind sectors without evidence.

```json
{
  "type": "FeatureCollection",
  "features": [{
    "type": "Feature",
    "id": "my-club-launch-1",
    "geometry": {"type":"Point", "coordinates":[6.2,45.9]},
    "properties": {
      "name":"Replace with verified launch name",
      "elevationM":1200,
      "usableDirections":"SE;S",
      "description":"Source-backed launch information",
      "access":"Source-backed access instructions",
      "rules":"Current local restrictions, with a source",
      "sourceUrl":"https://example.org/official-site-guide",
      "verifiedAt":"2026-09-13",
      "closed":false,
      "landings":[{
        "id":"my-club:landing-1", "name":"Verified associated landing",
        "lat":45.88, "lon":6.18, "elevationM":500,
        "description":"Verified relationship and landing instructions",
        "sourceUrl":"https://example.org/official-site-guide"
      }]
    }
  }]
}
```

Alternatively use `windSectors` with `{start,end,rating}` entries (degrees clockwise
from north, wrap supported, ratings 1 possible / 2 preferred). `usableDirections`
uses explicit compass names. Unknown direction stays null. The parser contract is
in `parseCustom` in `server/providers/sites.mjs`; tests cover the accepted fields.
A `closed: true` record forces closed status. Do not treat a record's `closed:false`
as an authoritative real-time opening confirmation. Keep origin/verification metadata.

## Extensions

Add source-specific adapters without contaminating normalized units/time/provenance.
A real thermal feed should expose a distinct provider/model/run and explicit physical
quantity; do not overwrite boundary-layer depth with climb rate. A global station
network needs report timezone, elevation and freshness semantics. A restriction
feed needs jurisdiction, geometry, valid time and verification state. Test each
new schema with provenance-preserving fixtures before enabling it in production.
