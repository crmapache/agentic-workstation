import type { HistoryCause } from '@shared/local-history'

import type { Observation } from './history-observe'
import type { FileRow } from './history-store'

/** Событие, которое сверка запишет: что было, что стало, почему. */
export type PlannedRevision = {
  path: string
  cause: HistoryCause
  origin: string | null
  previous: string | null
  version: string | null
}

/**
 * Что сверка поменяет в истории. moves - перенесённые файлы (их прошлые события едут на новое
 * место, до записи событий); drops - файлы, которых больше нет; rows - каким файл стал;
 * previous - ключи «до», которые надо ещё достать (новое содержимое сверка сохранила сама).
 */
export type HistoryPlan = {
  moves: { from: string; to: string }[]
  drops: string[]
  rows: FileRow[]
  revisions: PlannedRevision[]
  previous: Set<string>
}

export type PlanInput = {
  /** Каким история знает пути сверки (только известные). */
  known: ReadonlyMap<string, FileRow>
  /** Что лежит по каждому пути сверки сейчас. */
  observed: ReadonlyMap<string, Observation>
  /**
   * Незнакомый файл просто запоминается, без события: первая сверка проекта ещё не прошла.
   * Если его объявил пишущий (агент, редактор) - событие есть.
   */
  baseline: boolean
  /**
   * Снимок «до»: файл открыли в редакторе или агент вот-вот его поправит - незнакомый только
   * запоминается, даже объявленный.
   */
  snapshot?: boolean
  causeOf: (path: string) => HistoryCause | null
}

type Seen = Extract<Observation, { kind: 'file' }>

const rowOf = (path: string, file: Seen): FileRow => ({
  path,
  key: file.key,
  size: file.size,
  mtimeMs: file.mtimeMs,
})

const folderOf = (path: string) => path.slice(0, path.lastIndexOf('/') + 1)

/** Очереди путей по ключу: взять первый ещё не занятый. */
const takeFree = (
  lists: Map<string, string[]>,
  key: string,
  used: ReadonlySet<string>,
): string | undefined => {
  const list = lists.get(key)

  while (list && list.length > 0) {
    const path = list.shift()

    if (path !== undefined && !used.has(path)) return path
  }

  return undefined
}

const push = (lists: Map<string, string[]>, key: string, path: string) => {
  const list = lists.get(key)

  if (list) list.push(path)
  else lists.set(key, [path])
}

/**
 * Пары «пропал - появился» с одним содержимым - это перенос, а не удаление и новый файл:
 * так переименование в терминале (git mv, mv агента) сохраняет историю файла. Сначала пара
 * в той же папке (переименование), потом любая. По очередям ключей: перенос папки на
 * десятки тысяч файлов не должен считаться квадратично в главном процессе.
 */
const pairMoves = (
  gone: { path: string; key: string }[],
  appeared: { path: string; file: Seen }[],
): Map<string, string> => {
  const inFolder = new Map<string, string[]>()
  const anywhere = new Map<string, string[]>()
  const used = new Set<string>()
  const pairs = new Map<string, string>()

  for (const { path, key } of gone) {
    push(inFolder, `${key}\0${folderOf(path)}`, path)
    push(anywhere, key, path)
  }

  for (const { path, file } of appeared) {
    const twin =
      takeFree(inFolder, `${file.key}\0${folderOf(path)}`, used) ??
      takeFree(anywhere, file.key, used)

    if (twin === undefined) continue

    used.add(twin)
    pairs.set(path, twin)
  }

  return pairs
}

/**
 * План сверки: из того, что история помнит, и того, что лежит на диске, - какие события
 * записать. Изменилось содержимое - событие с причиной пишущего или «извне»; пропал -
 * удаление (последнее содержимое можно вернуть); появился - новый файл; пропал и появился с
 * тем же содержимым - перенос. Тронут, но текст прежний - только новые сведения с диска.
 */
export const planSync = ({
  known,
  observed,
  baseline,
  snapshot = false,
  causeOf,
}: PlanInput): HistoryPlan => {
  const plan: HistoryPlan = {
    moves: [],
    drops: [],
    rows: [],
    revisions: [],
    previous: new Set(),
  }
  const gone: { path: string; key: string }[] = []
  const appeared: { path: string; file: Seen }[] = []

  for (const [path, seen] of observed) {
    const row = known.get(path)

    if (seen.kind === 'file' && row && row.key === seen.key) {
      plan.rows.push(rowOf(path, seen))
    } else if (seen.kind === 'file' && row) {
      plan.rows.push(rowOf(path, seen))
      plan.previous.add(row.key)
      plan.revisions.push({
        path,
        cause: causeOf(path) ?? 'outside',
        origin: null,
        previous: row.key,
        version: seen.key,
      })
    } else if (seen.kind === 'file') {
      appeared.push({ path, file: seen })
    } else if (row && (seen.kind === 'missing' || seen.kind === 'folder')) {
      gone.push({ path, key: row.key })
    } else if (row && seen.kind === 'untracked') {
      plan.drops.push(path)
    }
  }

  const moves = pairMoves(gone, appeared)

  for (const { path, file } of appeared) {
    const from = moves.get(path)
    const cause = causeOf(path)

    plan.rows.push(rowOf(path, file))

    if (from !== undefined) {
      plan.moves.push({ from, to: path })
      plan.revisions.push({
        path,
        cause: 'moved',
        origin: from,
        previous: file.key,
        version: file.key,
      })
    } else if (!baseline || (cause && !snapshot)) {
      plan.revisions.push({
        path,
        cause: cause ?? 'created',
        origin: null,
        previous: null,
        version: file.key,
      })
    }
  }

  const movedAway = new Set(moves.values())

  for (const { path, key } of gone) {
    if (movedAway.has(path)) continue

    plan.drops.push(path)
    plan.previous.add(key)
    plan.revisions.push({ path, cause: 'deleted', origin: null, previous: key, version: key })
  }

  return plan
}
