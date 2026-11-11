/**
 * Фреймы снимка и ссылки на элементы в них (ADR 0040). Ссылка снимка `e7` - элемент главного
 * фрейма, `f2e7` - элемент фрейма f2: платёжное поле, вход через чужой сайт, виджет в iframe.
 * По ссылке инструмент должен найти и сессию отладчика, где живёт узел, и место фрейма на
 * странице, - это и держит фрейм.
 */

/** Фрейм последнего снимка вкладки: как до него дотянуться командами CDP. */
export type SnapshotFrame = {
  /** f1, f2… - приставка ссылок фрейма; у главного - пусто. */
  id: string
  /**
   * Фрейм - корень своего процесса (cross-origin iframe): команды его документа идут в его
   * сессию отладчика, id цели = id фрейма. null - фрейм живёт в процессе родителя.
   */
  target: string | null
  /** Фрейм, в документе которого стоит элемент iframe; у главного - null. */
  parent: SnapshotFrame | null
  /** backendNodeId элемента iframe в документе родителя; у главного - null. */
  owner: number | null
}

/** Элемент снимка: узел DOM (backendNodeId) и фрейм, в документе которого он стоит. */
export type ElementRef = { node: number; frame: SnapshotFrame }

export const MAIN_FRAME: SnapshotFrame = { id: '', target: null, parent: null, owner: null }

/**
 * Куда слать команду документа фрейма: id ближайшего корня процесса (сам фрейм или предок);
 * undefined - в саму вкладку. Фрейм своего процесса внутри чужого живёт в процессе чужого.
 */
export const targetOf = (frame: SnapshotFrame): string | undefined => {
  for (let at: SnapshotFrame | null = frame; at; at = at.parent) {
    if (at.target !== null) return at.target
  }

  return undefined
}

/** Ссылка снимка: e12 в главном фрейме или f2e12 во фрейме f2. */
export const REF_PATTERN = /^(?:f\d+)?e\d+$/
