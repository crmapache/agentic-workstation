import { planOf } from '@shared/scenario-rules'
import type { RunStep, RunSummary, RoadmapStop, ScenarioRun } from '@shared/scenario-runs'
import { isStepOver, isStepBegun, isRunFinished } from '@shared/scenario-runs'

/** Сколько имени карточки несёт остановка дороги - строка подсказки, не промпт. */
const ROADMAP_TITLE = 80

/** Остановка дороги называется пунктом списка, иначе карточкой: семь остановок - семь пунктов. */
export const stopTitle = (step: RunStep): string => step.item?.label.trim() || step.title

/**
 * Прогон, каким его рисуют списки (summarise в ACC): без шагов. Карточка идущего прогона -
 * имя этапа, дорога и что он спросил; дорога - только у идущего.
 */
export const summarise = (run: ScenarioRun): RunSummary => {
  const here =
    run.steps.find((step) => !isStepOver(step.state) && isStepBegun(step.state)) ??
    run.steps.findLast((step) => isStepBegun(step.state))
  const stageOf = new Map(run.snapshot.stages.map((stage, index) => [stage.id, index + 1]))
  // До записи плана дорога строится из самого плана: строка не появляется секундой позже.
  const road: RoadmapStop[] =
    run.steps.length > 0
      ? run.steps.map((step) => ({
          state: step.state,
          stage: stageOf.get(step.stageId) ?? 0,
          pass: step.pass,
          title: stopTitle(step),
        }))
      : planOf(run.snapshot).map((planned) => ({
          state: 'waiting',
          stage: stageOf.get(planned.stageId) ?? 0,
          pass: planned.pass,
          title: planned.title,
        }))
  const standing = road.find((stop) => !isStepOver(stop.state)) ?? road.at(-1)
  const stageTitle = run.snapshot.stages[(standing?.stage ?? 1) - 1]?.title ?? ''

  return {
    id: run.id,
    projectPath: run.projectPath,
    provider: run.provider,
    queueId: run.queueId,
    itemId: run.itemId,
    scenarioId: run.scenarioId,
    scenarioName: run.scenarioName,
    scope: run.scope,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    state: run.state,
    total: run.total,
    done: run.steps.filter((step) => step.state === 'done').length,
    failure: run.failure,
    cost: run.cost,
    inputs: run.inputs,
    tokens: run.tokens,
    idle: run.idle,
    rested: run.rested,
    restingSince: run.restingSince,
    stageTitle,
    at: here?.title ?? '',
    // Слова, а не имя инструмента: строка «Bash» ничего не говорит о том, о чём спросили.
    asking: run.question ? run.question.title || run.question.tool : '',
    roadmap: isRunFinished(run.state)
      ? []
      : road.map((stop) => ({ ...stop, title: stop.title.slice(0, ROADMAP_TITLE) })),
    starred: run.starred,
    limit: run.limit,
    origin: run.origin,
  }
}

/**
 * Прогон, чья IDE умерла посреди работы, - закрыт моментом последней записи, а не моментом
 * следующего старта: ночь, пока он лежал, не работа.
 */
export const abandoned = (run: ScenarioRun, now: number): ScenarioRun => {
  const end = run.writtenAt > 0 ? Math.min(Math.max(run.writtenAt, run.startedAt), now) : now
  const rest = run.restingSince > 0 ? Math.max(0, end - run.restingSince) : 0

  return {
    ...run,
    state: 'failed',
    answering: false,
    failure: run.failure || 'crashed',
    finishedAt: run.finishedAt > 0 ? run.finishedAt : end,
    rested: run.rested + rest,
    restingSince: 0,
    question: null,
    limit: null,
    steps: run.steps.map((step) => {
      if (isStepOver(step.state)) return step

      const begun = isStepBegun(step.state)

      return {
        ...step,
        state: begun ? 'failed' : 'skipped',
        failure: step.failure || (begun ? 'crashed' : ''),
        finishedAt: step.finishedAt > 0 ? step.finishedAt : end,
        rested: begun ? step.rested + rest : step.rested,
      }
    }),
  }
}
