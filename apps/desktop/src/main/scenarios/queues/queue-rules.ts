import type { QueueItem, ScenarioQueue, QueueNameSource } from '@shared/scenario-queues'
import { isItemOver } from '@shared/scenario-queues'
import type { RunState } from '@shared/scenario-runs'
import type { ScenarioCode } from '@shared/scenarios'

/**
 * Очередь сценариев - арифметикой, без процессов и диска: что очередь делает сейчас и как
 * она меняется от каждого события. Так каждое правило проверяется тестом, а сервис только
 * исполняет решения.
 *
 * Главное правило: внутри очереди одновременно идёт не больше одного сценария, и ничего не
 * стартует, пока очередь стоит (`hold`). Встаёт она сама в трёх случаях - кончился элемент с
 * «остановить после», провал перед элементом «только после успеха», элемент не стартовал - и
 * четвёртый при перезапуске IDE посреди прогона. Дальше решает человек: Resume.
 */

/** Чем кончился прогон элемента - его состояние в очереди. */
export type ItemOutcome = 'done' | 'failed' | 'stopped'

/** Идёт ли в очереди сценарий сейчас. */
export const runningItem = (queue: ScenarioQueue): QueueItem | null =>
  queue.items.find((item) => item.state === 'running') ?? null

/** Последний прошедший элемент - тот, чей исход решает за следующего «только после успеха». */
const lastOver = (queue: ScenarioQueue): QueueItem | null =>
  queue.items.filter((item) => isItemOver(item.state)).at(-1) ?? null

/**
 * Следующий ждёт успеха, а прошедший перед ним не удался и человек его не отпускал. Так
 * бывает, когда элемент поставили уже после провала: в момент провала ждущих не было, и
 * очередь не встала.
 */
const blockedByFailure = (queue: ScenarioQueue, next: QueueItem): QueueItem | null => {
  const before = lastOver(queue)

  return next.afterSuccess &&
    before &&
    before.state !== 'done' &&
    before.id !== queue.acknowledgedItemId
    ? before
    : null
}

/** Следующий, кто стартует сейчас; null - очередь стоит, занята, закрыта или пуста. */
export const nextToStart = (queue: ScenarioQueue): QueueItem | null => {
  if (queue.closedAt > 0 || queue.hold || runningItem(queue)) return null

  const next = queue.items.find((item) => item.state === 'waiting') ?? null

  return next && !blockedByFailure(queue, next) ? next : null
}

/**
 * Очередь свободна, а следующий не может стартовать из-за неуспеха перед ним - встать с той
 * же причиной, что при провале: человек решает, идти ли дальше. Иначе - та же очередь.
 */
export const holdBeforeFailure = (queue: ScenarioQueue, now: number): ScenarioQueue => {
  if (queue.closedAt > 0 || queue.hold || runningItem(queue)) return queue

  const next = queue.items.find((item) => item.state === 'waiting')
  const failed = next && blockedByFailure(queue, next)

  return failed ? { ...queue, hold: { reason: 'failed', itemId: failed.id, at: now } } : queue
}

const patchItem = (
  queue: ScenarioQueue,
  itemId: string,
  patch: Partial<QueueItem>,
): ScenarioQueue => ({
  ...queue,
  items: queue.items.map((item) => (item.id === itemId ? { ...item, ...patch } : item)),
})

/** Элемент стартовал прогоном runId. */
export const markStarted = (queue: ScenarioQueue, itemId: string, runId: string): ScenarioQueue =>
  patchItem(queue, itemId, { state: 'running', runId, refusal: null })

/**
 * Элемент не стартовал: остаётся первым с причиной, очередь стоит. Выброшенный, он просто
 * не случился бы, и человек об этом не узнал бы.
 */
export const markRefused = (
  queue: ScenarioQueue,
  itemId: string,
  code: ScenarioCode,
  now: number,
): ScenarioQueue => ({
  ...patchItem(queue, itemId, { refusal: code }),
  hold: { reason: 'refused', itemId, at: now },
})

/**
 * Прогон элемента кончился. Остановка «после этого» срабатывает при любом исходе: человек
 * хотел, чтобы после него ничего не начиналось. Провал останавливает очередь, только если
 * следующий ждёт успеха, - иначе он и не просил ждать.
 */
export const settleItem = (
  queue: ScenarioQueue,
  itemId: string,
  outcome: ItemOutcome,
  now: number,
): ScenarioQueue => {
  const settled = patchItem(queue, itemId, { state: outcome })

  if (queue.stopAfterItemId === itemId) {
    return { ...settled, stopAfterItemId: '', hold: { reason: 'stopAfter', itemId, at: now } }
  }

  const next = settled.items.find((item) => item.state === 'waiting')

  if (outcome !== 'done' && next?.afterSuccess) {
    return { ...settled, hold: { reason: 'failed', itemId, at: now } }
  }

  return settled
}

/** Resume: снять остановку; отказ старта первого ждущего забывается - пусть попробует снова. */
export const resumeQueue = (queue: ScenarioQueue): ScenarioQueue => {
  const first = queue.items.find((item) => item.state === 'waiting')
  // Resume после неуспеха - «иди дальше всё равно»: элемент «после успеха» за ним не ждёт.
  const acknowledgedItemId =
    queue.hold && queue.hold.reason !== 'refused' ? queue.hold.itemId : queue.acknowledgedItemId
  const resumed = { ...queue, hold: null, acknowledgedItemId }

  return first ? patchItem(resumed, first.id, { refusal: null }) : resumed
}

/**
 * «Остановить после»: идущего («после текущего») или ждущего («после этого»). Прошедший
 * элемент остановкой не помечается - после него уже идёт следующий. null снимает отметку.
 */
export const setStopAfter = (queue: ScenarioQueue, itemId: string | null): ScenarioQueue => {
  if (itemId === null) return { ...queue, stopAfterItemId: '' }

  const item = queue.items.find((one) => one.id === itemId)

  if (!item || isItemOver(item.state)) return queue

  return { ...queue, stopAfterItemId: itemId }
}

/** Поставить в конец. В закрытую очередь не ставят - она в истории. */
export const addItem = (queue: ScenarioQueue, item: QueueItem): ScenarioQueue =>
  queue.closedAt > 0 ? queue : { ...queue, items: [...queue.items, item] }

/** Убрать ждущий элемент; его остановка и отказ уходят вместе с ним. */
export const removeItem = (queue: ScenarioQueue, itemId: string): ScenarioQueue => {
  const item = queue.items.find((one) => one.id === itemId)

  if (!item || item.state !== 'waiting') return queue

  return {
    ...queue,
    items: queue.items.filter((one) => one.id !== itemId),
    stopAfterItemId: queue.stopAfterItemId === itemId ? '' : queue.stopAfterItemId,
    hold: queue.hold?.reason === 'refused' && queue.hold.itemId === itemId ? null : queue.hold,
  }
}

/** Сдвинуть ждущий элемент среди ждущих: прошедшие и идущий на месте. */
export const moveItem = (queue: ScenarioQueue, itemId: string, by: number): ScenarioQueue => {
  const waiting = queue.items.filter((item) => item.state === 'waiting')
  const from = waiting.findIndex((item) => item.id === itemId)

  if (from < 0 || by === 0) return queue

  const to = Math.max(0, Math.min(waiting.length - 1, from + by))
  const moved = [...waiting]
  const [item] = moved.splice(from, 1)

  if (!item || to === from) return queue

  moved.splice(to, 0, item)

  return { ...queue, items: [...queue.items.filter((one) => one.state !== 'waiting'), ...moved] }
}

export const setAfterSuccess = (
  queue: ScenarioQueue,
  itemId: string,
  afterSuccess: boolean,
): ScenarioQueue => patchItem(queue, itemId, { afterSuccess })

/** Имя от человека главнее имени от ИИ; ИИ не перебивает человека. Пустое - вернуть ИИ. */
export const renameQueue = (
  queue: ScenarioQueue,
  name: string,
  source: QueueNameSource,
): ScenarioQueue => {
  const clean = name.replace(/\s+/g, ' ').trim().slice(0, 80)

  if (source !== 'user' && queue.nameSource === 'user') return queue
  if (!clean && source !== 'user') return queue

  // Пустое имя от человека отдаёт имя обратно: запасное сразу, ИИ - следом (QueueRunner).
  if (!clean) {
    const first = queue.items[0]

    return {
      ...queue,
      name: first ? fallbackName(first.scenarioName, first.inputs) : queue.name,
      nameSource: 'fallback',
    }
  }

  return { ...queue, name: clean, nameSource: source }
}

/** Закрыть можно только то, что не идёт: идущий прогон сначала останавливают. */
export const closeQueue = (queue: ScenarioQueue, now: number): ScenarioQueue | null =>
  runningItem(queue) ? null : { ...queue, closedAt: now, stopAfterItemId: '' }

/**
 * Продолжить прогон элемента, который кончился (остановлен, упал): только последнего
 * прошедшего, пока за ним ничего не стартовало, - иначе папка уже ушла вперёд.
 */
export const reopenItem = (queue: ScenarioQueue, itemId: string): ScenarioQueue | null => {
  if (queue.closedAt > 0 || runningItem(queue)) return null

  const over = queue.items.filter((item) => isItemOver(item.state))
  const last = over.at(-1)

  if (!last || last.id !== itemId || last.state === 'done') return null

  // Очередь стояла «после него» (остановка рукой или «Stop after current»): продолженный, он
  // снова кончится остановкой, а не запуском следующего без Resume.
  const stopAfterItemId =
    queue.hold?.reason === 'stopAfter' && queue.hold.itemId === itemId
      ? itemId
      : queue.stopAfterItemId

  return { ...patchItem(queue, itemId, { state: 'running' }), hold: null, stopAfterItemId }
}

/**
 * IDE поднялась: элемент, который «идёт» без живого прогона, - прогон оборвался вместе с
 * IDE (при выходе он пишется остановленным, при падении - упавшим). Очередь при этом
 * встаёт, если за ним кто-то ждёт: сама она без человека ничего не начинает.
 */
export const recoverQueue = (
  queue: ScenarioQueue,
  stateOf: (runId: string) => RunState | null,
  now: number,
): ScenarioQueue => {
  const running = runningItem(queue)

  if (!running) return queue

  const state = running.runId ? stateOf(running.runId) : null
  const outcome: ItemOutcome = state === 'done' || state === 'failed' ? state : 'stopped'
  const settled = patchItem(queue, running.id, { state: outcome })
  const waiting = settled.items.some((item) => item.state === 'waiting')

  return waiting
    ? { ...settled, hold: { reason: 'interrupted', itemId: running.id, at: now } }
    : settled
}

/** Имя, пока ИИ думает: сценарий и первый непустой ответ - так очереди уже различимы. */
export const fallbackName = (scenarioName: string, inputs: Record<string, string>): string => {
  const answer =
    Object.values(inputs)
      .find((value) => value.trim())
      ?.trim() ?? ''
  const tail = /^https?:\/\//.test(answer)
    ? (answer.split('/').filter(Boolean).at(-1) ?? '')
    : answer
  const short = tail.length > 40 ? `${tail.slice(0, 40)}...` : tail

  return short ? `${scenarioName} · ${short}` : scenarioName
}
