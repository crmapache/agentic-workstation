import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { Scenario } from '@shared/scenarios'
import type { TrackerOp, TrackerBoard, TrackerOutcome, TrackerScenario } from '@shared/tracker'

import { JsonFile } from '../storage/json-file'
import type { StoredTracker } from './tracker-book'
import { TrackerBook } from './tracker-book'
import { TrackerRuns } from './tracker-runs'
import { scenariosFake } from './tracker-scenarios-fake'
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
  options: {
    now?: () => number
    remote?: string | null
    book?: TrackerBook
    /** true - срок архива и запуск в срок ждут markSynced, как у машины с облаком. */
    waitForSync?: boolean
  } = {},
) => {
  const book = options.book ?? (await bookIn(options.now))
  const boards: TrackerBoard[] = []
  const service = new TrackerService({
    book,
    events: { onBoard: (board) => boards.push(board) },
    ...(options.now ? { now: options.now } : {}),
    remoteOf: () => Promise.resolve(options.remote ?? null),
    waitForSync: options.waitForSync === true,
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

/**
 * Трекер со связкой очередей на подставных сценариях (время - 7000) и группой «Неделя 1»: card -
 * карточка в ней, со сценарием fix (bound) или без. Закрыть - service.close().
 */
export const runsKit = async (shelf: Scenario[]) => {
  const kit = await trackerKit()
  const fake = scenariosFake(shelf)
  const runs = new TrackerRuns(kit.service, fake.port, () => 7000)
  const projectId = await kit.make({ kind: 'project.create', title: 'P' })
  const flowId = await kit.make({ kind: 'flow.create', projectId, title: 'F' })
  const groupId = await kit.make({ kind: 'group.create', flowId, title: 'Неделя 1' })
  const card = (
    title: string,
    bound: Partial<TrackerScenario> | null,
    extra: { followUpOf?: string; done?: boolean } = {},
  ) =>
    kit.make({
      kind: 'card.create',
      groupId,
      ...(extra.followUpOf ? { followUpOf: extra.followUpOf } : {}),
      fields: {
        title,
        description: `about ${title}`,
        done: extra.done === true,
        scenario: bound
          ? { scenarioId: 'fix', scope: 'project', provider: null, inputs: {}, ...bound }
          : null,
      },
    })

  return { ...kit, ...fake, runs, groupId, card }
}
