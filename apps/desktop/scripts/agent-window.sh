#!/usr/bin/env bash
#
# Окно IDE для проверки агентом - отдельная копия со своим профилем, которая не
# мешает ни dev, ни установленной IDE человека и не трогает их состояние.
#
#   bash apps/desktop/scripts/agent-window.sh start [папка-проекта ...]
#   node apps/desktop/scripts/cdp.mjs screenshot .screenshots/<что>.png
#   bash apps/desktop/scripts/agent-window.sh stop
#
# start собирает текущий код в ~/.agentic-workstation-agent, открывает в окне переданные
# папки как проекты (первая - активная) и ждёт порт отладки 5316. stop гасит окно и
# удаляет папку целиком. Изменил код - stop и снова start.

set -euo pipefail

DESKTOP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WORK_DIR="$HOME/.agentic-workstation-agent"
CDP_PORT=5316

stop() {
  pkill -f "$WORK_DIR/out" 2>/dev/null || true
  for _ in $(seq 1 25); do
    pgrep -f "$WORK_DIR/out" >/dev/null || break
    sleep 0.2
  done
  rm -rf "$WORK_DIR"
}

start() {
  if lsof -nP -iTCP:"$CDP_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Порт $CDP_PORT занят - окно уже запущено? Сначала stop." >&2
    exit 1
  fi

  stop
  mkdir -p "$WORK_DIR/profile/user-data"

  cd "$DESKTOP_DIR"
  # VITE_SHOWCASE=1 - в копии есть витрина дизайн-системы (действие в поиске везде),
  # как в dev. Релизная сборка флага не получает, и витрины в ней нет.
  VITE_SHOWCASE=1 pnpm exec electron-vite build --outDir "$WORK_DIR/out" >"$WORK_DIR/build.log" 2>&1 ||
    { echo "Сборка упала: $WORK_DIR/build.log" >&2; exit 1; }

  # Вне репозитория рантайм-зависимости главного процесса не находятся сами.
  ln -s "$DESKTOP_DIR/node_modules" "$WORK_DIR/out/node_modules"
  sed 's|"main": "./out/main/index.js"|"main": "./main/index.js"|' package.json \
    >"$WORK_DIR/out/package.json"

  node -e '
    const [file, ...roots] = process.argv.slice(1)
    const projects = roots.map((rootPath, index) => ({
      id: `p${index + 1}`,
      name: require("node:path").basename(rootPath),
      rootPath: require("node:path").resolve(rootPath),
    }))
    require("node:fs").writeFileSync(file, JSON.stringify({ projects, activeProjectId: projects[0]?.id ?? null }))
  ' "$WORK_DIR/profile/user-data/workspace.json" "$@"

  # Копия живёт за окнами человека, а закрытое окно Chromium не рисует: кадры стоят, страница
  # считает себя скрытой, и всё, что ждёт кадра (показ разницы, покадровые замеры), молчит.
  AGENTIC_WORKSTATION_PROFILE_DIR="$WORK_DIR/profile" AGENTIC_WORKSTATION_CDP_PORT="$CDP_PORT" \
    nohup ./node_modules/electron/dist/Electron.app/Contents/MacOS/Electron "$WORK_DIR/out" \
    --disable-backgrounding-occluded-windows >"$WORK_DIR/app.log" 2>&1 &

  for _ in $(seq 1 60); do
    curl -s "http://127.0.0.1:$CDP_PORT/json" >/dev/null 2>&1 && { sleep 2; echo "Окно готово, порт $CDP_PORT"; return; }
    sleep 0.5
  done

  echo "Окно не поднялось, журнал: $WORK_DIR/app.log" >&2
  exit 1
}

case "${1:-}" in
  start) shift; start "$@" ;;
  stop) stop; echo "Окно погашено, $WORK_DIR удалена" ;;
  *) echo "Команды: start [папка-проекта ...] | stop" >&2; exit 1 ;;
esac
