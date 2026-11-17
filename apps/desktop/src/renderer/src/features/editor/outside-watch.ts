import { invoke } from '../../lib/ipc'
import { isOutsidePath } from '../../lib/path.utils'

/** Открытый файл: проект вкладки и путь. */
type OpenFile = { projectId: string; path: string }

/**
 * Кто держит файлы открытыми: документы редактора (текст) и вкладка картинки. Набор каждого
 * приходит целиком, а главному процессу уходит общий.
 */
type WatchSource = 'documents' | 'image'

const bySource: Record<WatchSource, readonly OpenFile[]> = { documents: [], image: [] }

/** Последний набор, ушедший главному процессу: тот же второй раз не шлётся. */
let sent = ''

/**
 * Сказать главному процессу, за какими файлами вне проекта следить: проект их не видит, а
 * агент пишет и туда. Набор - открытые документы и картинка на виду, с абсолютным путём; их
 * правки придут обычным fs:changed. Не вышло - вкладка сверится по возврату в окно.
 */
export const watchOutsideFiles = (source: WatchSource, open: readonly OpenFile[]): void => {
  bySource[source] = open
    .filter((file) => isOutsidePath(file.path))
    .map(({ projectId, path }) => ({ projectId, path }))

  // Один файл бывает у обоих (картинка и её разница): главному процессу - один раз.
  const unique = new Map(
    [...bySource.documents, ...bySource.image].map((file) => [
      `${file.projectId}\n${file.path}`,
      file,
    ]),
  )
  const files = [...unique.values()]
  const key = [...unique.keys()].sort().join('\0')

  if (key === sent) return

  sent = key
  invoke('fs:watchOutside', { files }).catch((error: unknown) => {
    console.warn('[editor] слежение за файлами вне проекта не включилось:', error)
  })
}
