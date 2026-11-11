import type { RoadmapStop } from '@shared/scenario-runs'

/** Что прогон делает на текущей остановке: работает, ждёт человека, стоит на паузе, кончился. */
export type RoadMood = 'working' | 'asking' | 'paused' | 'over'

export type ScenarioRoadmapProps = {
  stops: readonly RoadmapStop[]
  mood: RoadMood
}

export type RoadStopProps = {
  stop: RoadmapStop
  index: number
  isHere: boolean
  mood: RoadMood
}
