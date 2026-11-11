import type { DragEvent, KeyboardEvent } from 'react'

import type { ScenarioShelvesView } from '@shared/scenario-view'
import type { Scenario, ScenarioScope, ScenarioSchedule } from '@shared/scenarios'

import type { ScenarioFacts } from '../scenarios-shelves-facts.utils'
import type { RowBox, ShelfMove, ShelfPlace, Arrangement } from '../scenarios-shelves.utils'

/** Раскладка, снятая в начале жеста, - по ней решается, куда ляжет строка. */
export type DragFrame = {
  /** Остальные строки обеих полок - от верха полок. */
  rows: RowBox[]
  /** Граница полок - верх второй полки; null - полка одна. */
  boundary: number | null
  /** Верх места несомой строки. */
  origin: number
}

/** Точка на экране (клиентские координаты окна). */
export type DragPoint = { x: number; y: number }

/** Несомая строка: какая, её рост, за какое место взяли и куда легла бы сейчас. */
export type Carried = {
  key: string
  from: ScenarioScope
  height: number
  /** Ширина строки: копия за рукой - ровно её размера. */
  width: number
  /** Где рука держит строку - от её верха. */
  grab: number
  /** Где рука держит строку - от её левого края. */
  grabX: number
  /** Где была рука в начале жеста: копия стоит там до первого движения. */
  at: DragPoint
  start: Arrangement
  place: ShelfPlace
  frame: DragFrame
}

/** Отпущенное рисуется сразу и держится, пока не придёт список, поверх которого его положили. */
export type Landed = { over: readonly Scenario[]; arrangement: Arrangement }

export type ArrangeOptions = {
  shown: Arrangement
  canShare: boolean
  /** Отпущенное уже пришло списком главного процесса - фокус ручки можно отпустить. */
  settled: boolean
  onMove: (end: Arrangement, move: ShelfMove) => void
}

/** Ручка строки: тянуть мышью, стрелками с Option - на место выше или ниже. */
export type GripHandlers = {
  onDragStart: (event: DragEvent<HTMLElement>, key: string) => void
  onDragEnd: () => void
  onKeyDown: (event: KeyboardEvent<HTMLElement>, key: string) => void
}

/** Всё, что строка делает со сценарием: окна поверх вида и прямые действия. */
export type ShelfActions = {
  edit: (scenario: Scenario) => void
  run: (scenario: Scenario) => void
  schedule: (scenario: Scenario) => void
  duplicate: (scenario: Scenario) => void
  remove: (scenario: Scenario) => void
  create: (scope: ScenarioScope) => void
}

/** Что сценарий делает в очередях проекта: сколько его элементов идёт и сколько ждёт. */
export type RowLoad = { running: number; queued: number }

/** Общее для всех строк обеих полок - одним пакетом, а не десятком пропсов насквозь. */
export type ShelfKit = {
  view: ScenarioShelvesView
  loadOf: (scenario: Scenario) => RowLoad
  actions: ShelfActions
  grip: GripHandlers
  movable: (key: string) => boolean
}

export type LibraryShelvesProps = {
  view: ScenarioShelvesView
  loadOf: (scenario: Scenario) => RowLoad
  actions: ShelfActions
  /** Перенос строки главному процессу; false - отказал, отпущенное снимается. */
  onPlace: (move: ShelfMove) => Promise<boolean>
}

export type ShelfProps = {
  scope: ScenarioScope
  /** Строки полки по порядку (несомая тоже - она остаётся в своём списке, спрятанной). */
  keys: readonly string[]
  byKey: ReadonlyMap<string, Scenario>
  carried: Pick<Carried, 'key' | 'height'> | null
  /** Место под несомую строку среди остальных; null - она не над этой полкой. */
  slot: number | null
  kit: ShelfKit
}

export type ShelfRowProps = {
  scenario: Scenario
  rowKey: string
  /** Полка, на которой строка нарисована. Посреди переноса - не всегда та, где файл. */
  shelf: ScenarioScope
  /** Строку несут: её место показывает пустая рамка, сама она спрятана. */
  hidden: boolean
  kit: ShelfKit
}

export type LiftedRowProps = { carried: Carried; scenario: Scenario; kit: ShelfKit }

export type ShelfGripProps = { rowKey: string; shelf: ScenarioScope; id: string; kit: ShelfKit }

export type ShelfFactsProps = { facts: ScenarioFacts }

export type ShelfHoursProps = { hours: readonly ScenarioSchedule[] }

export type ShelfLoadProps = { load: RowLoad }

export type ShelfRowActionsProps = {
  scenario: Scenario
  facts: ScenarioFacts
  hours: readonly ScenarioSchedule[]
  actions: ShelfActions
}

export type ShelfSlotProps = {
  height: number
  /** Место, куда строка ляжет (рамкой акцента); нет - пустая полка посреди жеста. */
  target: boolean
}

export type EmptyShelfProps = { scope: ScenarioScope; onCreate: (scope: ScenarioScope) => void }
