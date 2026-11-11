import type { ProviderId } from './providers'

/**
 * Сценарии панели Claude Code (как в ACC): круг работ, записанный один раз, - этапы с
 * карточками, которые проходит «голова» (главный поток). Форму круга держит IDE, суждение -
 * голова. Поля и их имена - как у файла сценария ACC: сценарии кладутся в те же папки и
 * читаются обеими панелями.
 */

/** Номер формата файла: сценарий из более новой сборки показывается, но не запускается. */
export const SCENARIO_VERSION = 1

/** Сколько проходов можно дать этапу: селектор где-то кончается. */
export const MAX_STAGE_REPEAT = 10

/** Сколько пунктов может быть в списке этапа «по пункту»: длиннее - прогон кончается. */
export const MAX_STAGE_ITEMS = 50

/** Сколько раз голова может вернуть карточку на доработку. */
export const MAX_CARD_RETRIES = 5

/** Полка: проектная `.claude/scenarios/` репозитория или личная в доме CLI. */
export type ScenarioScope = 'project' | 'user'

export const SCENARIO_SCOPES: readonly ScenarioScope[] = ['project', 'user']

/** Что спрашивают перед запуском; в промпте карточки - `{{name}}`. */
export type ScenarioInput = {
  id: string
  name: string
  label: string
  placeholder: string
  required: boolean
}

/** head - вопрос карточки решает голова; stop - прогон ждёт человека. */
export type OnQuestion = 'head' | 'stop'

/** stop - карточка, которую её сессия не доделала, кончает прогон; head - доделывает голова. */
export type OnGiveUp = 'stop' | 'head'

/** Главный поток прогона: одна сессия CLI на весь прогон, без Write и Edit. */
export type HeadSettings = {
  /** Для чего этот круг работ - словами человека; голова судит по нему каждую карточку. */
  briefing: string
  /** Пусто - как у новой вкладки (с закреплением в Settings). */
  model: string
  effort: string
  /** Доверие карточек по умолчанию: default, acceptEdits, plan, bypassPermissions. */
  permissionMode: string
  onQuestion: OnQuestion
  retries: number
  onGiveUp: OnGiveUp
}

/** Слот карточки: голова заполняет его перед стартом, в промпте - `[[name]]`. */
export type CardSlot = { id: string; name: string; description: string }

/** Одно задание своей сессии CLI. dod и after читает голова, prompt - карточка. */
export type ScenarioCard = {
  id: string
  title: string
  prompt: string
  slots: CardSlot[]
  dod: string
  after: string
  /** Пусто - как у головы. */
  model: string
  effort: string
  permissionMode: string
}

/** Этап «по пункту списка»: имя пункта в промптах (`[[name]]`) и что это за список. */
export type StageEach = { name: string; description: string }

export type ScenarioStage = {
  id: string
  title: string
  /** Сколько проходов, первый включён. */
  repeat: number
  /** repeat - потолок, а не счёт: голова останавливает цикл, когда работы не осталось. */
  untilDone: boolean
  /** Этап идёт по проходу на пункт списка; repeat и untilDone тогда не читаются. */
  each?: StageEach | null | undefined
  cards: ScenarioCard[]
}

export type Scenario = {
  version: number
  /** Стабилен всю жизнь сценария: прогоны лежат под ним, а не под именем. */
  id: string
  name: string
  createdAt: number
  updatedAt: number
  inputs: ScenarioInput[]
  head: HeadSettings
  stages: ScenarioStage[]
  /** С какой полки прочитан. В файл не пишется: полка - это где лежит файл. */
  scope: ScenarioScope
}

/** Как часто отложенный запуск. */
export type ScenarioRepeat = 'once' | 'daily' | 'weekdays' | 'weekly'

export const SCENARIO_REPEATS: readonly ScenarioRepeat[] = ['once', 'daily', 'weekdays', 'weekly']

/** Отложенный запуск: час, ритм и ответы на вопросы сценария - в девять утра спросить некого. */
export type ScenarioSchedule = {
  id: string
  scenarioId: string
  scope: ScenarioScope
  /** Минуты от полуночи. */
  at: number
  repeat: ScenarioRepeat
  /** День недели раза в неделю: 1 - понедельник, 7 - воскресенье. */
  weekday: number
  inputs: Record<string, string>
  /** Ближайший срок (мс); 0 - не назначен (разовый сработал или пропущен). */
  nextAt: number
  lastAt: number
  /** Срок, прошедший при закрытой IDE; снимается первым сработавшим часом. */
  missedAt: number
  /** Час поднимает новую очередь: в отдельном worktree или в папке проекта. */
  worktree: boolean
  provider: ProviderId
}

/** Отказ главного процесса словом, на которое у окна есть текст. */
export type ScenarioCode =
  | 'scenarioGone'
  | 'scenarioBroken'
  | 'scenarioMissingInput'
  | 'scenarioNotWritten'
  | 'scenarioNotDeleted'
  | 'scenarioOnBothShelves'
  | 'scenarioNotMoved'
  | 'orderNotWritten'
  | 'schedulesNotWritten'
  | 'queueGone'
  | 'queueBusy'
  | 'queueClosed'
  | 'itemGone'
  | 'notARepo'
  | 'noCommits'
  | 'worktreeFailed'
  | 'worktreeDirty'
  | 'providerMissing'
  | 'noClaude'
  | 'untrusted'
  | 'runBusy'
  | 'runGone'
  | 'runNotResumable'
  | 'runOver'
  | 'runForeign'

export type ScenarioOutcome = { ok: true } | { ok: false; code: ScenarioCode }
