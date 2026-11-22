import type { TrackerFlow } from '@shared/tracker'

export type FlowSectionProps = { flow: TrackerFlow; projectId: string }

export type GroupsRowProps = { flow: TrackerFlow }

/** Куда встаёт ряд при открытии: к колонке группы, в конец ряда или в начало (null). */
export type RowStart = { kind: 'group'; id: string } | { kind: 'end' } | null

/** Видимая ширина ряда групп и ширина всего, что в нём. */
export type RowSize = { view: number; content: number }
