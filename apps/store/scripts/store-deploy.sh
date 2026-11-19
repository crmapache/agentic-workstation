#!/usr/bin/env bash
# Выкладка магазина расширений из этого рабочего дерева на https://agentic-workstation-store.mzpizote.com
# (ADR 0091). По образцу apps/relay/scripts/relay-deploy.sh: образ собирается на сервере (он
# x86_64), приложение Coolify тянет его из локального реестра сервера, база - в томе /data.
#
#   apps/store/scripts/store-deploy.sh          # спросит перед выкладкой
#   apps/store/scripts/store-deploy.sh --yes    # без вопроса
#
# APP_UUID - приложение Coolify `aw-store`. Пока его нет, скрипт отказывает: приложение, том и
# домен заводятся один раз (скилл infra), uuid вписывается сюда.
set -euo pipefail

DOMAIN=agentic-workstation-store.mzpizote.com
SERVER=root@40.160.85.25
APP_UUID="${AW_STORE_APP_UUID:-}"
REMOTE_DIR=/root/apps/aw-store
IMAGE_NAME=127.0.0.1:5000/aw-store
IMAGE_TAG=local
COOL_DIR="$HOME/Documents/railway-migration/scripts"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

ASK=1
for arg in "$@"; do
  case "$arg" in
    --yes) ASK=0 ;;
    *)
      echo "незнакомый аргумент: $arg" >&2
      exit 2
      ;;
  esac
done

if [ -z "$APP_UUID" ]; then
  echo "нет приложения Coolify: заведите aw-store (том /data, домен $DOMAIN) и передайте AW_STORE_APP_UUID" >&2
  exit 1
fi

echo "==> проверяю, что $APP_UUID - наш магазин"
python3 - "$COOL_DIR" "$APP_UUID" "https://$DOMAIN" "$IMAGE_NAME" <<'PY'
import sys
sys.path.insert(0, sys.argv[1])
from cool import call

uuid, url, image = sys.argv[2], sys.argv[3], sys.argv[4]
app = call('GET', f'/applications/{uuid}') or {}
domains = [d.strip().rstrip('/') for d in str(app.get('fqdn') or '').split(',') if d.strip()]
pulls = str(app.get('docker_registry_image_name') or '')

if url not in domains or pulls != image:
    print(f'отказ: приложение {uuid} отвечает на {domains or "ничём"} и тянет {pulls or "ничего"}', file=sys.stderr)
    sys.exit(1)
PY

if [ "$ASK" = 1 ]; then
  read -r -p "Выложить магазин на $DOMAIN? [y/N] " answer
  [ "$answer" = "y" ] || exit 0
fi

BUILD_ID="$(git -C "$ROOT" rev-parse --short HEAD)-$(date +%Y%m%d%H%M%S)"
PACK="$(mktemp -d)/aw-store.tar.gz"

echo "==> пакую контекст сборки"
tar -C "$ROOT" -czf "$PACK" \
  --exclude='node_modules' --exclude='.git' --exclude='*.p12' --exclude='*.pem' --exclude='.data' \
  package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json \
  apps/store packages/store-protocol \
  apps/desktop/package.json apps/browser-extension/package.json apps/phone/package.json \
  apps/relay/package.json apps/site/package.json \
  packages/ui/package.json packages/browser-protocol/package.json packages/remote-protocol/package.json

echo "==> собираю образ на сервере ($BUILD_ID)"
ssh "$SERVER" "mkdir -p $REMOTE_DIR && rm -rf $REMOTE_DIR/ctx && mkdir -p $REMOTE_DIR/ctx"
scp -q "$PACK" "$SERVER:$REMOTE_DIR/ctx.tar.gz"
ssh "$SERVER" "cd $REMOTE_DIR/ctx && tar -xzf ../ctx.tar.gz && \
  docker build -f apps/store/Dockerfile -t $IMAGE_NAME:$IMAGE_TAG . && \
  docker push $IMAGE_NAME:$IMAGE_TAG"

echo "==> перезапускаю приложение Coolify"
python3 - "$COOL_DIR" "$APP_UUID" <<'PY'
import sys
sys.path.insert(0, sys.argv[1])
from cool import call

call('GET', f'/deploy?uuid={sys.argv[2]}&force=true')
PY

echo "==> жду https://$DOMAIN/healthz"
for _ in $(seq 1 60); do
  if curl -fsS "https://$DOMAIN/healthz" >/dev/null 2>&1; then
    echo "готово: $BUILD_ID"
    exit 0
  fi
  sleep 3
done

echo "магазин не ответил за три минуты" >&2
exit 1
