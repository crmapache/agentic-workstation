#!/bin/bash
# Переустановка Agentic Workstation на этом Mac из последнего релиза (скилл /reinstall).
#
#   reinstall.sh          поставить заново, данные IDE остаются
#   reinstall.sh clean    и удалить данные IDE (проекты, разговоры, настройки, входы)
#   reinstall.sh check    только скачать и проверить установщик, ничего не трогая
#
# Скилл почти всегда запускают из панели самой установленной IDE, а её закрытие гасит разговор
# со всеми его процессами. Поэтому замену делает отдельный процесс в своей сессии (родитель -
# launchd), а запуск изнутри IDE ещё и ждёт, пока агент допишет ответ человеку.
set -uo pipefail

ID=io.github.crmapache.agenticworkstation
APP="/Applications/Agentic Workstation.app"
APP_BIN="$APP/Contents/MacOS/Agentic Workstation"
LOG="$HOME/Library/Logs/agentic-workstation-reinstall.log"
LOCK="$HOME/Library/Caches/agentic-workstation-reinstall.pid"
SELF="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
REPO_ROOT="$(cd "$(dirname "$SELF")/../../.." && pwd)"
# Пауза перед закрытием IDE изнутри неё: агент успевает дописать ответ.
REPLY_PAUSE_S=30
# Закрытие бережное и ждёт человека: несохранённый файл с конфликтом IDE не бросает, а спрашивает.
QUIT_WAIT_S=600
# Через сколько секунд напомнить системным уведомлением, что IDE ждёт ответа.
QUIT_NUDGE_S=30

DATA_PATHS=(
  "$HOME/Library/Application Support/Agentic Workstation"
  "$HOME/Library/Logs/Agentic Workstation"
  "$HOME/Library/Caches/$ID"
  "$HOME/Library/Preferences/$ID.plist"
  "$HOME/Library/Saved Application State/$ID.savedState"
  "$HOME/Library/HTTPStorages/$ID"
)

die() {
  echo "СТОП: $*" >&2
  exit 1
}
log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*"; }
notify() {
  /usr/bin/osascript -e "display notification \"$1\" with title \"Agentic Workstation reinstall\"" \
    >/dev/null 2>&1 || true
}
version_of() { plutil -extract CFBundleShortVersionString raw -o - "$1/Contents/Info.plist" 2>/dev/null; }

# Главный процесс - точное совпадение командной строки. Мост браузера (его запускает Chrome)
# исполняется тем же бинарником, но с аргументами: его не трогаем, он сам переподключится к новой
# IDE. dev и копия окна агента идут из других путей. Своих предков pgrep не видит - поэтому
# вызывается только из отвязанного процесса.
main_pids() { pgrep -x -f "$APP_BIN" || true; }

# Запущен ли скрипт изнутри установленной IDE: она среди его предков.
inside_ide() {
  local pid=$$ cmd
  while [ "${pid:-0}" -gt 1 ]; do
    cmd=$(ps -o command= -p "$pid" 2>/dev/null) || return 1
    [ "${cmd%"${cmd##*[![:space:]]}"}" = "$APP_BIN" ] && return 0
    pid=$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ')
  done
  return 1
}

mount_dmg() {
  hdiutil attach "$1" -nobrowse -readonly 2>/dev/null | grep '/Volumes/' | tail -1 | awk -F'\t' '{print $NF}'
}

# Голый open передал бы IDE окружение агента - его переменные Claude, и панель ходила бы в чужой
# аккаунт.
launch_app() {
  env -i HOME="$HOME" USER="$USER" LOGNAME="$LOGNAME" PATH=/usr/bin:/bin:/usr/sbin:/sbin \
    /usr/bin/open "$APP"
}

# Двойной fork и своя сессия: процесс переживает закрытие IDE и её чистку групп процессов.
detach() {
  /usr/bin/python3 -I -c '
import os, sys
if os.fork():
    sys.exit(0)
os.setsid()
if os.fork():
    os._exit(0)
fd = os.open("/dev/null", os.O_RDWR)
for i in (0, 1, 2):
    os.dup2(fd, i)
os.execv("/bin/bash", ["/bin/bash"] + sys.argv[1:])
' "$@"
}

# Бережно: та же дорога, что ⌘Q, - IDE дописывает файлы, транскрипты и историю. Силой не
# закрываем никогда: это потерянные правки. Не закрылась - человек видит её вопрос в окне.
close_ide() {
  [ -z "$(main_pids)" ] && {
    log "IDE не запущена"
    return 0
  }
  log "закрываю IDE: $(main_pids | tr '\n' ' ')"
  /usr/bin/osascript -e "tell application id \"$ID\" to quit" >/dev/null 2>&1 &
  local osa=$! waited=0 pids
  while pids=$(main_pids) && [ -n "$pids" ]; do
    if [ "$waited" -eq 15 ] && ! kill -0 "$osa" 2>/dev/null && ! wait "$osa"; then
      # Apple Event не дошёл: SIGTERM Electron принимает за тот же бережный выход.
      log "quit не дошёл, SIGTERM"
      # shellcheck disable=SC2086 # несколько PID - несколько аргументов
      kill -TERM $pids 2>/dev/null
    fi
    if [ "$waited" -eq "$QUIT_NUDGE_S" ]; then
      log "IDE ждёт ответа человека"
      notify "IDE не закрывается: наверное, спрашивает про несохранённый файл. Ответь в окне и закрой её Cmd+Q, установка продолжится."
    fi
    if [ "$waited" -ge "$QUIT_WAIT_S" ]; then
      kill "$osa" 2>/dev/null
      return 1
    fi
    sleep 1
    waited=$((waited + 1))
  done
  kill "$osa" 2>/dev/null
  log "IDE закрыта"
  sleep 2
}

worker() {
  local clean="$2" pause="$3" mount old new
  stage="$1"
  exec >>"$LOG" 2>&1
  echo $$ >"$LOCK"
  RESULT="СБОЙ: скрипт оборвался, смотри журнал выше"
  # Временная папка уходит при любом исходе, кроме одного: в ней осталась прежняя версия.
  trap '[ -d "$stage/old.app" ] || rm -rf "$stage"; log "ИТОГ: $RESULT"; rm -f "$LOCK"' EXIT

  old=$(version_of "$APP")
  log "старт: стоит ${old:-ничего}, данные $([ "$clean" = 1 ] && echo удалить || echo оставить)"
  sleep "$pause"

  if ! close_ide; then
    RESULT="СТОП: IDE не закрылась за $QUIT_WAIT_S с, ничего не тронуто"
    notify "Переустановка отменена: IDE не закрылась. Ничего не тронуто."
    exit 1
  fi

  # Монтируем до замены: не смонтировалось - возвращаем прежнюю IDE как была.
  mount=$(mount_dmg "$stage/aw.dmg") || mount=""
  if [ -z "$mount" ] || [ ! -d "$mount/Agentic Workstation.app" ]; then
    [ -d "$APP" ] && launch_app
    RESULT="СТОП: установщик не смонтировался, прежняя версия открыта снова"
    notify "Переустановка не удалась: установщик не открылся. Прежняя версия на месте."
    exit 1
  fi

  # Старую не удаляем, а откладываем: копирование сорвалось - вернём её.
  if [ -d "$APP" ] && ! mv "$APP" "$stage/old.app"; then
    hdiutil detach "$mount" -quiet
    launch_app
    RESULT="СТОП: не удалось убрать прежнюю версию, она открыта снова"
    notify "Переустановка не удалась: прежняя версия на месте."
    exit 1
  fi
  if ! cp -R "$mount/Agentic Workstation.app" /Applications/; then
    hdiutil detach "$mount" -quiet
    rm -rf "$APP"
    [ -d "$stage/old.app" ] && mv "$stage/old.app" "$APP" && launch_app
    RESULT="СТОП: копирование не удалось, прежняя версия возвращена и открыта"
    notify "Переустановка не удалась: прежняя версия возвращена."
    exit 1
  fi
  hdiutil detach "$mount" -quiet
  new=$(version_of "$APP")
  log "поставлена $new"

  if [ "$clean" = 1 ]; then
    # cfprefsd держит настройки в памяти и записал бы удалённый файл обратно.
    defaults delete "$ID" >/dev/null 2>&1
    for p in "${DATA_PATHS[@]}"; do
      [ -e "$p" ] && rm -rf "$p" && log "удалено: $p"
    done
  fi

  # Без Developer ID macOS иначе пишет «приложение повреждено».
  xattr -cr "$APP"
  launch_app
  for _ in $(seq 1 30); do
    [ -n "$(main_pids)" ] && break
    sleep 1
  done
  if [ -z "$(main_pids)" ]; then
    RESULT="ВНИМАНИЕ: поставлена $new, но IDE не запустилась за 30 с; прежняя версия лежит в $stage/old.app"
    notify "Поставлена $new, но IDE не запустилась. Прежняя версия сохранена, смотри журнал."
    exit 1
  fi
  rm -rf "$stage/old.app"
  RESULT="поставлена $new (было ${old:-ничего}), IDE запущена, данные $([ "$clean" = 1 ] && echo удалены || echo на месте)"
}

# Скачать и проверить установщик: кладёт его в STAGE, версию - в NEW_VERSION. Не вышло - стоп
# до любых изменений.
prepare() {
  local repo stage mount id tmp="${TMPDIR:-/tmp}"
  repo=$(plutil -extract agenticWorkstation.releasesRepo raw -o - "$REPO_ROOT/apps/desktop/package.json") ||
    die "не нашёл репозиторий релизов в apps/desktop/package.json"
  stage=$(mktemp -d "${tmp%/}/aw-reinstall.XXXXXX")
  if ! curl -fsSL --retry 2 -o "$stage/aw.dmg" \
    "https://github.com/$repo/releases/latest/download/agentic-workstation-mac-arm64.dmg"; then
    rm -rf "$stage"
    die "установщик не скачался, ничего не тронуто"
  fi
  mount=$(mount_dmg "$stage/aw.dmg") || mount=""
  if [ -z "$mount" ] || [ ! -d "$mount/Agentic Workstation.app" ]; then
    [ -n "$mount" ] && hdiutil detach "$mount" -quiet
    rm -rf "$stage"
    die "установщик не открылся, ничего не тронуто"
  fi
  id=$(plutil -extract CFBundleIdentifier raw -o - "$mount/Agentic Workstation.app/Contents/Info.plist")
  NEW_VERSION=$(version_of "$mount/Agentic Workstation.app")
  hdiutil detach "$mount" -quiet
  if [ "$id" != "$ID" ]; then
    rm -rf "$stage"
    die "в установщике чужое приложение ($id), ничего не тронуто"
  fi
  STAGE="$stage"
}

main() {
  local mode="${1:-install}" clean=0 pause=0 inside=0 p
  case "$mode" in
    --worker)
      shift
      worker "$@"
      return
      ;;
    install | check) ;;
    clean) clean=1 ;;
    *) die "аргумент - clean, check или ничего" ;;
  esac
  [ "$(uname -s)" = Darwin ] || die "только macOS: Windows-версию ставит её установщик"
  if [ -f "$LOCK" ] && kill -0 "$(cat "$LOCK")" 2>/dev/null; then
    die "переустановка уже идёт (процесс $(cat "$LOCK")), журнал: $LOG"
  fi

  prepare
  inside_ide && inside=1
  echo "релиз: $NEW_VERSION, стоит: $(version_of "$APP" || echo ничего)"
  echo "запуск: $([ "$inside" = 1 ] && echo "изнутри установленной IDE" || echo "не из установленной IDE")"
  if [ "$mode" = check ]; then
    echo "данные, которые удалил бы clean:"
    for p in "${DATA_PATHS[@]}"; do [ -e "$p" ] && echo "  $p"; done
    rm -rf "$STAGE"
    return
  fi

  : >"$LOG"
  [ "$inside" = 1 ] && pause=$REPLY_PAUSE_S
  detach "$SELF" --worker "$STAGE" "$clean" "$pause"

  if [ "$inside" = 1 ]; then
    echo "через $pause с IDE закроется вместе с этим разговором, поставится $NEW_VERSION и откроется снова"
    echo "журнал: $LOG"
    return
  fi
  # Не изнутри IDE - дождаться итога и показать журнал. Не дождались - замена идёт дальше сама.
  for _ in $(seq 1 540); do
    grep -q 'ИТОГ:' "$LOG" 2>/dev/null && break
    sleep 1
  done
  cat "$LOG"
}

main "$@"
