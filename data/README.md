# Operator data

`cache/` is private server-side provider cache; do not publish or commit it.
`diagnostics-last.json` is created by `npm run doctor` and may include coordinates.
To add verified local records, copy the empty `sites.example.geojson` to
`sites.geojson` and add sourced features according to docs/ARCHITECTURE.md.
No fictional sites are loaded by the production application.
