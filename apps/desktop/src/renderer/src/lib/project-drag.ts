/**
 * Перетаскивание путей проекта между частями окна (дерево файлов → поле Claude Code):
 * свой MIME, пути от корня проекта по строке, папка кончается «/». Внутри страницы это
 * обычный DnD - системе пути не нужны.
 */
export const PROJECT_PATHS_MIME = 'application/x-agentic-workstation-paths'

/** Положить пути в перетаскивание; text/plain - тот же список, если бросят мимо панели. */
export const writeProjectPaths = (transfer: DataTransfer, paths: readonly string[]): void => {
  transfer.setData(PROJECT_PATHS_MIME, paths.join('\n'))
  transfer.setData('text/plain', paths.join('\n'))
  transfer.effectAllowed = 'copy'
}

/** Пути из перетаскивания, если оно наше; иначе пусто. */
export const readProjectPaths = (transfer: DataTransfer | null): string[] =>
  (transfer?.getData(PROJECT_PATHS_MIME) ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
