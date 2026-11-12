import type { ProviderId } from './providers'
import type { RunSummary } from './scenario-runs'
import type { ScenarioCode, ScenarioScope } from './scenarios'

/**
 * Очередь сценариев («ветка» в словах владельца, Queue в интерфейсе): именованная линия
 * работы проекта со своей очередью и своей папкой - самим проектом или отдельным worktree.
 * Очередей в проекте сколько угодно, и идут они параллельно; внутри очереди - по одному
 * сценарию за раз, следующий видит результат предыдущего.
 */

/** Ждёт, идёт, прошёл (как кончился его прогон). */
export type QueueItemState = 'waiting' | 'running' | 'done' | 'failed' | 'stopped'

/** Один сценарий в очереди - с ответами на вводы и провайдером, выбранными при запуске. */
export type QueueItem = {
  id: string
  scenarioId: string
  scope: ScenarioScope
  scenarioName: string
  inputs: Record<string, string>
  provider: ProviderId
  /** Начинать, только если предыдущий кончился успехом (иначе - после любого конца). */
  afterSuccess: boolean
  addedAt: number
  /** Прогон этого элемента; пусто - ещё не стартовал. */
  runId: string
  state: QueueItemState
  /** Почему не стартовал: очередь стоит на нём с этой причиной. */
  refusal: ScenarioCode | null
}

/**
 * Где работает очередь. Worktree выбирается при создании очереди и один на все её
 * сценарии (решение владельца); после конца остаётся, пока человек не удалит.
 */
export type QueueWorkdir =
  | { kind: 'project' }
  | {
      kind: 'worktree'
      /** Корень worktree - его удаляют и открывают проектом. */
      path: string
      /**
       * Папка проекта внутри worktree - там идут сценарии. Совпадает с path, если проект -
       * корень репозитория; проект-подпапка (apps/desktop) работает в своей подпапке.
       */
      projectDir: string
      gitBranch: string
      /** Коммит, от которого сделан worktree: по нему видно, оставила ли очередь свою работу. */
      baseCommit: string
      /** Человек удалил worktree - очередь остаётся в истории без папки. */
      removed: boolean
    }

/**
 * Почему очередь стоит, хотя в ней есть ждущие: остановка после выбранного сценария,
 * провал перед элементом «только после успеха», отказ старта, IDE закрыли посреди прогона.
 */
export type QueueHoldReason = 'stopAfter' | 'failed' | 'refused' | 'interrupted'

export type QueueHold = { reason: QueueHoldReason; itemId: string; at: number }

/** Чьё имя у очереди: запасное (пока ИИ думает), от ИИ или от человека - его ИИ не трогает. */
export type QueueNameSource = 'fallback' | 'ai' | 'user'

export type ScenarioQueue = {
  id: string
  /** Исходный проект: в нём живут прогоны, по нему доверие и коннекторы. */
  projectPath: string
  name: string
  nameSource: QueueNameSource
  createdAt: number
  /** Закрыта человеком (0 - открыта): уходит в историю и больше не исполняется. */
  closedAt: number
  workdir: QueueWorkdir
  /** По порядку: прошедшие, идущий, ждущие. */
  items: QueueItem[]
  /** «Остановить после» этого элемента; пусто - не останавливать. */
  stopAfterItemId: string
  hold: QueueHold | null
  /**
   * Прошедший элемент, чей неуспех человек уже отпустил (Resume): элемент «только после
   * успеха» за ним больше не ждёт. Пусто - ничего не отпускали.
   */
  acknowledgedItemId: string
}

/** Все очереди всех проектов IDE и сводки идущих прогонов - одним снимком. */
export type ScenarioQueuesView = {
  queues: ScenarioQueue[]
  live: RunSummary[]
}

/** Куда поставить сценарий: в новую очередь (с worktree или без) или в существующую. */
export type QueueTarget = { kind: 'new'; worktree: boolean } | { kind: 'queue'; queueId: string }

export type ScenarioStartRequest = {
  projectPath: string
  scenarioId: string
  scope: string
  inputs: Record<string, string>
  provider: ProviderId
  target: QueueTarget
  afterSuccess: boolean
}

export type ScenarioStartOutcome =
  { ok: true; queueId: string; itemId: string } | { ok: false; code: ScenarioCode; detail?: string }

/** Что сделать с очередью руками. */
export type QueueAction =
  | { kind: 'remove'; itemId: string }
  | { kind: 'move'; itemId: string; by: number }
  | { kind: 'mode'; itemId: string; afterSuccess: boolean }
  /** Остановить после этого элемента; null - снять остановку. */
  | { kind: 'stopAfter'; itemId: string | null }
  | { kind: 'resume' }
  | { kind: 'rename'; name: string }
  /** Убрать все ждущие элементы разом: идущий и прошедшие остаются, очередь не закрывается. */
  | { kind: 'clear' }
  | { kind: 'close' }

/** Что сейчас в worktree очереди - для вопроса перед удалением. */
export type WorktreeFacts = { exists: boolean; dirty: boolean; commitsAhead: number }

export type WorktreeAction = { kind: 'open' } | { kind: 'remove'; force: boolean }

export const isItemOver = (state: QueueItemState): boolean =>
  state === 'done' || state === 'failed' || state === 'stopped'
