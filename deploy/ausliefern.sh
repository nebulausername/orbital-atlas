#!/usr/bin/env bash
# Builds Orbital Atlas and puts it live under https://kaufmeinewebsite.de/orbital-atlas/
#
#   bash deploy/ausliefern.sh            # tests, build, swap, nginx (first run only)
#   bash deploy/ausliefern.sh --ohne-tests
#
# Static files only: no PM2 process. The previous build stays next to the live one as
# /var/www/orbital-atlas.bak-<timestamp> for an instant rollback:
#   mv /var/www/orbital-atlas /var/www/orbital-atlas.kaputt && mv /var/www/orbital-atlas.bak-<ts> /var/www/orbital-atlas
set -euo pipefail

PROJ="$(cd "$(dirname "$0")/.." && pwd)"
ZIEL=/var/www/orbital-atlas
NEU="${ZIEL}.neu"
SITE=/etc/nginx/sites-available/kaufmeinewebsite.de
ABSCHNITT="$PROJ/deploy/nginx-abschnitt.conf"
TS="$(date -u +%Y%m%d-%H%M%S)"

cd "$PROJ"
if [[ "${1:-}" != "--ohne-tests" ]]; then
  echo "▸ Tests"
  npm test
fi

echo "▸ Bau (base /orbital-atlas/)"
rm -rf dist
ATLAS_BASE=/orbital-atlas/ npm run build > /tmp/orbital-atlas-build.log 2>&1 || { tail -40 /tmp/orbital-atlas-build.log; exit 1; }
[[ -s dist/index.html ]] || { echo "dist/index.html fehlt"; exit 1; }
grep -q '/orbital-atlas/assets/' dist/index.html || { echo "index.html verweist nicht auf /orbital-atlas/assets/"; exit 1; }
ls dist/assets/*.js >/dev/null
[[ -s dist/textures/earth_day_2k.webp && -s dist/data/bsc5.bin && -s dist/og.jpg ]] || { echo "Texturen/Daten fehlen im Bau"; exit 1; }

echo "▸ Dateien nach $NEU"
rm -rf "$NEU"
mkdir -p "$NEU"
cp -a dist/. "$NEU/"
chmod -R a+rX "$NEU"

echo "▸ Tausch"
if [[ -d "$ZIEL" ]]; then
  mv "$ZIEL" "${ZIEL}.bak-${TS}"
fi
# das Ziel existiert jetzt nicht (mv schiebt sonst IN das Verzeichnis)
[[ ! -e "$ZIEL" ]] || { echo "$ZIEL existiert noch"; exit 1; }
mv "$NEU" "$ZIEL"

# alte Sicherungen: die letzten drei behalten
{ ls -1d "${ZIEL}".bak-* 2>/dev/null || true; } | sort | head -n -3 | xargs -r rm -rf

if ! grep -q 'ORBITAL ATLAS unter /orbital-atlas' "$SITE"; then
  echo "▸ nginx-Abschnitt einbauen"
  mkdir -p /root/backups/nginx
  cp -a "$SITE" "/root/backups/nginx/kaufmeinewebsite.de.${TS}"
  python3 - "$SITE" "$ABSCHNITT" <<'PY'
import sys
site, abschnitt = sys.argv[1], sys.argv[2]
s = open(site).read()
anchor = '    # LION — Das Revier unter /lion'
i = s.index(anchor)
start = s.rfind('\n    # ====', 0, i)
if start < 0 or i - start > 400:
    start = s.rfind('\n', 0, i)
s = s[: start + 1] + open(abschnitt).read() + '\n' + s[start + 1 :]
open(site, 'w').write(s)
PY
  if nginx -t; then
    systemctl reload nginx
    echo "  nginx neu geladen (Sicherung /root/backups/nginx/kaufmeinewebsite.de.${TS})"
  else
    cp -a "/root/backups/nginx/kaufmeinewebsite.de.${TS}" "$SITE"
    echo "  nginx -t rot → Konfiguration zurückgesetzt"
    exit 1
  fi
fi

echo "✓ ausgeliefert ($TS). Prüfen in einem EIGENEN Aufruf (nicht in derselben Kette):"
echo "  node $PROJ/scripts/pruef/live.mjs"
