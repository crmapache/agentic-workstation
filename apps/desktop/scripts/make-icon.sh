#!/usr/bin/env bash
#
# Собирает иконку приложения из svg-исходника в packaging/ (как в Shotter и callmate):
#   icon.svg -> icon.icns (мак; из него же electron-builder рисует .ico для Windows) и icon.png (1024).
#
# Каждый размер рендерится из вектора, а не уменьшается из большого растра: тонкие штрихи после
# пересэмплирования мылятся. Результат коммитим: генерация разовая, и на сборочной машине librsvg
# быть не обязано. Поправил svg - перезапусти скрипт.
#
#   bash apps/desktop/scripts/make-icon.sh     (нужен rsvg-convert: brew install librsvg)
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGING="$ROOT/packaging"
ICONSET="$(mktemp -d)/icon.iconset"

if ! command -v rsvg-convert > /dev/null; then
  echo "нужен rsvg-convert: brew install librsvg" >&2
  exit 1
fi

render() {
  rsvg-convert -w "$2" -h "$2" "$1" -o "$3"
}

mkdir -p "$ICONSET"
for size in 16 32 128 256 512; do
  render "$PACKAGING/icon.svg" "$size" "$ICONSET/icon_${size}x${size}.png"
  render "$PACKAGING/icon.svg" "$((size * 2))" "$ICONSET/icon_${size}x${size}@2x.png"
done
iconutil -c icns "$ICONSET" -o "$PACKAGING/icon.icns"
render "$PACKAGING/icon.svg" 1024 "$PACKAGING/icon.png"
rm -rf "$(dirname "$ICONSET")"

echo "собрано: packaging/icon.icns, packaging/icon.png"
