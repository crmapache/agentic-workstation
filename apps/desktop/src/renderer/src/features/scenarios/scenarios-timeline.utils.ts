import { listKey, passesOf } from '@shared/scenario-rules'
import type { RunNote, RunStep, ScenarioRun } from '@shared/scenario-runs'

/**
 * Таймлайн прогона (timeline.ts в ACC): этапы главами, шаги строками, слова головы и человека
 * между ними - там, где сказаны. Циклы развёрнуты: какая из шести строк идёт сейчас - тот
 * единственный вопрос, что есть в полночь.
 */

/** Где этап относительно прогона: позади, здесь, впереди. */
export type StageStanding = 'done' | 'here' | 'ahead'

export type TimelineRow =
  | {
      kind: 'stage'
      key: string
      stageId: string
      title: string
      index: number
      total: number
      passes: number
      untilDone: boolean
      /** Длина списка у этапа «по пункту»: null - список ещё не дан; undefined - не по пункту. */
      items?: number | null | undefined
      standing: StageStanding
      took: number
    }
  | {
      kind: 'step'
      key: string
      step: RunStep
      index: number
      passes: number
      untilDone: boolean
      perItem: boolean
    }
  | { kind: 'note'; key: string; note: RunNote }

const notesFor = (notes: readonly RunNote[], stepKey: string): RunNote[] =>
  notes.filter((note) => note.stepKey === stepKey).sort((left, right) => left.at - right.at)

const noteRow = (note: RunNote): TimelineRow => ({
  kind: 'note',
  key: `note:${note.who}:${note.stepKey}:${note.at}`,
  note,
})

const itemsOf = (steps: readonly RunStep[]): number | null =>
  steps.find((step) => step.item)?.item?.count ?? null

const standingOf = (steps: readonly RunStep[]): StageStanding => {
  if (steps.length > 0 && steps.every((step) => step.item?.count === 0)) return 'done'
  if (steps.some((step) => ['running', 'asking', 'judging', 'paused'].includes(step.state)))
    return 'here'
  if (steps.some((step) => step.state === 'done' || step.state === 'failed')) {
    return steps.every((step) => step.state !== 'waiting') ? 'done' : 'here'
  }

  return 'ahead'
}

/** Сколько этап работал: от первого начала до последнего конца, без стоянок. */
const tookBy = (steps: readonly RunStep[]): number => {
  const begun = steps.filter((step) => step.startedAt > 0)

  if (begun.length === 0 || begun.some((step) => step.finishedAt === 0)) return 0

  const from = Math.min(...begun.map((step) => step.startedAt))
  const to = Math.max(...begun.map((step) => step.finishedAt))

  return Math.max(0, to - from - begun.reduce((sum, step) => sum + step.rested, 0))
}

/** Строки таймлайна по порядку; главы - только когда этапов больше одного. */
export const timelineOf = (run: ScenarioRun): TimelineRow[] => {
  const stages = new Map(run.snapshot.stages.map((stage) => [stage.id, stage]))
  const many = new Set(run.steps.map((step) => step.stageId)).size > 1
  const rows: TimelineRow[] = notesFor(run.notes, '').map(noteRow)
  let stageId = ''

  run.steps.forEach((step, index) => {
    const stage = stages.get(step.stageId)
    const perItem = Boolean(stage?.each)
    const passes = stage && !perItem ? passesOf(stage) : 1
    const untilDone = !perItem && (stage?.untilDone ?? false)

    if (step.stageId !== stageId) {
      stageId = step.stageId

      const own = run.steps.filter((one) => one.stageId === step.stageId)

      if (many) {
        rows.push({
          kind: 'stage',
          key: `stage:${step.stageId}`,
          stageId: step.stageId,
          title: stage?.title ?? '',
          index: run.snapshot.stages.findIndex((one) => one.id === step.stageId) + 1,
          total: run.snapshot.stages.length,
          passes,
          untilDone,
          ...(perItem && { items: itemsOf(own) }),
          standing: standingOf(own),
          took: tookBy(own),
        })
      }

      rows.push(...notesFor(run.notes, listKey(step.stageId)).map(noteRow))
    }

    rows.push({ kind: 'step', key: step.key, step, index, passes, untilDone, perItem })
    rows.push(...notesFor(run.notes, step.key).map(noteRow))
  })

  return rows
}

/** Часы прогона: время работы, без промежутка до подхвата, пауз и вопросов человеку. */
export const runWorked = (
  run: Pick<ScenarioRun, 'startedAt' | 'finishedAt' | 'idle' | 'rested' | 'restingSince'>,
  now: number,
): number => {
  const end = run.finishedAt > 0 ? run.finishedAt : now
  const standing =
    run.finishedAt === 0 && run.restingSince > 0 ? Math.max(0, now - run.restingSince) : 0

  return Math.max(0, end - run.startedAt - run.idle - run.rested - standing)
}

/** Часы шага - так же, без своей стоянки и без идущей стоянки прогона. */
export const stepWorked = (
  step: Pick<RunStep, 'startedAt' | 'finishedAt' | 'rested'>,
  now: number,
  run?: Pick<ScenarioRun, 'restingSince' | 'finishedAt'>,
): number => {
  if (step.startedAt === 0) return 0

  const open = step.finishedAt === 0
  const end = open ? now : step.finishedAt
  const resting = run?.restingSince ?? 0
  const standing =
    open && run?.finishedAt === 0 && resting > 0
      ? Math.max(0, now - Math.max(resting, step.startedAt))
      : 0

  return Math.max(0, end - step.startedAt - step.rested - standing)
}

/** Карточка, на которой прогон встал: последняя начатая. */
export const cutCardOf = (run: Pick<ScenarioRun, 'steps'>): string =>
  [...run.steps].reverse().find((step) => step.startedAt > 0)?.title ?? ''

/** Строка, где прогон сейчас: последний начатый шаг; пусто - не начато ничего. */
export const presentStepKey = (run: Pick<ScenarioRun, 'steps'>): string =>
  [...run.steps].reverse().find((step) => step.startedAt > 0)?.key ?? ''
