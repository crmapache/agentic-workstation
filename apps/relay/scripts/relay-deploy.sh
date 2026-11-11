#!/usr/bin/env bash
# Выкладка релея Remote Control и телефонного клиента из этого рабочего дерева на
# https://agentic-workstation-relay.mzpizote.com (ADR 0041).
#
#   apps/relay/scripts/relay-deploy.sh               # спросит перед выкладкой
#   apps/relay/scripts/relay-deploy.sh --yes         # без вопроса, когда никто не смотрит
#   apps/relay/scripts/relay-deploy.sh --relay-only  # без клиента телефона (раздаётся заглушка)
#
# Выкладка на секунду рвёт все сокеты (IDE и телефоны переподключаются сами и догоняют
# своё по журналу), а новый клиент доходит до телефона при следующей загрузке - поэтому
# скрипт спрашивает, прежде чем трогать сервер.
#
# На том же сервере живут релеи ACC (relay, relay-dev) и Codex (acx-relay) - их задеть нельзя.
# Скрипт не пользуется ничем их: своя папка на сервере, своё имя образа, а до сборки - проверка,
# что приложение Coolify по APP_UUID отвечает на нашем домене и тянет наш образ. uuid, взятый
# у чужого релея, получает отказ, а не выкладку.
#
# Образ собирается на сервере (он x86_64, Mac - arm64) из корня репозитория: телефонному
# клиенту нужны пакеты workspace. Что попадает в контекст - ниже (PACK) и
# apps/relay/Dockerfile.dockerignore.
set -euo pipefail

DOMAIN=agentic-workstation-relay.mzpizote.com
SERVER=root@40.160.85.25
# Приложение Coolify `aw-relay` в проекте `aw-relay` (создано 2026-11-10, docs/workplan).
APP_UUID=ojppnmftlrocnhnua1xtmiaq
REMOTE_DIR=/root/apps/aw-relay
IMAGE_NAME=127.0.0.1:5000/aw-relay
IMAGE_TAG=local
COOL_DIR="$HOME/Documents/railway-migration/scripts"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

ASK=1
PHONE=1
for arg in "$@"; do
  case "$arg" in
    --yes) ASK=0 ;;
    --relay-only) PHONE=0 ;;
    *)
      echo "незнакомый аргумент: $arg" >&2
      exit 2
      ;;
  esac
done

echo "==> проверяю, что $APP_UUID - наш релей"
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
# отвечает. Коммит и время - чтобы в /v1/info было видно, что именно выложено.
BUILD_ID="$(git -C "$ROOT" rev-parse --short HEAD)-$(date -u +%Y%m%d%H%M%S)"

echo "==> упаковываю исходники ($BUILD_ID)"
# Только то, что нужно образу: манифесты workspace (их читает lock-файл), релей, клиент
# телефона и общие пакеты. COPYFILE_DISABLE - без «._имя» macOS рядом с каждым файлом: в
# образе они раздавались бы как файлы клиента.
PACK=(package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json apps/relay packages)
for manifest in "$ROOT"/apps/*/package.json; do
  # Без клиента - и без его манифеста: по нему Dockerfile решает, собирать ли клиент.
  [ "$PHONE" = 0 ] && [ "$manifest" = "$ROOT/apps/phone/package.json" ] && continue
  PACK+=("${manifest#"$ROOT"/}")
done
[ "$PHONE" = 1 ] && [ -d "$ROOT/apps/phone" ] && PACK+=(apps/phone)
ARCHIVE="$(mktemp -t aw-relay).tgz"
(cd "$ROOT" && COPYFILE_DISABLE=1 tar czf "$ARCHIVE" \
  --exclude=node_modules --exclude=dist --exclude=out --exclude=coverage \
  --exclude='*.tsbuildinfo' --exclude='*.pem' --exclude='*.p12' --exclude='.env*' \
  "${PACK[@]}")
scp -q "$ARCHIVE" "$SERVER:/root/apps/aw-relay.tgz"
rm -f "$ARCHIVE"

echo "==> собираю образ на сервере"
# Папка очищается перед распаковкой: архив ложится поверх, и файл, ушедший из сборки, иначе
# остался бы в образе навсегда. В ней нет ничего, кроме того, что кладёт этот скрипт:
# настройки релея живут в Coolify, а не в файле.
ssh "$SERVER" "rm -rf $REMOTE_DIR && mkdir -p $REMOTE_DIR && cd $REMOTE_DIR && \
  tar xzf ../aw-relay.tgz 2>/dev/null && rm -f ../aw-relay.tgz && \
  docker build -q -f apps/relay/Dockerfile --build-arg BUILD_ID=$BUILD_ID -t $IMAGE_NAME:$IMAGE_TAG . && \
  docker push -q $IMAGE_NAME:$IMAGE_TAG" >/dev/null

echo "==> выкладываю"
# Ждёт, пока Coolify скажет, что выкладка закончилась: иначе проверки ниже встретили бы
# старый контейнер. Нет номера выкладки - остаются проверки ниже, они узнают сборку по метке.
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
  if [ "$(curl -sS -m 10 "https://$DOMAIN/healthz" 2>/dev/null || true)" = "ok" ] &&
    curl -sS -m 10 "https://$DOMAIN/v1/info" 2>/dev/null | grep -q "\"build\":\"$BUILD_ID\""; then
    echo "==> готово: $DOMAIN отвечает сборкой $BUILD_ID"
    exit 0
  fi
  sleep 6
done

echo "$DOMAIN не ответил сборкой $BUILD_ID за три минуты - смотрите журнал выкладки" >&2
exit 1
