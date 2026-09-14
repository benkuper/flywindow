# Provider contracts and attribution

Reviewed against primary provider documentation on 2026-09-13. This is a technical
integration record, not a licence grant, access agreement or live availability
certification. API replies were not reachable from the authoring container.

## ParaglidingEarth — site catalogue

- Documentation: https://paraglidingearth.com/api/
- Default: `https://paraglidingearth.com/api/getAroundLatLngSites.php`
- GET `lat`, `lng`, `distance` in km, `limit`, `style=detailled` (provider spelling).
- XML around-point query was chosen to avoid bounding boxes crossing the dateline.
- Documented compass orientations: 0 unsuitable, 1 possible, 2 good.
- Detailed records include source text, main/alternative landings and parking when
  contributed. Sibling landing records are joined by explicit `landing_pge_site_id`.
  Geographic proximity is never an association.
- The older API page names CC BY-SA 3.0. The main site describes different database
  licensing for newer contributions. Confirm the licence of the chosen export and
  obtain any required API arrangement before redistributing at scale. Preserve each
  record's origin and attribution. Homepage: https://paraglidingearth.com/
- The API documentation labels takeoff altitude inconsistently with typical site
  usage. The UI calls it a reported source elevation with an unverified datum. It
  does not silently use that number as model ground for profile masking.

## Open-Meteo — forecast, profile and geocoding

- General API: https://open-meteo.com/en/docs
- GFS API: https://open-meteo.com/en/docs/gfs-api
- Geocoding: https://open-meteo.com/en/docs/geocoding-api
- Terms: https://open-meteo.com/en/terms
- Pricing: https://open-meteo.com/en/pricing
- Default surface: `https://api.open-meteo.com/v1/forecast`
- Default sounding: `https://api.open-meteo.com/v1/gfs`, `models=gfs_global`
- Default place search: `https://geocoding-api.open-meteo.com/v1/search`
- Requests explicitly use UNIX timestamps, auto timezone, km/h and seven days.
  A batch preserves location order. UTC epoch values are never reinterpreted as
  wall-clock strings; the returned IANA timezone controls display.
- Surface model options: best_match, gfs_global, icon_global, ecmwf_ifs025. Availability
  of boundary-layer, convective and other optional fields differs by model/region.
  Nulls remain null. Nothing called "current" is treated as a station observation.
- The pressure profile keeps a coherent GFS source rather than mixing a high-resolution
  surface forecast with an unlabelled profile from elsewhere. Geopotential heights
  are AMSL; below-model-terrain values are masked.
- Model boundary-layer height (metres AGL), shortwave radiation and CAPE do not by
  themselves establish climb rate or a usable thermal top. These are labelled as
  model diagnostics. No dedicated thermal-strength algorithm is silently substituted.
- Retrieval time is known; model run time is not supplied by this integration and
  remains null. A recently retrieved response is not proof of a newly run model.
- Free hosted access is non-commercial and quota-limited. A commercial service needs
  an appropriate subscription/endpoint. Set server-side URLs/key supplied by your
  agreement. Attribution appears beside charts and in the UI. Provider billing can
  depend on variables/locations, not just the number of HTTP calls.

## OpenStreetMap / Overpass

- Map policy: https://operations.osmfoundation.org/policies/tiles/
- Attribution/licence: https://www.openstreetmap.org/copyright
- Tagging reference: https://wiki.openstreetmap.org/wiki/Key:free_flying
- Default map: `https://tile.openstreetmap.org/{z}/{x}/{y}.png`
- Default site supplement: `https://overpass-api.de/api/interpreter`
- Visible XYZ tiles load directly in the browser, with attribution and normal
  Referer/caching. No offline tile download, scraping or speculative bulk prefetch.
  Public tiles are a best-effort service, not a production SLA; configure a suitable
  provider for a larger public deployment.
- Overpass reads takeoff/landing tags and explicit semicolon-separated compass
  orientations. It does not infer launch sectors from terrain or invent landing
  relationships. Unlinked landings are retained by the API but not presented as
  associated options in the current UI. Records from different sources can overlap;
  they are not dangerously merged by approximate distance alone.

## FFVL — regional observations

- Official API announcement: https://www.balisemeteo.com/page_news.php?idNews=1
- API/terms wiki: https://data.ffvl.fr/pmwiki/
- Configured feed candidates: `https://data.ffvl.fr/json/balises.json` and
  `https://data.ffvl.fr/json/relevesmeteo.json`.
- On 2026-09-13, both URLs returned a notice requiring an FFVL API key instead
  of JSON feed data, despite an HTTP 200 response. The GoldenGeek installation
  disables this integration until authorized feed access is configured. No live
  station observations should be inferred from an empty response.
- The official announcement confirms station/catalogue/reading access in principle.
  The exact JSON feeds and schemas have **not been verified live here**. The parser
  accepts documented-style field names, arrays and keyed objects; run `doctor` and
  update the adapter if the served schema differs. Do not claim worldwide station
  coverage or full SpotAiR aggregation from this regional adapter.
- ISO timestamps with offsets and Unix epochs are handled directly. Naive timestamps
  are time-unverified unless the operator configures a provider-confirmed IANA
  timezone. Nonexistent/ambiguous daylight-saving wall times remain unverified.
- Freshness is based on report time, not when a stale reading was downloaded.
  The app does not average observations into the model or use a distant station
  as proof of launch conditions.

## External tools, not native data feeds

Meteo-Parapente, SpotAiR, Windy and Paragliding Map are accessible as source/reference
links. Their paid or restricted content is not scraped, proxied, copied from screenshots
or silently embedded. Native integrations require separate documented APIs and rights.
Useful provider references:
- https://portal.meteo-parapente.com/legal/
- https://www.spotair.mobi/help/api.php
- https://api.windy.com/

## Privacy / operation

Forecast and site queries transmit coordinates to the configured providers. Map
requests reveal a viewed geographic area to the tile provider and use normal browser
IP/Referer information. No analytics, account database or location-history feature
is included. Server caches and your reverse-proxy logs can nevertheless contain
queried coordinates. Keep cache/diagnostic files private and publish an appropriate
privacy notice for a public installation.
