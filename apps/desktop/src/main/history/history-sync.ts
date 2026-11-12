import type { HistoryCause } from '@shared/local-history'

import { resolveInsideRoot } from '../fs/project-paths'
import type { HistoryBlobs } from './history-blobs'
import type { NameCheck, Observation } from './history-observe'
import { peek, readSighting } from './history-observe'
import type { HistoryPlan, PlannedRevision } from './history-plan'
import type { FileRow, HistoryStore } from './history-store'
import { READ_BATCH, EDIT_MERGE_MS, READ_BYTES_BUDGET } from './history.constants'

/** Чем сверка проекта пишет: его корень и строка в базе, база, содержимое, часы. */
export type SyncDeps = {
  root: string
  id: number
  store: HistoryStore
  blobs: HistoryBlobs
  now: () => number
}

const breathe = () => new Promise((resolve) => setImmediate(resolve))

type Pending = { path: string; absolute: string; size: number; mtimeMs: number }

/**
 * Посмотреть пути и сохранить новое содержимое. Сначала - сведения с диска пачкой, потом
 * чтение группами не больше бюджета байт: пачка файлов по 5 МБ не держит сотни мегабайт.
 * copy решает, копировать ли прочитанное к себе (первая сверка не копирует двоичное), budget
 * - сколько байт можно положить; то, что история уже знает с этим ключом, не копируется вовсе.
 */
export const lookAt = async (
  deps: SyncDeps,
  paths: readonly string[],
  known: ReadonlyMap<string, FileRow>,
  namesFor: (path: string) => NameCheck | null,
  copy: (path: string, bytes: Buffer) => boolean,
  budget: { left: number } | null = null,
): Promise<Map<string, Observation>> => {
  const observed = new Map<string, Observation>()

  const readGroup = async (group: readonly Pending[]) => {
    const sightings = await Promise.all(
      group.map(async (item) => ({
        ...item,
        ...(await readSighting(item.absolute, item.mtimeMs)),
      })),
    )
    const contents = new Map<string, Buffer>()

    for (const { path, seen, bytes } of sightings) {
      observed.set(path, seen)

      if (bytes && seen.kind === 'file' && known.get(path)?.key !== seen.key && copy(path, bytes)) {
        contents.set(seen.key, bytes)
      }
    }

    await deps.blobs.keep(deps.root, contents, budget)
  }

  for (let at = 0; at < paths.length; at += READ_BATCH) {
    const batch = paths.slice(at, at + READ_BATCH)
    const looks = await Promise.all(
      batch.map(async (path) => {
        const absolute = resolveInsideRoot(deps.root, path)

        return (
          absolute && {
            path,
            absolute,
            look: await peek(absolute, known.get(path), namesFor(path)),
          }
        )
      }),
    )
    let group: Pending[] = []
    let bytes = 0

    for (const item of looks) {
      if (!item) continue
      if ('seen' in item.look) {
        observed.set(item.path, item.look.seen)
        continue
      }

      if (group.length > 0 && bytes + item.look.read.size > READ_BYTES_BUDGET) {
        await readGroup(group)
        group = []
        bytes = 0
      }

      group.push({ path: item.path, absolute: item.absolute, ...item.look.read })
      bytes += item.look.read.size
    }

    await readGroup(group)
    if (paths.length > READ_BATCH) await breathe()
  }

  return observed
}

/**
 * Одно событие. «До», которое уже не достать, - «неизвестно»; у удаления тогда и вернуть
 * нечего. Сохранения редактора в течение минуты от первого - одна версия; вернулся к
 * тексту до серии - серии нет.
 */
const record = (
  { store, id }: SyncDeps,
  revision: PlannedRevision,
  available: ReadonlySet<string>,
  now: number,
): void => {
  const previous = revision.previous && available.has(revision.previous) ? revision.previous : null
  const version = revision.cause === 'deleted' ? previous : revision.version
  const last = revision.cause === 'edit' ? store.latest(id, revision.path) : null

  if (
    last?.cause === 'edit' &&
    now - last.startedAt < EDIT_MERGE_MS &&
    last.version === previous &&
    version !== null
  ) {
    if (last.previous === version) store.deleteRevision(last.id)
    else store.extendRevision(last.id, version, now)

    return
  }

  store.addRevision(id, { ...revision, previous, version, at: now, startedAt: now })
}

/** Записать план сверки: сначала переносы, потом строки файлов и события. Ответ - пути событий. */
export const recordPlan = async (deps: SyncDeps, plan: HistoryPlan): Promise<string[]> => {
  if (plan.revisions.length === 0 && plan.rows.length === 0 && plan.drops.length === 0) return []

  const available = await deps.blobs.available(deps.root, plan.previous)
  const now = deps.now()
  const { store, id } = deps

  store.transaction(() => {
    for (const { from, to } of plan.moves) store.moveTree(id, from, to)
    for (const path of plan.drops) store.dropFile(id, path)
    for (const row of plan.rows) store.putFile(id, row)
    for (const revision of plan.revisions) record(deps, revision, available, now)
  })

  return [
    ...new Set(plan.revisions.flatMap(({ path, origin }) => (origin ? [path, origin] : [path]))),
  ]
}

/** Причины сверки: объявленные пишущим заранее и переданные прямо (запись IDE после неё). */
export const causesOf =
  (given: ReadonlyMap<string, HistoryCause>, declared: (path: string) => HistoryCause | null) =>
  (path: string): HistoryCause | null =>
    given.get(path) ?? declared(path)
