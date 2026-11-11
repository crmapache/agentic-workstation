#!/usr/bin/env bash
#
# Сквозная проверка самообновления на этой машине: без релиза, без GitHub и без
# настоящего сертификата. Гонять после любой правки в src/main/updates, в
# electron-builder.yml и в scripts/write-update-manifest.mjs.
#
#   pnpm --filter @agentic-workstation/desktop update:e2e
#
# Что делает:
#   1. Заводит временную связку ключей с одноразовым самоподписанным сертификатом.
#      Основную связку не трогает, доверия сертификату не требует - как и у людей,
#      которым приложение достаётся с чужим для их машины сертификатом.
#   2. Собирает две версии: текущую и следующую патч-версию, подписывает обе.
#   3. Поднимает локальный манифест на 127.0.0.1:5317 и запускает текущую версию в
#      отдельном профиле (AGENTIC_WORKSTATION_PROFILE_DIR), рядом с установленной IDE.
#   4. «Подделка»: в манифесте сборка с подписью ad-hoc. Ждёт отказа с причиной
#      signature и проверяет, что установленная версия не изменилась.
#   5. «Честное обновление»: в манифесте подписанная следующая версия. Ждёт, что
#      приложение подменило себя, перезапустилось и стало новой версией.
#   6. Убирает всё за собой: процессы, сервер, связку ключей, папки, версию в package.json.
#
# Порты 5316 (отладка окна) и 5317 (манифест) должны быть свободны: dev с
# AGENTIC_WORKSTATION_CDP_PORT на это время надо погасить.

set -euo pipefail

DESKTOP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WORK_DIR="$HOME/.agentic-workstation-update-e2e"
PROFILE_DIR="$WORK_DIR/profile"
KEYCHAIN="$WORK_DIR/e2e.keychain-db"
KEYCHAIN_PASSWORD="e2e"
CERT_NAME="Agentic Workstation E2E Signing"
CDP_PORT=5316
FEED_PORT=5317
APP="Agentic Workstation.app"
EXECUTABLE="Contents/MacOS/Agentic Workstation"
ZIP_NAME="agentic-workstation-mac-arm64.zip"
FEED_PID=""

cd "$DESKTOP_DIR"

BASE_VERSION=$(node -p "require('./package.json').version")
NEXT_VERSION=$(node -p "require('semver').inc('$BASE_VERSION', 'patch')")
FAKE_VERSION=$(node -p "require('semver').inc('$NEXT_VERSION', 'patch')")

step() { printf '\n== %s\n' "$*"; }
fail() {
  printf '\nПРОВАЛ: %s\n' "$*" >&2
  exit 1
}

# Версия меняется только на время сборки и возвращается при любом исходе.
set_version() {
  sed -i '' -E "1,10 s/^  \"version\": \"[^\"]+\"/  \"version\": \"$1\"/" package.json
}

stop_app() {
  pkill -f "$WORK_DIR/install/$APP/" 2>/dev/null || true
  for _ in $(seq 1 50); do
    pgrep -f "$WORK_DIR/install/$APP/" >/dev/null || return 0
    sleep 0.2
  done
}

cleanup() {
  set +e
  stop_app
  # wait - чтобы bash не печатал «Terminated» про погашенный сервер.
  [ -n "$FEED_PID" ] && kill "$FEED_PID" 2>/dev/null && wait "$FEED_PID" 2>/dev/null
  security delete-keychain "$KEYCHAIN" 2>/dev/null
  set_version "$BASE_VERSION"
  rm -rf "$WORK_DIR" "$DESKTOP_DIR/dist"
}
trap cleanup EXIT

for port in $CDP_PORT $FEED_PORT; do
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    fail "порт $port занят - погаси dev с отладкой или прошлый прогон"
  fi
done

rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR/feed"

step "Одноразовый сертификат во временной связке ключей"
cat >"$WORK_DIR/cert.cnf" <<EOF
[ req ]
distinguished_name = dn
x509_extensions = ext
prompt = no
[ dn ]
CN = $CERT_NAME
[ ext ]
basicConstraints = critical,CA:false
keyUsage = critical,digitalSignature
extendedKeyUsage = critical,codeSigning
EOF
# Системный /usr/bin/openssl (LibreSSL): его .p12 security импортирует без вопросов,
# а OpenSSL 3 из Homebrew по умолчанию шифрует ключ так, что импорт может не пройти.
/usr/bin/openssl req -x509 -newkey rsa:2048 -nodes -days 1 -config "$WORK_DIR/cert.cnf" \
  -keyout "$WORK_DIR/key.pem" -out "$WORK_DIR/cert.pem" 2>/dev/null
/usr/bin/openssl pkcs12 -export -name "$CERT_NAME" -passout pass:e2e \
  -inkey "$WORK_DIR/key.pem" -in "$WORK_DIR/cert.pem" -out "$WORK_DIR/cert.p12" 2>/dev/null
security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
security set-keychain-settings "$KEYCHAIN"
security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
security import "$WORK_DIR/cert.p12" -k "$KEYCHAIN" -P e2e -T /usr/bin/codesign >/dev/null
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KEYCHAIN_PASSWORD" \
  "$KEYCHAIN" >/dev/null 2>&1 || true
IDENTITY=$(security find-identity -p codesigning "$KEYCHAIN" | awk -v name="\"$CERT_NAME\"" '$0 ~ name { print $2; exit }')
[ -n "$IDENTITY" ] || fail "сертификат не попал во временную связку"

# Собирает версию $1 тем же путём, что и релиз (`pnpm dist` с хуком подписи
# scripts/sign-app.cjs), только сертификатом из временной связки, и кладёт бандл
# из zip в папку $2 - ровно то, что получит установленная копия.
build_signed() {
  set_version "$1"
  if ! AGENTIC_WORKSTATION_SIGN_IDENTITY="$IDENTITY" AGENTIC_WORKSTATION_SIGN_KEYCHAIN="$KEYCHAIN" \
    pnpm run dist >"$WORK_DIR/build-$1.log" 2>&1; then
    set_version "$BASE_VERSION"
    fail "сборка $1 упала, журнал: $WORK_DIR/build-$1.log"
  fi
  set_version "$BASE_VERSION"
  mkdir -p "$2"
  ditto -x -k "dist/$ZIP_NAME" "$2"
}

# Выкладывает бандл $1 в локальный манифест как версию $2.
publish() {
  rm -f "$WORK_DIR/feed/"*
  ditto -c -k --sequesterRsrc --keepParent "$1" "$WORK_DIR/feed/$ZIP_NAME"
  node scripts/write-update-manifest.mjs --zip "$WORK_DIR/feed/$ZIP_NAME" --version "$2" \
    --base-url "http://127.0.0.1:$FEED_PORT" >/dev/null
}

launch() {
  AGENTIC_WORKSTATION_PROFILE_DIR="$PROFILE_DIR" \
    AGENTIC_WORKSTATION_UPDATE_FEED="http://127.0.0.1:$FEED_PORT/latest.json" \
    "$WORK_DIR/install/$APP/$EXECUTABLE" --remote-debugging-port=$CDP_PORT \
    >>"$WORK_DIR/app.log" 2>&1 &
}

page() { AGENTIC_WORKSTATION_CDP_PORT=$CDP_PORT node scripts/cdp.mjs "$@" 2>/dev/null; }

# Состояние обновления, как его видит окно: «kind», «kind:mode» или «kind:reason».
UPDATE_STATE="window.ide.invoke('updates:getStatus').then((s) => s.kind === 'available' ? 'available:' + s.install.mode : s.kind === 'failed' ? 'failed:' + s.reason : s.kind)"

wait_for_state() {
  local state=""
  for _ in $(seq 1 "$2"); do
    state=$(page eval "$UPDATE_STATE" || true)
    [ "$state" = "\"$1\"" ] && return 0
    sleep 1
  done
  fail "ждали состояние $1, а оно $state"
}

installed_version() {
  plutil -extract CFBundleShortVersionString raw -o - "$WORK_DIR/install/$APP/Contents/Info.plist"
}

step "Сборка $BASE_VERSION и $NEXT_VERSION (несколько минут)"
build_signed "$NEXT_VERSION" "$WORK_DIR/next"
build_signed "$BASE_VERSION" "$WORK_DIR/install"

step "Локальный манифест на 127.0.0.1:$FEED_PORT"
(cd "$WORK_DIR/feed" && exec python3 -m http.server "$FEED_PORT" --bind 127.0.0.1 >/dev/null 2>&1) &
FEED_PID=$!

step "Подделка $FAKE_VERSION с подписью ad-hoc должна быть отвергнута"
ditto "$WORK_DIR/next/$APP" "$WORK_DIR/fake/$APP"
plutil -replace CFBundleShortVersionString -string "$FAKE_VERSION" "$WORK_DIR/fake/$APP/Contents/Info.plist"
codesign --force --deep --sign - "$WORK_DIR/fake/$APP" 2>/dev/null
publish "$WORK_DIR/fake/$APP" "$FAKE_VERSION"
launch
wait_for_state "available:automatic" 40
page click '[data-action="update-install"]' >/dev/null
wait_for_state "failed:signature" 90
[ "$(installed_version)" = "$BASE_VERSION" ] || fail "после отказа версия сменилась на $(installed_version)"
[ ! -e "$WORK_DIR/install/.agentic-workstation-update" ] || fail "после отказа осталась папка распаковки"
echo "отвергнута, установлена по-прежнему $BASE_VERSION"
stop_app

step "Честное обновление $BASE_VERSION -> $NEXT_VERSION"
publish "$WORK_DIR/next/$APP" "$NEXT_VERSION"
launch
wait_for_state "available:automatic" 40
page click '[data-action="update-install"]' >/dev/null

for _ in $(seq 1 120); do
  grep -q "update: installed" "$PROFILE_DIR/logs/update.log" 2>/dev/null && break
  grep -q "restoring\|giving up\|cannot" "$PROFILE_DIR/logs/update.log" 2>/dev/null &&
    fail "подмена не удалась: $(cat "$PROFILE_DIR/logs/update.log")"
  sleep 1
done
grep -q "update: installed" "$PROFILE_DIR/logs/update.log" 2>/dev/null ||
  fail "подмена не завершилась за две минуты"
[ "$(installed_version)" = "$NEXT_VERSION" ] || fail "на месте версия $(installed_version)"

for _ in $(seq 1 40); do
  pgrep -f "$WORK_DIR/install/$APP/$EXECUTABLE" >/dev/null && break
  sleep 0.5
done
pgrep -f "$WORK_DIR/install/$APP/$EXECUTABLE" >/dev/null || fail "новая версия не перезапустилась"
echo "обновилась до $NEXT_VERSION и перезапустилась"

step "Готово: оба сценария прошли"
