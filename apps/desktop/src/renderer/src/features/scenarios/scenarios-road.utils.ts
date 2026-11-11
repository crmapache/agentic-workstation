import type { StepState, RoadmapStop, ScenarioRun } from '@shared/scenario-runs'
import { isStepOver } from '@shared/scenario-runs'

import { ROAD_SNAP } from './scenarios.constants'

/**
 * Дорога карточек (roadmap.ts в ACC): кружки на одном расстоянии, текущий - в кольце. Цикл
 * развёрнут, остановок бывает двадцать: когда ряд не влезает, остаются первая и последняя,
 * окно вокруг текущей с наклоном вперёд и счётчики «+N» вместо остального.
 */

/** Ширины частей дороги в пикселях - обмер нарисованных (useRoadMeasure), а не числа в коде. */
export type RoadMetrics = { stop: number; link: number; fold: number }

export type RoadItem = { kind: 'stop'; index: number } | { kind: 'fold'; from: number; to: number }

/** Дорога из полной записи - так же, как сводка: пункт списка вместо имени карточки. */
export const roadOf = (run: ScenarioRun): RoadmapStop[] => {
  const stageOf = new Map(run.snapshot.stages.map((stage, index) => [stage.id, index + 1]))

  return run.steps.map((step) => ({
    state: step.state,
    stage: stageOf.get(step.stageId) ?? 0,
    pass: step.pass,
    title: step.item?.label || step.title,
  }))
}

/** Где прогон стоит: первая не законченная, иначе последняя. */
export const hereOf = (stops: readonly RoadmapStop[]): number => {
  const open = stops.findIndex((stop) => !isStepOver(stop.state))

  return open >= 0 ? open : stops.length - 1
}

/** Где законченный прогон кончился: последняя сделанная или упавшая. */
export const endOf = (stops: readonly RoadmapStop[]): number => {
  const last = stops.findLastIndex((stop) => stop.state === 'done' || stop.state === 'failed')

  return Math.max(0, last)
}

/** Полоса этапа, где стоит прогон; null - этап один на всю дорогу. */
export const bandOf = (
  stops: readonly RoadmapStop[],
  here: number,
): { from: number; to: number } | null => {
  const stage = stops[here]?.stage

  if (stage === undefined || stops.every((stop) => stop.stage === stage)) return null

  let from = here
  let to = here

  while (from > 0 && stops[from - 1]?.stage === stage) from -= 1
  while (to < stops.length - 1 && stops[to + 1]?.stage === stage) to += 1

  return to > from ? { from, to } : null
}

/** Окно в size остановок вокруг here, с наклоном вперёд; первая и последняя - всегда. */
export const windowed = (count: number, here: number, size: number): RoadItem[] => {
  const span = Math.max(1, Math.min(size, count))
  const behind = Math.min(here, span - 1, Math.max(1, Math.floor((span - 1) / 3)))
  let from = here - behind
  let to = from + span - 1

  if (to > count - 1) {
    to = count - 1
    from = Math.max(0, to - span + 1)
  }

  const shown = (index: number) =>
    index === 0 || index === count - 1 || (index >= from && index <= to)
  const items: RoadItem[] = []

  for (let index = 0; index < count; index += 1) {
    if (shown(index)) {
      items.push({ kind: 'stop', index })
      continue
    }

    let last = index

    while (last + 1 < count && !shown(last + 1)) last += 1

    items.push(last === index ? { kind: 'stop', index } : { kind: 'fold', from: index, to: last })
    index = last
  }

  return items
}

export const widthOf = (items: readonly RoadItem[], metrics: RoadMetrics): number =>
  items.length === 0
    ? 0
    : items.reduce((sum, item) => sum + (item.kind === 'stop' ? metrics.stop : metrics.fold), 0) +
      (items.length - 1) * metrics.link

/** Полная ширина дороги без складок. */
export const roadWidth = (count: number, metrics: RoadMetrics): number =>
  count > 0 ? count * metrics.stop + (count - 1) * metrics.link : 0

/** Самая длинная раскладка, что влезает в width. */
export const roadLayout = (
  count: number,
  here: number,
  width: number,
  metrics: RoadMetrics,
): RoadItem[] => {
  if (count <= 0) return []

  const at = Math.min(Math.max(here, 0), count - 1)

  for (let size = count; size > 1; size -= 1) {
    const items = windowed(count, at, size)

    if (widthOf(items, metrics) <= width + ROAD_SNAP) return items
  }

  return windowed(count, at, 1)
}

/** Как рисовать остановку: галочка, крестик, пунктир, номер. */
export const stopLook = (state: StepState): 'done' | 'failed' | 'skipped' | 'ahead' | 'open' => {
  if (state === 'done') return 'done'
  if (state === 'failed') return 'failed'
  if (state === 'skipped') return 'skipped'

  return state === 'waiting' ? 'ahead' : 'open'
}
