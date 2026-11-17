#!/usr/bin/env bash
# Выкладка сайта из этого рабочего дерева на https://agentic-workstation.mzpizote.com (ADR 0068).
#
#   bash apps/site/scripts/site-deploy.sh
#   pnpm --filter @agentic-workstation/site deploy
#
# Статику собирает Vite здесь же, на Mac: она не зависит от процессора, а сборщик на сервере
# тянул бы за собой весь workspace. На сервер едут dist, Dockerfile и nginx.conf, образ с nginx
# собирается там, кладётся в локальный реестр, Coolify перекатывает контейнер. Скрипт ждёт,
# пока снаружи не начнёт отвечать именно эта сборка (отпечаток в /version.txt).
#
# Спрашивать перед выкладкой не нужно: у сайта нет ни соединений, ни данных, которые рвутся.
# На том же сервере живут чужие сайты и релеи - их задеть нельзя: своя папка, своё имя образа,
# а до сборки - проверка, что приложение Coolify по APP_UUID отвечает на нашем домене и тянет
# наш образ.
set -euo pipefail

DOMAIN=agentic-workstation.mzpizote.com
SERVER=root@40.160.85.25
# Приложение Coolify `aw-site` в проекте `aw-site` (создано 2026-11-16).
APP_UUID=tv8pqhcgokux8jhhs4sl4e5f
REMOTE_DIR=/root/apps/aw-site
IMAGE=127.0.0.1:5000/aw-site:local
COOL_DIR="$HOME/Documents/railway-migration/scripts"
SITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> проверяю, что $APP_UUID - наш сайт"
python3 - "$COOL_DIR" "$APP_UUID" "https://$DOMAIN" "${IMAGE%:*}" <<'PY'
import sys
sys.path.insert(0, sys.argv[1])
from cool import call

uuid, url, image = sys.argv[2], sys.argv[3], sys.argv[4]
app = call('GET', f'/applications/{uuid}') or {}
domains = [d.strip().rstrip('/') for d in str(app.get('fqdn') or '').split(',') if d.strip()]
pulls = str(app.get('docker_registry_image_name') or '')

if url not in domains or pulls != image:
    print(f'отказ: приложение {uuid} отвечает на {domains or "ничём"} и тянет {pulls or "ничего"},', file=sys.stderr)
    print(f'а этот скрипт выкладывает {image} на {url}.', file=sys.stderr)
    sys.exit(1)
PY

# Отпечаток сборки: коммит, время и пометка о незакоммиченных правках - по нему проверка в
# конце узнаёт новый контейнер, а не старый, который ещё отвечает.
DIRTY=$(git -C "$SITE_DIR" status --porcelain -- . | grep -q . && echo "-dirty" || true)
BUILD_ID="$(git -C "$SITE_DIR" rev-parse --short HEAD)$DIRTY-$(date -u +%Y%m%d%H%M%S)"

echo "==> собираю страницу ($BUILD_ID)"
pnpm --silent --dir "$SITE_DIR" build >/dev/null
printf '%s' "$BUILD_ID" >"$SITE_DIR/dist/version.txt"

echo "==> собираю образ на сервере"
# COPYFILE_DISABLE и --no-xattrs - без «._имя» macOS рядом с каждым файлом: nginx раздавал бы их.
ARCHIVE="$(mktemp -t aw-site).tgz"
COPYFILE_DISABLE=1 tar --no-mac-metadata --no-xattrs -czf "$ARCHIVE" -C "$SITE_DIR" Dockerfile nginx.conf dist
scp -q "$ARCHIVE" "$SERVER:/root/apps/aw-site.tgz"
rm -f "$ARCHIVE"
# Папка очищается перед распаковкой: файл, ушедший из сборки, иначе остался бы в образе.
ssh "$SERVER" "rm -rf $REMOTE_DIR && mkdir -p $REMOTE_DIR && cd $REMOTE_DIR && \
  tar xzf ../aw-site.tgz && rm -f ../aw-site.tgz && \
  docker build -q -t $IMAGE . && docker push -q $IMAGE" >/dev/null

echo "==> выкладываю"
python3 "$COOL_DIR/cool.py" POST "/deploy?uuid=$APP_UUID&force=true" >/dev/null
# Пока Coolify меняет контейнер, старый и новый работают вместе и Traefik раскидывает запросы
# между ними. Поэтому одного совпавшего отпечатка мало: ждём, пока старый погаснет.
for _ in $(seq 60); do
  RUNNING=$(ssh "$SERVER" "docker ps -q --filter name=$APP_UUID | wc -l" | tr -d ' ')
  if [ "$RUNNING" = 1 ] && [ "$(curl -fsS -m 10 "https://$DOMAIN/version.txt" 2>/dev/null)" = "$BUILD_ID" ]; then
    echo "==> готово: https://$DOMAIN отвечает сборкой $BUILD_ID"
    exit 0
  fi
  sleep 3
done

echo "за три минуты https://$DOMAIN так и не ответил сборкой $BUILD_ID; журнал выкладки:" >&2
echo "  python3 $COOL_DIR/deploylog.py aw-site 30" >&2
exit 1
