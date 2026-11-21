import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { TrackerOp, TrackerBoard, TrackerOutcome } from '@shared/tracker'

import { JsonFile } from '../storage/json-file'
import type { StoredTracker } from './tracker-book'
import { TrackerBook } from './tracker-book'
import { TrackerService } from './tracker-service'
import type { TrackerPlace } from './tracker-spaces'

/** Проект IDE для проверок трекера. */
export const PLACE: TrackerPlace = { rootPath: '/work/app', name: 'app', home: false }

/** Книга во временной папке: настоящий файл, как в IDE. */
export const bookIn = async (now: () => number = Date.now) => {
  const dir = await mkdtemp(join(tmpdir(), 'aw-tracker-'))

  return TrackerBook.load(new JsonFile<StoredTracker>(join(dir, 'tracker.json')), now)
}

/**
 * Трекер на временной книге с подставным origin: правки по одной, доска последней правки и
 * доски, ушедшие в окно.
 */
export const trackerKit = async (
  options: { now?: () => number; remote?: string | null; book?: TrackerBook } = {},
) => {
  const book = options.book ?? (await bookIn(options.now))
  const boards: TrackerBoard[] = []
  const service = new TrackerService({
    book,
    events: { onBoard: (board) => boards.push(board) },
    ...(options.now ? { now: options.now } : {}),
    remoteOf: () => Promise.resolve(options.remote ?? null),
  })
  const apply = async (op: TrackerOp, place: TrackerPlace = PLACE) => {
    const outcome: TrackerOutcome = await service.apply(place, op)

    if (!outcome.ok) throw new Error(`отказ ${outcome.code}`)

    return outcome
  }
  /** id созданного правкой. */
  const make = async (op: TrackerOp, place: TrackerPlace = PLACE) => {
    const { created } = await apply(op, place)

    if (!created) throw new Error('ничего не создано')

    return created
  }

  return { book, service, boards, apply, make }
}
