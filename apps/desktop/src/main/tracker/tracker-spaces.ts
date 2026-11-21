import { basename } from 'node:path'

import { git } from '../git/git-runner'
import type { TrackerBook } from './tracker-book'
import { refOf, flagOf, textOf, isAlive } from './tracker-records'
import { TrackerTree } from './tracker-tree'

/**
 * Пространство - доска одного проекта IDE, общая для всех компьютеров. Путь папки на каждом
 * компьютере свой, поэтому проект узнаётся по адресу origin в git, домашний - по отметке дома,
 * а без git - по имени папки. Привязка «путь → пространство» живёт только на этом компьютере.
 */

/** Проект IDE, как его видит трекер. */
export type TrackerPlace = { rootPath: string; name: string; home: boolean }

/**
 * Адрес репозитория без способа доступа: `git@github.com:me/app.git` и
 * `https://github.com/me/app` - один проект.
 */
export const normalizeRemote = (url: string): string | null => {
  const text = url.trim().toLowerCase()

  if (!text) return null

  const scp = /^[^@/\s]+@([^:/\s]+):(.+)$/.exec(text)
  const path = scp
    ? `${scp[1]}/${scp[2]}`
    : text.replace(/^[a-z+]+:\/\//, '').replace(/^[^@/]+@/, '')

  return path.replace(/\.git$/, '').replace(/\/+$/, '') || null
}

/** Адрес origin проекта или null (не git, нет origin, git не ответил). */
export const readRemote = async (rootPath: string): Promise<string | null> => {
  try {
    return normalizeRemote((await git(rootPath, ['remote', 'get-url', 'origin'])).stdout)
  } catch {
    return null
  }
}

/** Ключ, по которому два компьютера узнают одно пространство. */
const keyOf = (remote: string | null, home: boolean, folder: string) =>
  remote ? `remote:${remote}` : home ? 'home' : `folder:${folder.toLowerCase()}`

/** Пространства с одним ключом: главное - с меньшим id, одинаково на всех компьютерах. */
const spacesByKey = (book: TrackerBook) => {
  const groups = new Map<string, string[]>()

  for (const record of book.records()) {
    if (record.kind !== 'space' || !isAlive(record)) continue

    const key = textOf(record, 'key')

    groups.set(key, [...(groups.get(key) ?? []), record.id].sort())
  }

  return groups
}

/**
 * Пространство проекта на этом компьютере: по привязке, по ключу или новое. Проект, которому
 * дали origin после привязки, отдаёт адрес пространству - другой компьютер узнает его по нему.
 */
export const resolveSpace = (
  book: TrackerBook,
  place: TrackerPlace,
  remote: string | null,
): string => {
  const folder = basename(place.rootPath)
  const key = keyOf(remote, place.home, folder)
  const bound = book.binding(place.rootPath)
  const boundRecord = bound ? book.get(bound) : undefined

  if (isAlive(boundRecord) && boundRecord.kind === 'space') {
    if (remote && !refOf(boundRecord, 'remote'))
      book.write(boundRecord.id, { remote, key, name: place.name })

    return boundRecord.id
  }

  const existing = spacesByKey(book).get(key)?.[0]
  const spaceId =
    existing ?? book.create('space', { key, remote, home: place.home, folder, name: place.name })

  book.bind(place.rootPath, spaceId)

  return spaceId
}

/**
 * Два компьютера завели пространство одного проекта, пока не видели друг друга (первый запуск
 * до первой синхронизации): проекты трекера переезжают в главное, лишние удаляются, привязки
 * переставляются. Правило одно на всех компьютерах - они сходятся к одному пространству.
 */
export const mergeTwinSpaces = (book: TrackerBook): boolean => {
  const tree = new TrackerTree(book.records())
  let changed = false

  for (const ids of spacesByKey(book).values()) {
    const [main, ...twins] = ids

    if (!main || twins.length === 0) continue

    for (const twin of twins) {
      for (const project of tree.all('project')) {
        if (refOf(project, 'space') === twin && !flagOf(project, 'deleted'))
          book.write(project.id, { space: main }, true)
      }

      book.write(twin, { deleted: true }, true)

      for (const [path, bound] of Object.entries(book.bindings())) {
        if (bound === twin) book.bind(path, main)
      }

      changed = true
    }
  }

  if (changed) book.commit()

  return changed
}
