import type { QueueItem, ScenarioQueue, QueueNameSource } from '@shared/scenario-queues'
import { isItemOver } from '@shared/scenario-queues'
import type { RunState } from '@shared/scenario-runs'
import type { ScenarioCode } from '@shared/scenarios'

import { isResting, forgetNapRun } from './queue-nap'

/**
 * Очередь сценариев - арифметикой, без процессов и диска: что очередь делает сейчас и как
 * она меняется от каждого события. Так каждое правило проверяется тестом, а сервис только
 * исполняет решения.
 *
 * Главное правило: внутри очереди одновременно идёт не больше одного сценария, и следующий
 * стартует только после сделанного - предыдущий кончился успехом или человек пометил его
 * выполненным (ADR 0082). Упавший или остановленный держит всех за собой, пока его прогон не
 * продолжат с места или не пометят выполненным. Ничего не стартует и пока очередь стоит
 * (`hold`). Встаёт она сама в трёх случаях - кончился элемент с «остановить после», элемент
 * кончился несделанным, элемент не стартовал - и четвёртый при перезапуске IDE посреди
 * прогона. Дальше решает человек.
 */

/** Чем кончился прогон элемента - его состояние в очереди. */
export type ItemOutcome = 'done' | 'failed' | 'stopped'

/** Идёт ли в очереди сценарий сейчас. */
export const runningItem = (queue: ScenarioQueue): QueueItem | null =>
  queue.items.find((item) => item.state === 'running') ?? null

/**
 * Прошедшие сценарии по порядку. Пропущенная пометка - не сценарий: её исход ничего не решает,
 * и после неё «последним» остаётся сценарий перед ней.
 */
const passedRuns = (queue: ScenarioQueue): QueueItem[] =>
  queue.items.filter((item) => isItemOver(item.state) && !item.placeholder)

/** Последний прошедший сценарий - тот, чей исход решает, можно ли начинать следующий. */
const lastOver = (queue: ScenarioQueue): QueueItem | null => passedRuns(queue).at(-1) ?? null

const hasWaiting = (queue: ScenarioQueue): boolean =>
  queue.items.some((item) => item.state === 'waiting')

/**
 * Последний прошедший, если он не сделан (упал, остановлен): мимо него очередь не идёт, пока его
 * не продолжат с места или не пометят выполненным. Следующий работает в той же папке - начать
 * после недоделанного значит начать поверх чужой незаконченной работы.
 */
const stuckItem = (queue: ScenarioQueue): QueueItem | null => {
  const last = lastOver(queue)

  return last && last.state !== 'done' ? last : null
}

/**
 * Следующий, кто стартует сейчас; null - очередь стоит, занята, закрыта, пуста, отдыхает вне
 * рабочих часов или перед ждущими недоделанный.
 */
export const nextToStart = (queue: ScenarioQueue, now: number): QueueItem | null => {
  if (queue.closedAt > 0 || queue.hold || runningItem(queue) || isResting(queue, now)) return null
  if (stuckItem(queue)) return null

  return queue.items.find((item) => item.state === 'waiting') ?? null
}

/**
 * Очередь дошла до пометок (карточек без сценария): пройти мимо всех, что стоят первыми, - они
 * становятся skipped, и следующим стартует сценарий за ними. Не дошла (стоит, занята, отдыхает) -
 * та же очередь: пометка ждёт своей очереди, как сценарий.
 */
export const passPlaceholders = (queue: ScenarioQueue, now: number): ScenarioQueue => {
  let passed = queue
  let next = nextToStart(passed, now)

  while (next?.placeholder) {
    passed = patchItem(passed, next.id, { state: 'skipped' })
    next = nextToStart(passed, now)
  }

  return passed
}

/**
 * Очередь свободна, ждущий есть, а перед ним недоделанный - встать с той же причиной, что при
 * провале: так бывает, когда элемент поставили уже после провала (в момент провала ждущих не
 * было, и очередь не встала). Иначе - та же очередь. Отдыхающая вне рабочих часов не решает
 * ничего: за ней может ждать прогон, оборванный выходом IDE, - его продолжат утром, и это не
 * провал.
 */
export const holdBeforeFailure = (queue: ScenarioQueue, now: number): ScenarioQueue => {
  if (queue.closedAt > 0 || queue.hold || runningItem(queue) || isResting(queue, now)) return queue

  const stuck = hasWaiting(queue) ? stuckItem(queue) : null

  return stuck ? { ...queue, hold: { reason: 'failed', itemId: stuck.id, at: now } } : queue
}

/**
 * Кого поднимает Resume: недоделанный, за которым ждут, - его прогон продолжается с карточки, где
 * встал. Ждущих нет - очереди идти некуда, Resume только убирает полосу, а сам прогон продолжают
 * из его окна.
 */
export const resumeTarget = (queue: ScenarioQueue): QueueItem | null =>
  queue.closedAt === 0 && hasWaiting(queue) ? stuckItem(queue) : null

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
 * Прогон элемента кончился. Несделанный, за которым ждут, ставит очередь: дальше - только после
 * продолжения или отметки «выполнено». Его отметка «остановить после» остаётся за ним:
 * продолженный и доделанный, он остановит очередь, как человек и просил. Сделанный с отметкой
 * останавливает очередь после себя.
 */
export const settleItem = (
  queue: ScenarioQueue,
  itemId: string,
  outcome: ItemOutcome,
  now: number,
): ScenarioQueue => {
  const settled = patchItem(queue, itemId, { state: outcome })

  if (outcome !== 'done' && hasWaiting(settled)) {
    return { ...settled, hold: { reason: 'failed', itemId, at: now } }
  }

  if (queue.stopAfterItemId === itemId) {
    return { ...settled, stopAfterItemId: '', hold: { reason: 'stopAfter', itemId, at: now } }
  }

  return settled
}

/**
 * Resume: снять остановку; отказ старта первого ждущего забывается - пусть попробует снова. Мимо
 * недоделанного Resume не ведёт: его прогон продолжает исполнитель (resumeTarget), а снятая здесь
 * остановка встала бы снова на следующем шаге.
 */
export const resumeQueue = (queue: ScenarioQueue): ScenarioQueue => {
  const first = queue.items.find((item) => item.state === 'waiting')
  const resumed = { ...queue, hold: null }

  return first ? patchItem(resumed, first.id, { refusal: null }) : resumed
}

/**
 * Пометить выполненным руками: прогон упал или его остановили, а работу человек доделал сам (в
 * разговоре головы, в своей вкладке). Дальше элемент - успех: после него можно начинать следующий.
 * Но очередь сама не трогается: стояла на нём - встаёт «после него» и ждёт Resume, как
 * после остановки рукой; человек мог ещё не решить, что запускать следом. Прогон в истории
 * остаётся каким был.
 */
export const markDoneByHand = (
  queue: ScenarioQueue,
  itemId: string,
  now: number,
): ScenarioQueue => {
  const item = queue.items.find((one) => one.id === itemId)

  if (!item || (item.state !== 'failed' && item.state !== 'stopped')) return queue

  const marked = {
    ...patchItem(queue, itemId, { state: 'done', doneByHand: true }),
    // Отметка «остановить после» на прошедшем уже ничего не остановит: очередь, стоявшая на нём,
    // встаёт после него и без неё.
    stopAfterItemId: queue.stopAfterItemId === itemId ? '' : queue.stopAfterItemId,
  }

  if (queue.hold?.itemId !== itemId) return marked

  return { ...marked, hold: hasWaiting(marked) ? { reason: 'stopAfter', itemId, at: now } : null }
}

/**
 * «Остановить после»: идущего («после текущего») или ждущего («после этого»). Прошедший
 * элемент остановкой не помечается - после него уже идёт следующий. null снимает отметку.
 */
export const setStopAfter = (queue: ScenarioQueue, itemId: string | null): ScenarioQueue => {
  if (itemId === null) return { ...queue, stopAfterItemId: '' }

  const item = queue.items.find((one) => one.id === itemId)

  // Мимо пометки очередь проходит, не останавливаясь: остановку ставят на сценарий.
  if (!item || isItemOver(item.state) || item.placeholder) return queue

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

/**
 * Убрать все ждущие («drop what is left»): очередь, вставшая на неудачном прогоне, ночью - и
 * человеку с телефона нужен ответ «дальше не надо» одним нажатием, а не по элементу. Идущий и
 * прошедшие на месте; остановка «после ждущего» и отказ старта ждущего уходят вместе с ним.
 * Ждущих нет - очередь та же (ничего не поменялось).
 */
export const clearWaiting = (queue: ScenarioQueue): ScenarioQueue => {
  const waiting = new Set(
    queue.items.filter((item) => item.state === 'waiting').map((item) => item.id),
  )

  if (waiting.size === 0) return queue

  return {
    ...queue,
    items: queue.items.filter((item) => !waiting.has(item.id)),
    stopAfterItemId: waiting.has(queue.stopAfterItemId) ? '' : queue.stopAfterItemId,
    hold: queue.hold?.reason === 'refused' && waiting.has(queue.hold.itemId) ? null : queue.hold,
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
    const first = queue.items.find((item) => !item.placeholder) ?? queue.items[0]

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
 * прошедшего сценария, пока за ним ничего не стартовало, - иначе папка уже ушла вперёд.
 */
export const reopenItem = (queue: ScenarioQueue, itemId: string): ScenarioQueue | null => {
  if (queue.closedAt > 0 || runningItem(queue)) return null

  const last = lastOver(queue)

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
 * встаёт, если за ним кто-то ждёт: сама она без человека ничего не начинает. Исключение -
 * прогон, который на паузу поставили рабочие часы: его очередь продолжит, проснувшись.
 */
export const recoverQueue = (
  queue: ScenarioQueue,
  stateOf: (runId: string) => RunState | null,
  now: number,
): ScenarioQueue => {
  const running = runningItem(queue)

  if (!running) return queue

  const state = running.runId ? stateOf(running.runId) : null

  // Прогон спал по рабочим часам: человек его не останавливал - очередь продолжит его сама,
  // когда окно откроется (ADR 0074), и не ждёт Resume. IDE упала, а не вышла, - запись прогона
  // помечена упавшей, но на паузе ему нечем было упасть: он остановлен, а не провален.
  if (running.runId && queue.nap?.runId === running.runId && state !== 'done') {
    return patchItem(queue, running.id, { state: 'stopped' })
  }

  const outcome: ItemOutcome = state === 'done' || state === 'failed' ? state : 'stopped'
  const settled = patchItem(queue, running.id, { state: outcome })
  const waiting = settled.items.some((item) => item.state === 'waiting')
  const forgotten = forgetNapRun(settled, running.runId)

  return waiting
    ? { ...forgotten, hold: { reason: 'interrupted', itemId: running.id, at: now } }
    : forgotten
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
