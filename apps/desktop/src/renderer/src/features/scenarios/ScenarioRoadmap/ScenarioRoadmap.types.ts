import type { RoadmapStop } from '@shared/scenario-runs'

/** Что прогон делает на текущей остановке: работает, ждёт человека, стоит на паузе, кончился. */
export type RoadMood = 'working' | 'asking' | 'paused' | 'over'

export type ScenarioRoadmapProps = {
  stops: readonly RoadmapStop[]
  mood: RoadMood
  /**
   * Дорога ровно своей ширины (сжимается только от тесноты), а не на всё место: строка цифр
   * окна прогона ставит показания сразу за ней. Флекс-элемент ряда.
   */
  ownWidth?: boolean | undefined
}

export type RoadStopProps = {
  stop: RoadmapStop
  index: number
  isHere: boolean
  mood: RoadMood
}
