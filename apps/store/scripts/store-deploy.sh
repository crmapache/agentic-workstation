#!/usr/bin/env bash
# Выкладка магазина расширений из этого рабочего дерева на
# https://agentic-workstation-store.mzpizote.com (ADR 0091). Тот же приём, что у релея
# (apps/relay/scripts/relay-deploy.sh): образ собирается на сервере (он x86_64, Mac - arm64) из
# корня репозитория, кладётся в локальный реестр сервера, Coolify тянет его оттуда. База -
# SQLite в томе /data приложения и выкладку переживает.
#
#   apps/store/scripts/store-deploy.sh          # спросит перед выкладкой
#   apps/store/scripts/store-deploy.sh --yes    # без вопроса, когда никто не смотрит
#
# До сборки - проверка, что приложение Coolify по APP_UUID отвечает на нашем домене и тянет наш
# образ: uuid, взятый у чужого приложения, получает отказ, а не выкладку.
set -euo pipefail

DOMAIN=agentic-workstation-store.mzpizote.com
SERVER=root@40.160.85.25
# Приложение Coolify `aw-store` в проекте `aw-store` (создано 2026-11-19).
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
  echo "нет uuid приложения Coolify: передайте AW_STORE_APP_UUID" >&2
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
    print(f'отказ: приложение {uuid} отвечает на {domains or "ничём"} и тянет {pulls or "ничего"},', file=sys.stderr)
    print(f'а этот скрипт выкладывает {image} на {url}.', file=sys.stderr)
    sys.exit(1)
PY

if [ "$ASK" = 1 ]; then
  if [ ! -t 0 ]; then
    echo "Спросить некого - запустите с --yes, чтобы выложить без вопроса." >&2
    exit 1
  fi
  read -r -p "Выложить это рабочее дерево на $DOMAIN? [y/N] " answer
  [ "$answer" = "y" ] || [ "$answer" = "Y" ] || exit 1
fi

# Метка сборки: по ней проверка в конце узнаёт новый контейнер, а не старый, который ещё
# отвечает.
BUILD_ID="$(git -C "$ROOT" rev-parse --short HEAD)-$(date -u +%Y%m%d%H%M%S)"

echo "==> упаковываю исходники ($BUILD_ID)"
# Манифесты всех пакетов workspace (их читает lock-файл), сам магазин и пакет протокола.
PACK=(package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json apps/store packages/store-protocol)
for manifest in "$ROOT"/apps/*/package.json "$ROOT"/packages/*/package.json; do
  PACK+=("${manifest#"$ROOT"/}")
done
ARCHIVE="$(mktemp -t aw-store).tgz"
(cd "$ROOT" && COPYFILE_DISABLE=1 tar czf "$ARCHIVE" \
  --exclude=node_modules --exclude=dist --exclude=out --exclude=coverage --exclude=.data \
  --exclude='*.tsbuildinfo' --exclude='*.pem' --exclude='*.p12' --exclude='.env*' \
  "${PACK[@]}")
scp -q "$ARCHIVE" "$SERVER:/root/apps/aw-store.tgz"
rm -f "$ARCHIVE"

echo "==> собираю образ на сервере"
# Папка очищается перед распаковкой: файл, ушедший из сборки, иначе остался бы в образе.
ssh "$SERVER" "rm -rf $REMOTE_DIR && mkdir -p $REMOTE_DIR && cd $REMOTE_DIR && \
  tar xzf ../aw-store.tgz 2>/dev/null && rm -f ../aw-store.tgz && \
  docker build -q -f apps/store/Dockerfile --build-arg BUILD_ID=$BUILD_ID -t $IMAGE_NAME:$IMAGE_TAG . && \
  docker push -q $IMAGE_NAME:$IMAGE_TAG" >/dev/null

echo "==> выкладываю"
python3 - "$COOL_DIR" "$APP_UUID" <<'PY'
import sys, time
sys.path.insert(0, sys.argv[1])
from cool import call

answer = call('POST', f'/deploy?uuid={sys.argv[2]}&force=true') or {}
try:
    deployment = answer['deployments'][0]['deployment_uuid']
except (KeyError, IndexError, TypeError):
    print('Coolify не назвал выкладку - не жду её', file=sys.stderr)
    sys.exit(0)

for _ in range(72):
    time.sleep(5)
    try:
        status = str((call('GET', f'/deployments/{deployment}') or {}).get('status', ''))
    except SystemExit:
        continue
    if status == 'finished':
        sys.exit(0)
    if status.startswith('failed') or status.startswith('cancelled'):
        print(f'выкладка {deployment}: {status} - журнал в Coolify', file=sys.stderr)
        sys.exit(1)

print(f'выкладка {deployment} не кончилась за шесть минут - журнал в Coolify', file=sys.stderr)
sys.exit(1)
PY

for _ in $(seq 1 30); do
  if curl -sS -m 10 "https://$DOMAIN/v1/info" 2>/dev/null | grep -q "\"build\":\"$BUILD_ID\""; then
    echo "==> готово: $DOMAIN отвечает сборкой $BUILD_ID"
    exit 0
  fi
  sleep 6
done

echo "$DOMAIN не ответил сборкой $BUILD_ID за три минуты - смотрите журнал выкладки" >&2
exit 1
