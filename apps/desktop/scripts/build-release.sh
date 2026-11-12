#!/usr/bin/env bash
#
# Сборка выпуска одним заходом (скилл /build): код собирается один раз, мак и Windows
# упаковываются параллельно. Проверок кода тут нет намеренно - продуктом пользуется один
# человек, выпуск должен быть быстрым (pnpm check и update:e2e - при разработке). Остаётся одна
# проверка, мгновенная и без которой нельзя: мак подписан сертификатом проекта, а не ad-hoc -
# иначе установленные копии обновление не примут.
#
#   bash apps/desktop/scripts/build-release.sh
#
# Итог в apps/desktop/dist: agentic-workstation-mac-arm64.dmg и .zip, agentic-workstation-win-x64.exe.
set -euo pipefail

DESKTOP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOGS="$(mktemp -d)"
cd "$DESKTOP_DIR"

pnpm run build > "$LOGS/build.log" 2>&1 || { tail -30 "$LOGS/build.log"; exit 1; }

# Распакованные каталоги не убирает хук сборки (clean-unpacked.cjs): он стёр бы каталог
# соседней сборки посреди её работы. Их убирает этот скрипт в конце.
export AGENTIC_WORKSTATION_KEEP_UNPACKED=1
AGENTIC_WORKSTATION_SIGN=required pnpm exec electron-builder --mac --arm64 --publish never \
  > "$LOGS/mac.log" 2>&1 &
MAC=$!
pnpm exec electron-builder --win --x64 --publish never > "$LOGS/win.log" 2>&1 &
WIN=$!

failed=0
wait "$MAC" || { echo "мак не собрался:"; tail -30 "$LOGS/mac.log"; failed=1; }
wait "$WIN" || { echo "Windows не собрался:"; tail -30 "$LOGS/win.log"; failed=1; }

APP="dist/mac-arm64/Agentic Workstation.app"
if [ "$failed" = 0 ] && ! codesign -d -r- "$APP" 2>&1 | grep -q "certificate leaf"; then
  echo "мак подписан ad-hoc, а не сертификатом проекта: публиковать нельзя"
  failed=1
fi

rm -rf dist/mac-arm64 dist/win-unpacked "$LOGS"
[ "$failed" = 0 ] || exit 1

echo "собрано: $(node -p "require('./package.json').version")"
ls -1 dist/agentic-workstation-mac-arm64.dmg dist/agentic-workstation-mac-arm64.zip dist/agentic-workstation-win-x64.exe
