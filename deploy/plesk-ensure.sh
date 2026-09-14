#!/bin/sh
set -eu

app=/var/www/vhosts/goldengeek.org/flywindow-app
health=http://127.0.0.1:38321/api/health
cd "$app"

exec 9>"$app/run.lock"
flock -n 9 || exit 0
if curl -fsS --max-time 5 "$health" >/dev/null; then
    exit 0
fi

nohup /opt/plesk/node/22/bin/node "$app/server/index.mjs" >>"$app/logs/app.log" 2>&1 </dev/null 9>&- &
echo $! >"$app/run.pid"
sleep 2
curl -fsS --max-time 5 "$health" >/dev/null
