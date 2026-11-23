/** Ось ряда: вкладки стоят слева направо (x), иконки полосы окна - сверху вниз (y). */
export type DragAxis = 'x' | 'y'

/**
 * Где вкладка стояла в начале жеста, вдоль оси ряда: начало (левый или верхний край) в
 * координатах ряда и размер (ширина или высота).
 */
export type TabSlot = { id: string; start: number; size: number }

/**
 * Картина жеста для отрисовки: какую вкладку несут, её сдвиг под рукой и сдвиги соседей,
 * которые уступили ей место. Действует только для порядка, в котором жест начался
 * (signature): пришёл новый порядок - картина уже не про него.
 */
export type TabDragView = {
  signature: string
  draggedId: string | null
  offset: number
  shifts: Readonly<Record<string, number>>
}

/** Перестановка: вкладка встаёт перед beforeId; ответ - id вкладок после неё, null - не вышло. */
export type MoveTab = (id: string, beforeId: string | null) => Promise<readonly string[] | null>
