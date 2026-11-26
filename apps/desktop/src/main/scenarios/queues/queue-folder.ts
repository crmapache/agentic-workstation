import type { QueueTurn, ScenarioQueue, QueueFolderLine } from '@shared/scenario-queues'
import type { RunState } from '@shared/scenario-runs'

import { stuckItem, nextToStart, runningItem, recoverQueue } from './queue-rules'

/**
 * Папка проекта и очереди без worktree (ADR 0128) - чистыми правилами, как остальная очередь.
 * Такие очереди одного проекта делят одно рабочее дерево и обслуживаются им по одной: папку держит
 * та, чья работа в ней идёт, остальные с ждущими элементами ждут своей очереди в том порядке, в
 * каком встали в ожидание. Очереди в своих worktree этих правил не касаются.
 *
 * Держатель - открытая очередь без worktree, у которой идёт элемент (и на паузе - от человека или
 * от рабочих часов), или она стоит на недоделанном (то же правило, что внутри очереди, ADR 0082:
 * начинать поверх незаконченной работы нельзя), или папка уже её (`turn` holding) и ей есть что
 * начать прямо сейчас - между своими элементами держатель папку не отдаёт. Отпускает, когда
 * начать больше нечего: сделала последний, встала «после» сделанного, ждущих убрали, уснула вне
 * часов без прогона на паузе, её закрыли.
 */

/** Очередь работает прямо в папке своего проекта и делит её с такими же. */
export const sharesFolder = (queue: ScenarioQueue): boolean =>
  queue.closedAt === 0 && queue.workdir.kind === 'project'

/** Другая очередь в той же папке проекта. */
const sameFolder = (left: ScenarioQueue, right: ScenarioQueue): boolean =>
  left.id !== right.id &&
  left.projectPath === right.projectPath &&
  sharesFolder(left) &&
  sharesFolder(right)

/** Работа очереди уже в папке: идёт её элемент или стоит её недоделанный. */
const hasWorkInFolder = (queue: ScenarioQueue): boolean =>
  runningItem(queue) !== null || stuckItem(queue) !== null

/** Держит ли очередь папку проекта сейчас. */
export const holdsFolder = (queue: ScenarioQueue, now: number): boolean =>
  sharesFolder(queue) &&
  (hasWorkInFolder(queue) || (queue.turn?.kind === 'holding' && nextToStart(queue, now) !== null))

/**
 * Стоит ли очередь в ожидании папки: встала туда и ей по-прежнему есть что начать. Отдыхающая вне
 * рабочих часов, вставшая и опустевшая места не занимают, даже если их запись ещё не поправлена.
 */
export const inLine = (queue: ScenarioQueue, now: number): boolean =>
  sharesFolder(queue) &&
  queue.turn?.kind === 'waiting' &&
  !hasWorkInFolder(queue) &&
  nextToStart(queue, now) !== null

/** Раньше в ожидании - кто раньше встал; в один миг - кто раньше создан, дальше по id. */
const isBefore = (left: ScenarioQueue, right: ScenarioQueue): boolean => {
  const leftAt = left.turn?.at ?? 0
  const rightAt = right.turn?.at ?? 0

  if (leftAt !== rightAt) return leftAt < rightAt
  if (left.createdAt !== right.createdAt) return left.createdAt < right.createdAt

  return left.id < right.id
}

const sameTurn = (left: QueueTurn | null, right: QueueTurn | null): boolean =>
  left?.kind === right?.kind && left?.at === right?.at

const withTurn = (queue: ScenarioQueue, turn: QueueTurn | null): ScenarioQueue =>
  sameTurn(queue.turn, turn) ? queue : { ...queue, turn }

/**
 * Место очереди у папки на сейчас - перед её шагом и после всего, что меняет её ждущих. Держатель
 * остаётся держателем. Ждущая получает папку, когда держателей нет, а впереди в ожидании никого;
 * той, что встаёт впервые (новая, дописанная после простоя, проснувшаяся), - то же, иначе она
 * встаёт в конец. Очереди, которой нечего начать, папка не нужна: она её отпускает и места в
 * ожидании не держит.
 */
export const takeTurn = (
  queue: ScenarioQueue,
  queues: readonly ScenarioQueue[],
  now: number,
): ScenarioQueue => {
  if (!sharesFolder(queue)) return withTurn(queue, null)
  if (hasWorkInFolder(queue)) {
    return withTurn(
      queue,
      queue.turn?.kind === 'holding' ? queue.turn : { kind: 'holding', at: now },
    )
  }

  if (!nextToStart(queue, now)) return withTurn(queue, null)
  if (queue.turn?.kind === 'holding') return queue

  const others = queues.filter((other) => sameFolder(other, queue))
  const isTaken = others.some((other) => holdsFolder(other, now))
  const isWaiting = queue.turn?.kind === 'waiting'
  const ahead = others.filter(
    (other) => inLine(other, now) && (!isWaiting || isBefore(other, queue)),
  )

  if (!isTaken && ahead.length === 0) return withTurn(queue, { kind: 'holding', at: now })
  if (isWaiting) return queue

  // В конец: позже всех, кто уже ждёт, - даже вставшие в тот же миг пойдут в порядке прихода.
  const last = Math.max(0, ...ahead.map((other) => other.turn?.at ?? 0))

  return withTurn(queue, { kind: 'waiting', at: Math.max(now, last + 1) })
}

/**
 * Место у папки, которое больше не правда, - снять: держала, а держать нечем (IDE закрыли, когда
 * элемент уже кончился сделанным, и очередь встала), ждала, а начать нечего. Без этого очередь,
 * которую сразу после запуска IDE пустят Resume, взяла бы папку по старой записи мимо ждущих.
 * Новых мест не даёт: их раздаёт шаг (`takeTurn`).
 */
export const settleTurn = (queue: ScenarioQueue, now: number): ScenarioQueue => {
  const stale =
    (queue.turn?.kind === 'holding' && !holdsFolder(queue, now)) ||
    (queue.turn?.kind === 'waiting' && !inLine(queue, now))

  return stale ? { ...queue, turn: null } : queue
}

/** Очередь после перезапуска IDE (`recoverQueue`) - с местом у папки, которое осталось правдой. */
export const recoverWithTurn = (
  queue: ScenarioQueue,
  stateOf: (runId: string) => RunState | null,
  now: number,
): ScenarioQueue => settleTurn(recoverQueue(queue, stateOf, now), now)

/** Может ли очередь начинать сейчас: у неё свой worktree или папка проекта её. */
export const hasTurn = (queue: ScenarioQueue): boolean =>
  !sharesFolder(queue) || queue.turn?.kind === 'holding'

/**
 * «Запустить рядом сразу» - выбор человека: очередь берёт папку, не дожидаясь держателей и тех,
 * кто ждёт впереди; их порядок не меняется. Начать ей нечего или папка и так её - та же очередь.
 */
export const runAlongside = (queue: ScenarioQueue, now: number): ScenarioQueue =>
  sharesFolder(queue) &&
  queue.turn?.kind !== 'holding' &&
  !hasWorkInFolder(queue) &&
  nextToStart(queue, now) !== null
    ? { ...queue, turn: { kind: 'holding', at: now } }
    : queue

/** Кто ждёт папку проекта, по порядку: первая начнёт, когда держателей не останется. */
export const folderLine = (
  queues: readonly ScenarioQueue[],
  projectPath: string,
  now: number,
): ScenarioQueue[] =>
  queues
    .filter((queue) => queue.projectPath === projectPath && inLine(queue, now))
    .sort((left, right) => (isBefore(left, right) ? -1 : 1))

/** Свободна ли папка проекта: её никто не держит и никто не ждёт - новая очередь начнёт сразу. */
export const isFolderFree = (
  queues: readonly ScenarioQueue[],
  projectPath: string,
  now: number,
): boolean =>
  !queues.some(
    (queue) => queue.projectPath === projectPath && (holdsFolder(queue, now) || inLine(queue, now)),
  )

/** Занятые папки проектов - для окна, телефона и модели: кто держит и кто ждёт по порядку. */
export const folderLines = (queues: readonly ScenarioQueue[], now: number): QueueFolderLine[] => {
  const paths = new Set(
    queues
      .filter((queue) => holdsFolder(queue, now) || inLine(queue, now))
      .map((queue) => queue.projectPath),
  )

  return [...paths].map((projectPath) => ({
    projectPath,
    holders: queues
      .filter((queue) => queue.projectPath === projectPath && holdsFolder(queue, now))
      .map((queue) => queue.id),
    line: folderLine(queues, projectPath, now).map((queue) => queue.id),
  }))
}
