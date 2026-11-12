import { z } from 'zod'

import {
  ID,
  TEXT,
  SCOPE,
  IMAGES,
  INPUTS,
  ITEM_ID,
  PROVIDER,
  PROJECT_KEY,
  SEEN_RUN_STATES,
} from './command-fields'

/**
 * Действие над очередью. clear - убрать все ждущие элементы разом («drop what is left»): идущий
 * прогон и прошедшие остаются, сама очередь не закрывается. Закрыть очередь и удалить её
 * worktree с телефона нельзя.
 */
const QUEUE_ACTION = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('remove'), itemId: ID }),
  z.object({ kind: z.literal('move'), itemId: ID, by: z.int().min(-100).max(100) }),
  z.object({ kind: z.literal('mode'), itemId: ID, afterSuccess: z.boolean() }),
  z.object({ kind: z.literal('stopAfter'), itemId: ID.nullable() }),
  z.object({ kind: z.literal('resume') }),
  z.object({ kind: z.literal('rename'), name: z.string().trim().min(1).max(80) }),
  z.object({ kind: z.literal('clear') }),
])

/** Вопрос прогона, который видел телефон: ответ ложится только на него (RunQuestionWire). */
const ASKED = z.object({ stepKey: z.string().min(1).max(200), askedAt: z.int().min(0) })

const TARGET = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('new'), worktree: z.boolean() }),
  z.object({ kind: z.literal('queue'), queueId: ID }),
])

/** Как часто отложенный запуск - те же ритмы, что у формы When в IDE. */
export const SCHEDULE_REPEATS = ['once', 'daily', 'weekdays', 'weekly'] as const

/** Сценарий на полке: проект, id и полка. */
const SHELF_ITEM = { projectKey: PROJECT_KEY, scenarioId: ID, scope: SCOPE }

/** Шаг прогона (его ключ) или голова (`head`) - чей журнал читают. */
const STEP_KEY = z.string().min(1).max(200)

/**
 * Сценарии на уровне IDE с телефона: смотреть, разблокировать и писать следующий круг работ.
 * Пишущая половина (запуск, расписание, черновик ИИ, копия, удаление) не шире сообщения в
 * разговор: агент разговора и так держит шелл. Полного редактора на телефоне нет: сценарий
 * пишет модель по описанию (черновик), а телефон сохраняет ровно то, что она написала.
 */
export const SCENARIO_ARGS = {
  /** Полки, история прогонов и расписание открытого проекта. */
  'scenarios.shelves': z.object({ projectKey: PROJECT_KEY }),
  /** Сценарий целиком - прочитать с телефона (промпты карточек урезаны под кадр). */
  'scenarios.fetch': z.object(SHELF_ITEM),
  'scenarios.duplicate': z.object(SHELF_ITEM),
  'scenarios.delete': z.object(SHELF_ITEM),
  /**
   * Модель пишет сценарий по описанию (до десяти минут). draftId называет телефон: по нему
   * отмена и сохранение - сохраняется только то, что написала модель, без правок с телефона.
   */
  'scenarios.draft': z.object({
    projectKey: PROJECT_KEY,
    draftId: ID,
    description: z.string().trim().min(1).max(4_000),
    scope: SCOPE,
  }),
  'scenarios.saveDraft': z.object({ projectKey: PROJECT_KEY, draftId: ID }),
  'scenarios.cancelDraft': z.object({ draftId: ID }),
  'scenarios.start': z.object({
    projectKey: PROJECT_KEY,
    scenarioId: ID,
    scope: SCOPE,
    inputs: INPUTS,
    provider: PROVIDER,
    target: TARGET,
    afterSuccess: z.boolean(),
  }),
  /** Отложенный запуск: час (минуты от полуночи), ритм, день недели; scheduleId пусто - новый. */
  'scenarios.schedule': z.object({
    ...SHELF_ITEM,
    scheduleId: z.union([ID, z.literal('')]),
    at: z
      .int()
      .min(0)
      .max(24 * 60 - 1),
    repeat: z.enum(SCHEDULE_REPEATS),
    weekday: z.int().min(1).max(7),
    inputs: INPUTS,
    worktree: z.boolean(),
    provider: PROVIDER,
  }),
  'scenarios.unschedule': z.object({ projectKey: PROJECT_KEY, scheduleId: ID }),
  'scenarios.queue': z.object({ queueId: ID, action: QUEUE_ACTION }),
  'scenarios.control': z.object({
    runId: ID,
    action: z.enum(['pause', 'resume', 'stop']),
    seen: z.enum(SEEN_RUN_STATES),
  }),
  'scenarios.answer': z.object({ runId: ID, question: ASKED, allow: z.boolean(), text: TEXT }),
  'scenarios.tell': z.object({ runId: ID, text: TEXT, images: IMAGES }),
  'scenarios.carryOn': z.object({ runId: ID }),
  /**
   * Журнал шага (или головы): конец, сколько влезло в кадр; before - страница выше этого
   * элемента. Прогон проекта - и из истории, не только идущий.
   */
  'scenarios.log': z.object({
    projectKey: PROJECT_KEY,
    runId: ID,
    key: STEP_KEY,
    before: ITEM_ID.optional(),
  }),
  'scenarios.starRun': z.object({ projectKey: PROJECT_KEY, runId: ID, starred: z.boolean() }),
  'scenarios.deleteRun': z.object({ projectKey: PROJECT_KEY, runId: ID }),
} as const

export const SCENARIO_LIMITS: Readonly<Record<keyof typeof SCENARIO_ARGS, number>> = {
  'scenarios.shelves': 30,
  'scenarios.fetch': 30,
  'scenarios.duplicate': 10,
  'scenarios.delete': 10,
  'scenarios.draft': 5,
  'scenarios.saveDraft': 10,
  'scenarios.cancelDraft': 10,
  'scenarios.start': 10,
  'scenarios.schedule': 10,
  'scenarios.unschedule': 10,
  'scenarios.queue': 30,
  'scenarios.control': 20,
  'scenarios.answer': 40,
  'scenarios.tell': 10,
  'scenarios.carryOn': 10,
  'scenarios.log': 30,
  'scenarios.starRun': 20,
  'scenarios.deleteRun': 10,
}

export const SCENARIO_IN_PARTS = ['scenarios.tell'] as const
