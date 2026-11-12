/**
 * Платформа, на которой идёт IDE (ADR 0048). Мак - основная, Windows - вторая: развилки по
 * ним - здесь, а не `process.platform` по месту, чтобы их было видно поиском.
 */
export const IS_MAC = process.platform === 'darwin'

export const IS_WINDOWS = process.platform === 'win32'

/**
 * Процесс в своей группе (spawn detached): на маке так гасится всё, что он запустил. На
 * Windows detached отрывает процесс от консоли, и всё, что запустит он сам (Bash агента, git),
 * получает по своему видимому окну консоли; дерево там гасит taskkill (windows/process-tree.ts).
 */
export const SPAWN_DETACHED = !IS_WINDOWS

/**
 * Имя приложения для Windows (AppUserModelID): по нему система собирает окна на панели задач
 * и подписывает уведомления. Совпадает с appId в electron-builder.yml - с ним установщик пишет
 * ярлык, иначе окно и ярлык стали бы разными приложениями.
 */
export const WINDOWS_APP_ID = 'io.github.crmapache.agenticworkstation'
