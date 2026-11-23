import type { ProviderId } from './providers'
import type { RunSummary } from './scenario-runs'
import type { ScenarioCode, ScenarioScope } from './scenarios'
import { DAY_MS } from './time-units'

/**
 * Очередь сценариев («ветка» в словах владельца, Queue в интерфейсе): именованная линия
 * работы проекта со своей очередью и своей папкой - самим проектом или отдельным worktree.
 * Очередей в проекте сколько угодно, и идут они параллельно; внутри очереди - по одному
 * сценарию за раз, следующий видит результат предыдущего и стартует, только когда тот сделан.
 */

/**
 * Ждёт, идёт, прошёл (как кончился его прогон). skipped - пометка (placeholder), мимо которой
 * очередь прошла: прогона у неё не было и не будет.
 */
export type QueueItemState = 'waiting' | 'running' | 'done' | 'failed' | 'stopped' | 'skipped'

/**
 * Модель и усилие сессии прогона - какими их поднимет провайдер: пустые поля сценария уже
 * заменены моделью и усилием новой вкладки, чужая провайдеру модель - его моделью. Пусто - решает
 * сам CLI (его модель или усилие по умолчанию).
 */
export type RunsOn = { model: string; effort: string }

/** Один сценарий в очереди - с ответами на вводы и провайдером, выбранными при запуске. */
export type QueueItem = {
  id: string
  scenarioId: string
  scope: ScenarioScope
  scenarioName: string
  inputs: Record<string, string>
  provider: ProviderId
  addedAt: number
  /** Прогон этого элемента; пусто - ещё не стартовал. */
  runId: string
  /**
   * На чём идёт сценарий: голова и каждая карточка, разные пары по порядку - голова первой. У
   * ждущего - по сценарию на полке (правка сценария его обновляет), у стартовавшего - по снимку,
   * с которым прогон пошёл. Нет поля - пометка или элемент старого выпуска, который ещё не
   * пересчитали.
   */
  runsOn?: RunsOn[] | undefined
  state: QueueItemState
  /** Почему не стартовал: очередь стоит на нём с этой причиной. */
  refusal: ScenarioCode | null
  /**
   * Прогон упал или его остановили, а работу человек доделал сам и пометил элемент выполненным.
   * Сам прогон в истории остаётся каким был.
   */
  doneByHand?: boolean
  /**
   * Пометка, а не сценарий: карточка трекера без сценария, ушедшая в очередь вместе со своей
   * колонкой (ADR 0101). Стоит на своём месте, чтобы очередь читалась как колонка, ничего не
   * запускает; дойдя до неё, очередь проходит мимо - элемент становится skipped. scenarioName -
   * заголовок карточки, сценария и ответов нет.
   */
  placeholder?: boolean
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
 * Почему очередь стоит, хотя в ней есть ждущие: остановка после выбранного сценария, элемент
 * кончился несделанным (упал, остановлен), отказ старта, IDE закрыли посреди прогона.
 */
export type QueueHoldReason = 'stopAfter' | 'failed' | 'refused' | 'interrupted'

export type QueueHold = { reason: QueueHoldReason; itemId: string; at: number }

/**
 * Рабочие часы очереди (ADR 0074): окно по дням недели в местном времени машины. Вне окна
 * очередь спит - идущий прогон на паузе, следующий не берётся, - в начале окна просыпается сама.
 */
export type QueueHours = {
  /** Начало и конец окна - минуты от полуночи; конец раньше начала - окно через полночь. */
  from: number
  to: number
  /** Дни, в которые окно открывается: 1 - понедельник, 7 - воскресенье. */
  days: number[]
}

/**
 * Очередь спит вне рабочих часов. Одна дремота на промежуток между окнами: человек снял прогон
 * с паузы ночью - часы его не трогают до следующего конца окна.
 */
export type QueueNap = {
  /** Когда уснула. */
  at: number
  /** Когда проснётся: начало ближайшего окна. */
  until: number
  /**
   * Прогон, который на паузу поставили часы, а не человек: проснувшись, очередь снимет его с
   * паузы, а оборванный выходом IDE - продолжит. Пусто - часы ничего не останавливали.
   */
  runId: string
}

/** Чьё имя у очереди: запасное (пока ИИ думает), от ИИ или от человека - его ИИ не трогает. */
export type QueueNameSource = 'fallback' | 'ai' | 'user'

export type ScenarioQueue = {
  id: string
  /** Исходный проект: в нём живут прогоны, по нему доверие и коннекторы. */
  projectPath: string
  name: string
  nameSource: QueueNameSource
  createdAt: number
  /**
   * Когда с очередью последний раз что-то случилось: поставили сценарий, он стартовал или
   * кончился, человек её поправил. Сон по рабочим часам и имя от ИИ - не дело. Открытая очередь
   * без дела дольше двух недель закрывается сама (QUEUE_IDLE_CLOSE_MS).
   */
  activeAt: number
  /**
   * Закрыта (0 - открыта) человеком или сама, после двух недель без дела: уходит в историю и
   * больше не исполняется.
   */
  closedAt: number
  workdir: QueueWorkdir
  /** По порядку: прошедшие, идущий, ждущие. */
  items: QueueItem[]
  /** «Остановить после» этого элемента; пусто - не останавливать. */
  stopAfterItemId: string
  hold: QueueHold | null
  /** Рабочие часы; null - очередь работает в любое время. */
  hours: QueueHours | null
  /** Спит вне рабочих часов; null - не спит. */
  nap: QueueNap | null
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
  /**
   * Рабочие часы новой очереди - до её первого шага: вне часов она встаёт спящей и первый
   * сценарий не стартует (ADR 0090, очередь «на завтра» от ИИ). У существующей очереди не читается.
   */
  hours?: QueueHours | null | undefined
}

/**
 * Пометка в очередь (QueueItem.placeholder): заголовок карточки на её месте. Новую очередь
 * пометка открывает, только если в той же отправке за ней идут сценарии; provider - их
 * исполнитель: им готовится worktree новой очереди.
 */
export type QueuePlaceholderRequest = {
  projectPath: string
  title: string
  provider: ProviderId
  target: QueueTarget
  hours?: QueueHours | null | undefined
}

export type ScenarioStartOutcome =
  { ok: true; queueId: string; itemId: string } | { ok: false; code: ScenarioCode; detail?: string }

/** Что сделать с очередью руками. */
export type QueueAction =
  | { kind: 'remove'; itemId: string }
  | { kind: 'move'; itemId: string; by: number }
  /** Остановить после этого элемента; null - снять остановку. */
  | { kind: 'stopAfter'; itemId: string | null }
  /** Снять остановку; перед ждущими недоделанный - продолжить его прогон с места (ADR 0082). */
  | { kind: 'resume' }
  /** Упавший или остановленный элемент доделан руками: считать его выполненным. */
  | { kind: 'markDone'; itemId: string }
  | { kind: 'rename'; name: string }
  /** Убрать все ждущие элементы разом: идущий и прошедшие остаются, очередь не закрывается. */
  | { kind: 'clear' }
  /** Рабочие часы очереди; null - работать в любое время. */
  | { kind: 'hours'; hours: QueueHours | null }
  | { kind: 'close' }

/** Что сейчас в worktree очереди - для вопроса перед удалением. */
export type WorktreeFacts = { exists: boolean; dirty: boolean; commitsAhead: number }

export type WorktreeAction = { kind: 'open' } | { kind: 'remove'; force: boolean }

/**
 * Сколько открытая очередь может стоять без дела, пока не закроется сама: она давно сделала своё
 * или брошена, а список очередей - это то, что идёт сейчас (решение владельца).
 */
export const QUEUE_IDLE_CLOSE_MS = 14 * DAY_MS

export const isItemOver = (state: QueueItemState): boolean =>
  state === 'done' || state === 'failed' || state === 'stopped' || state === 'skipped'
