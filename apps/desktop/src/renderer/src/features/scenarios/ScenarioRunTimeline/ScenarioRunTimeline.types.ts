import type { RunNote, RunStep, ScenarioRun } from '@shared/scenario-runs'

import type { TimelineRow } from '../scenarios-timeline.utils'

export type StageTimelineRow = Extract<TimelineRow, { kind: 'stage' }>

export type StepTimelineRow = Extract<TimelineRow, { kind: 'step' }>

export type ScenarioRunTimelineProps = {
  run: ScenarioRun
  /** Часы прогона: шаги, что идут, считают своё время по ним. */
  now: number
  onOpenLog: (step: RunStep) => void
}

export type StageRowProps = { row: StageTimelineRow }

export type StepRowProps = {
  row: StepTimelineRow
  /** Сколько шаг на деле работал (без стоянок) - стоит, пока стоит прогон. */
  worked: number
  onOpenLog: (step: RunStep) => void
}

export type StepOutcomeProps = { step: RunStep }

export type NoteRowProps = {
  rowKey: string
  note: RunNote
  /** Прогон кончился: недошедшие слова он унёс с собой, «ждут» о них уже неправда. */
  isOver: boolean
  /** Под этими словами главный поток прямо сейчас пишет ответ. */
  isAnswering: boolean
}

export type GlanceProps = {
  /** Текст агента - markdown. */
  text: string
  /** Три строки по высоте, дальше обрезка; без него - целиком. */
  isClamped?: boolean | undefined
  /** Показать последние строки (живые слова), а не начало. */
  isNewest?: boolean | undefined
  /**
   * Текст внутри нажимаемой карточки шага: ни ссылок, ни фокуса - кнопка в кнопке нажимала бы
   * не то. Слова между шагами стоят сами по себе, и ссылки в них работают.
   */
  isInert?: boolean | undefined
}

export type AnsweringLineProps = { text: string }

/** Тон точки шага на рельсе. */
export type StepTone = 'ahead' | 'going' | 'asking' | 'paused' | 'done' | 'failed'
