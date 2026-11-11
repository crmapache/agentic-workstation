import packageJson from '../../../package.json'

/**
 * Публичный репозиторий, куда /release выкладывает сборки. Отдельный от кода:
 * качать обновления приложение должно без токена. Задаётся в package.json, оттуда
 * же его читают скилл /release и скрипт манифеста.
 */
const RELEASES_REPO = packageJson.agenticWorkstation.releasesRepo

/** Манифест последнего релиза. GitHub сам ведёт /latest на новейший релиз. */
export const UPDATE_FEED_URL = `https://github.com/${RELEASES_REPO}/releases/latest/download/latest.json`

export const RELEASE_PAGE_URL = `https://github.com/${RELEASES_REPO}/releases/latest`

/**
 * Подменяет адрес манифеста. Нужна, чтобы прогнать обновление целиком на своей
 * машине с локальным сервером, не выпуская релиз (см. docs/releasing.md).
 */
export const UPDATE_FEED_OVERRIDE_ENV = 'AGENTIC_WORKSTATION_UPDATE_FEED'

/** Ключ сборки в манифесте: платформа и архитектура. Пока собираем только эту. */
export const UPDATE_ASSET_KEY = 'mac-arm64'

/** Первая проверка не мешает старту окна. */
export const FIRST_CHECK_DELAY_MS = 10_000

export const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000

export const FEED_TIMEOUT_MS = 15_000

/** Скачивание zip: порядка сотни мегабайт, на медленной сети это минуты. */
export const DOWNLOAD_TIMEOUT_MS = 15 * 60 * 1000

/**
 * Папка рядом с установленным приложением, куда распаковывается новая версия.
 * Рядом - чтобы подмена была переименованием на том же диске, а не копированием.
 */
export const STAGING_DIR_NAME = '.agentic-workstation-update'

/**
 * Старая версия на время подмены, внутри той же папки. Если новая не встала,
 * её возвращают на место.
 */
export const BACKUP_BUNDLE_NAME = 'previous.app'

/** Сколько ждать выхода приложения перед подменой, в десятых долях секунды. */
export const SWAP_WAIT_TICKS = 300

/**
 * Подмена приложения. Запускается отдельным процессом, который переживает выход
 * IDE: ждёт, пока процесс завершится, переставляет бандлы и открывает новую версию.
 * Не встала новая - возвращает старую и открывает её. Пишет журнал в logs.
 *
 * Аргументы: pid, установленное приложение, новое, путь бэкапа, журнал, ожидание,
 * переменная окружения для перезапущенной версии (NAME=value или пусто).
 */
export const SWAP_SCRIPT = `
pid="$1"; target="$2"; staged="$3"; backup="$4"; log="$5"; ticks="$6"; relaunch_env="$7"
relaunch() {
  if [ -n "$relaunch_env" ]; then open --env "$relaunch_env" "$1"; else open "$1"; fi
}
mkdir -p "$(dirname "$log")"
exec >>"$log" 2>&1
echo "$(date '+%F %T') update: waiting for pid $pid"
i=0
while kill -0 "$pid" 2>/dev/null; do
  i=$((i + 1))
  if [ "$i" -gt "$ticks" ]; then
    echo "update: app did not quit, giving up"
    rm -rf "$(dirname "$staged")"
    exit 1
  fi
  sleep 0.1
done
rm -rf "$backup"
if ! mv "$target" "$backup"; then
  echo "update: cannot move the installed app aside"
  rm -rf "$(dirname "$staged")"
  relaunch "$target"
  exit 1
fi
if mv "$staged" "$target"; then
  xattr -dr com.apple.quarantine "$target" 2>/dev/null
  rm -rf "$backup"
  echo "update: installed"
else
  echo "update: cannot move the new app in, restoring the previous one"
  mv "$backup" "$target"
fi
rm -rf "$(dirname "$staged")"
relaunch "$target"
`
