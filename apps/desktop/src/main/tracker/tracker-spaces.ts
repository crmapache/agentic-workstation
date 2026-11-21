import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { basename } from 'node:path'

import { git } from '../git/git-runner'
import type { TrackerBook } from './tracker-book'
import { refOf, textOf, isAlive } from './tracker-records'
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

  return path.replace(/\/+$/, '').replace(/\.git$/, '') || null
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

/**
 * Пространство без git, которое уже привязано на этом компьютере к другой папке, другой папке с
 * тем же именем не отдаётся: это два разных проекта. Новое получает свой ключ с меткой - двойником
 * оно не считается, а другой компьютер узнает его по имени папки, как и первое.
 */
const SPLIT_MARK = '#'

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
 * Пространство с этим ключом, которое можно отдать папке без привязки. Origin в git и дом - одно
 * пространство на всех (клоны и worktree одного репозитория делят доску). Имя папки - только
 * пространство, которое на этом компьютере ещё ни к чему не привязано: точный ключ первым.
 */
const matchingSpace = (
  book: TrackerBook,
  key: string,
  exists: (path: string) => boolean,
): string | undefined => {
  const groups = spacesByKey(book)

  if (!key.startsWith('folder:')) return groups.get(key)?.[0]

  // Занята только привязка живой папки: папку перенесли или переименовали родителя - доска
  // переходит к новому пути, а не остаётся у пути, которого больше нет.
  const boundHere = new Set(
    Object.entries(book.bindings())
      .filter(([path]) => exists(path))
      .map(([, id]) => id),
  )
  const candidates = [...groups.entries()]
    .filter(([one]) => one === key || one.startsWith(`${key}${SPLIT_MARK}`))
    .sort(([a], [b]) => (a === key ? -1 : b === key ? 1 : a < b ? -1 : 1))
    .flatMap(([, ids]) => ids)

  return candidates.find((id) => !boundHere.has(id))
}

const newSpace = (
  book: TrackerBook,
  place: TrackerPlace,
  remote: string | null,
  key: string,
): string => {
  const taken = spacesByKey(book).has(key)
  const own =
    taken && key.startsWith('folder:') ? `${key}${SPLIT_MARK}${randomUUID().slice(0, 8)}` : key

  return book.create('space', {
    key: own,
    remote,
    home: place.home,
    folder: basename(place.rootPath),
    name: place.name,
  })
}

/**
 * Пространство проекта на этом компьютере: по привязке, по ключу или новое. Проект, которому
 * дали origin после привязки, отдаёт адрес пространству - другой компьютер узнает его по нему.
 */
export const resolveSpace = (
  book: TrackerBook,
  place: TrackerPlace,
  remote: string | null,
  exists: (path: string) => boolean = existsSync,
): string => {
  const folder = basename(place.rootPath)
  const key = keyOf(remote, place.home, folder)
  const bound = book.binding(place.rootPath)
  const boundRecord = bound ? book.get(bound) : undefined

  if (isAlive(boundRecord) && boundRecord.kind === 'space') {
    // Origin появился или сменился (перенесли репозиторий): ключ пространства - новый адрес,
    // и двойник с тем же адресом на другой машине сольётся с ним.
    if (remote && refOf(boundRecord, 'remote') !== remote) {
      book.write(boundRecord.id, { remote, key, name: place.name })
      mergeTwinSpaces(book)

      return book.binding(place.rootPath) ?? boundRecord.id
    }

    return boundRecord.id
  }

  const spaceId = matchingSpace(book, key, exists) ?? newSpace(book, place, remote, key)

  book.bind(place.rootPath, spaceId)

  return spaceId
}

/**
 * Два компьютера завели пространство одного проекта, пока не видели друг друга (первый запуск
 * до первой синхронизации): проекты трекера переезжают в главное (живое с меньшим id), лишние
 * удаляются, привязки переставляются. Проекты подбираются и из уже удалённого двойника: другая
 * машина могла завести в нём проект, ещё не зная о слиянии. Правило одно на всех компьютерах -
 * они сходятся к одному пространству.
 */
export const mergeTwinSpaces = (book: TrackerBook): boolean => {
  const tree = new TrackerTree(book.records())
  const groups = new Map<string, { alive: string[]; all: string[] }>()
  let changed = false

  for (const space of tree.all('space')) {
    const key = textOf(space, 'key')
    const group = groups.get(key) ?? { alive: [], all: [] }

    group.all.push(space.id)
    if (isAlive(space)) group.alive.push(space.id)
    groups.set(key, group)
  }

  for (const { alive, all } of groups.values()) {
    const [main] = alive.sort()

    if (!main) continue

    for (const twin of all.filter((id) => id !== main)) {
      for (const project of tree.all('project')) {
        if (refOf(project, 'space') === twin && isAlive(project)) {
          book.write(project.id, { space: main }, true)
          changed = true
        }
      }

      if (isAlive(tree.get(twin))) {
        book.write(twin, { deleted: true }, true)
        changed = true
      }

      for (const [path, bound] of Object.entries(book.bindings())) {
        if (bound !== twin) continue

        book.bind(path, main)
        changed = true
      }
    }
  }

  if (changed) book.commit()

  return changed
}
