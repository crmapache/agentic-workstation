import type { TrackerBoard } from '@shared/tracker'

export type TrackerModalsProps = {
  board: TrackerBoard
  /** Создан новый проект трекера: сделать его открытой вкладкой. */
  onCreatedProject: (id: string) => void
}
