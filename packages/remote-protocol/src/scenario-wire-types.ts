import type { FeedItemWire, RunSummaryWire, ShelfScenarioWire } from './wire-types'

/**
 * Сценарии с телефона целиком: сценарий на чтение, полки с историей прогонов и расписанием,
 * журнал шага и черновик ИИ. Длинные промпты дорога до телефона режет и говорит об этом в
 * самом тексте; пути в тексте - метками папок.
 */

export type ScenarioCardWire = {
  id: string
  title: string
  prompt: string
  /** Чем карточка считается сделанной и что голова делает после неё. */
  dod: string
  after: string
  /** Пусто - как у головы. */
  model: string
  effort: string
  permissionMode: string
  slots: { name: string; description: string }[]
}

export type ScenarioStageWire = {
  id: string
  title: string
  repeat: number
  untilDone: boolean
  /** Этап «по пункту списка»; null - обычный. */
  each: { name: string; description: string } | null
  cards: ScenarioCardWire[]
}

/** Сценарий целиком - прочитать на телефоне. Редактирует его модель (черновик) или IDE. */
export type ScenarioWire = ShelfScenarioWire & {
  updatedAt: number
  head: {
    briefing: string
    model: string
    effort: string
    permissionMode: string
    /** head - вопрос карточки решает голова; stop - прогон ждёт человека. */
    onQuestion: string
    retries: number
    onGiveUp: string
  }
  stages: ScenarioStageWire[]
}

/**
 * Отложенный запуск: час (минуты от полуночи по часам Mac), ритм, день недели (1 -
 * понедельник), ответы на вопросы, новая очередь в worktree или в папке проекта, провайдер.
 * nextAt - ближайший срок (мс, 0 - не назначен); missedAt - срок, прошедший при закрытой IDE.
 */
export type ScheduleWire = {
  id: string
  scenarioId: string
  scope: 'project' | 'user'
  at: number
  repeat: string
  weekday: number
  inputs: Record<string, string>
  nextAt: number
  lastAt: number
  missedAt: number
  worktree: boolean
  provider: string
}

/**
 * Полки проекта (scenarios.shelves): сценарии, прогоны с диска свежими первыми (сколько влезло;
 * moreRuns - есть старее), расписание. schedulesUnread - файл расписания не прочитался: это не
 * «расписаний нет». Поля после scenarios - с версии, где телефон их показывает.
 */
export type ShelvesWire = {
  scenarios: ShelfScenarioWire[]
  runs?: RunSummaryWire[] | undefined
  moreRuns?: boolean | undefined
  schedules?: ScheduleWire[] | undefined
  schedulesUnread?: boolean | undefined
}

/**
 * Журнал шага прогона (scenarios.log) - разговор карточки той же лентой, что разговор: конец,
 * сколько влезло, или страница выше before. found false - журнала нет (шаг не начинался).
 */
export type StepLogWire = { found: boolean; items: FeedItemWire[]; hasEarlier: boolean }

/** Сохранённый черновик (scenarios.saveDraft): под каким id и на какой полке он лёг. */
export type SavedDraftWire = { scenarioId: string; scope: 'project' | 'user' }

/**
 * Черновик ИИ (scenarios.draft): сценарий, который написала модель (ещё не сохранён), или
 * почему не вышло - слова CLI коротко; cancelled - отменили.
 */
export type DraftWire =
  { ok: true; scenario: ScenarioWire } | { ok: false; cancelled: boolean; error: string }
