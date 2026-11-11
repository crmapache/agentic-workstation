import type { ProviderId } from './providers'
import type { Scenario, ScenarioScope } from './scenarios'

/**
 * Прогон сценария - как таймлайн рисует его, пока он идёт, и как его хранит история: одна
 * форма для обоих. Имена полей - как у записи прогона ACC.
 */

export type RunState = 'starting' | 'running' | 'paused' | 'blocked' | 'done' | 'failed' | 'stopped'

export type StepState =
  'waiting' | 'running' | 'asking' | 'judging' | 'paused' | 'done' | 'failed' | 'skipped'

/** Почему что-то не кончилось - именем, слова выбирает окно. */
export type RunFailure =
  | ''
  | 'noHead'
  | 'noStart'
  | 'tooLong'
  | 'headSilent'
  | 'crashed'
  | 'refused'
  | 'noVerdict'
  | 'retries'
  | 'stopped'
  | 'undone'
  | 'headGaveUp'
  | 'longList'

/** Пункт списка, для которого этот проход этапа «по пункту». count 0 - список пуст. */
export type RunItem = {
  label: string
  value: string
  index: number
  count: number
  /** Что первый заход говорил о пункте - у второго захода; пусто у первого. */
  again: string
}

export type RunStep = {
  /** этап:карточка:проход. */
  key: string
  cardId: string
  stageId: string
  pass: number
  title: string
  state: StepState
  /** Разговор CLI карточки: по нему же читается её лог. */
  conversationId: string
  startedAt: number
  finishedAt: number
  slots: Record<string, string>
  /** Промпт, как его сказали, - с ответами и слотами. */
  prompt: string
  /** Новейшие слова, пока ход открыт. */
  said: string
  /** Последнее сказанное, когда ход кончился. */
  summary: string
  nudges: string[]
  /** done, undone или later (пункт отложен до конца списка). */
  verdict: string
  verdictReason: string
  handoff: string
  failure: RunFailure
  error: string
  cost: number
  tokens: number
  /** Почему работу карточки забрала голова; пусто - не забирала. */
  takeOver: string
  /** Стоянка прогона, пока эта карточка была на доске. */
  rested: number
  item?: RunItem | null | undefined
}

/** Почему прогон переехал. */
export type RunMoveReason = 'limit' | 'unfit' | 'choice'

/** Кто сказал: голова (пусто), человек или сама панель. */
export type RunNoteAuthor = '' | 'person' | 'panel'

/** Переезд прогона на другой аккаунт или ожидание лимита - заметка панели в таймлайне. */
export type RunMove = {
  /** limit - кончился лимит; unfit - взятый сам аккаунт не смог; choice - человек выбрал другой. */
  reason: RunMoveReason
  from: string
  to: string
  waits: boolean
  window: string
  until: number
}

/** Слова в таймлайне: головы (who пусто), человека (person) или панели (panel). */
export type RunNote = {
  at: number
  stepKey: string
  text: string
  who: RunNoteAuthor
  /** Слова человека дошли до головы; 0 - ждут, пока она освободится. */
  deliveredAt: number
  /** Что голова передала карточке из ответа человеку. */
  relayed: string
  /** Чипы поля, как их набрал человек, без байтов картинок - только для показа. */
  tokens?: unknown
  move?: RunMove | null | undefined
}

/**
 * Вопрос, на котором прогон стоит и ждёт человека. stepKey и askedAt - его опознание: ответ с
 * устаревшего экрана (телефон) не ложится на следующий вопрос. truncated - подробности
 * урезаны до DETAIL_CHARS: целиком их нет нигде, кроме запроса карточки.
 */
export type RunQuestion = {
  stepKey: string
  title: string
  tool: string
  detail: string
  options: string[]
  askedAt: number
  truncated?: boolean | undefined
}

/** Какой вопрос видел тот, кто отвечает. */
export type RunQuestionRef = Pick<RunQuestion, 'stepKey' | 'askedAt'>

/** Лимит, который прогон пережидает: чей, какое окно, до когда, почему. */
export type RunLimit = { account: string; window: string; until: number; reason: string }

export type ScenarioRun = {
  id: string
  /** Исходный проект: прогоны хранятся по нему, даже если работа шла в worktree. */
  projectPath: string
  /** Где работали сессии: папка проекта или worktree очереди. */
  cwd: string
  provider: ProviderId
  /** Очередь и её элемент; пусто - прогон старее очередей. */
  queueId: string
  itemId: string
  scenarioId: string
  scenarioName: string
  scope: ScenarioScope
  /** Сценарий, каким он был на старте: прогон идёт по снимку. */
  snapshot: Scenario
  startedAt: number
  finishedAt: number
  state: RunState
  /** Расписание, поднявшее прогон; пусто - нажали руками. */
  runFrom: string
  inputs: Record<string, string>
  total: number
  headConversationId: string
  steps: RunStep[]
  notes: RunNote[]
  question: RunQuestion | null
  failure: RunFailure
  error: string
  cost: number
  tokens: number
  /** Промежуток между концом и подхватом - не работа. */
  idle: number
  /** Пауза и вопрос человеку - тоже не работа. */
  rested: number
  restingSince: number
  /** Когда IDE последний раз писала запись: им закрывают брошенный прогон. */
  writtenAt: number
  starred: boolean
  /** Голова прямо сейчас отвечает человеку. */
  answering: boolean
  limit: RunLimit | null
}

/** Остановка на дороге карточки идущего прогона. */
export type RoadmapStop = { state: StepState; stage: number; pass: number; title: string }

/** Прогон, как его рисуют списки: без шагов - они дорогие. */
export type RunSummary = {
  id: string
  projectPath: string
  provider: ProviderId
  queueId: string
  itemId: string
  scenarioId: string
  scenarioName: string
  scope: ScenarioScope
  startedAt: number
  finishedAt: number
  state: RunState
  total: number
  done: number
  failure: RunFailure
  cost: number
  inputs: Record<string, string>
  tokens: number
  idle: number
  rested: number
  restingSince: number
  stageTitle: string
  at: string
  asking: string
  /** Только у идущего: таблица законченных дороги не рисует. */
  roadmap: RoadmapStop[]
  starred: boolean
  limit: RunLimit | null
}

export const isRunFinished = (state: RunState): boolean =>
  state === 'done' || state === 'failed' || state === 'stopped'

export const isStepOver = (state: StepState): boolean =>
  state === 'done' || state === 'failed' || state === 'skipped'

export const isStepBegun = (state: StepState): boolean => state !== 'waiting' && state !== 'skipped'
