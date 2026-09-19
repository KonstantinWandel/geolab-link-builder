#!/usr/bin/env bash
# Dieses Repo ist die Veröffentlichung, gearbeitet wird im GeoLAB-Seitenbaum. Das hier holt
# den aktuellen Stand herüber, damit die beiden nicht auseinanderlaufen.
#
#   bash sync_from_site.sh && git diff --stat
set -euo pipefail
cd "$(dirname "$0")"
SRC=${GEOLAB_SITE_REPO:-$HOME/kwandel/geolab_regiohub}
test -d "$SRC/tools/link-builder" || { echo "Seitenbaum nicht gefunden: $SRC" >&2; exit 1; }
cp "$SRC/tools/link-builder"/{index.html,app.css,app.js,knowledge.js,catalogue.json,README.md} .
# verdict.js liegt auf der Seite im Schwesterordner des Merkmalsregisters, hier gibt es keinen.
# Ohne diese Kopie lädt die eigenständige Fassung ein Skript, das es nicht gibt, und der
# Vergleich zweier Fassungen desselben Maßes stürbe beim ersten Aufruf.
cp "$SRC/tools/measure-register/verdict.js" .
sed -i 's#"\.\./measure-register/verdict\.js"#"verdict.js"#' index.html
cp "$SRC/tools/link-builder/docs/canvas.png" docs/
cp "$SRC/scripts/build_linkbuilder_catalogue.py" scripts/
echo "übernommen aus $SRC"
