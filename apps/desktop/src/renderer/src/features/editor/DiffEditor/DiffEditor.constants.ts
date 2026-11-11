/**
 * Действия разницы на клавишах WebStorm: F7 и Shift+F7 - к следующей и предыдущей правке,
 * F4 - сам файл в редакторе (Jump to Source). Ставятся обеим сторонам разницы: клавиша
 * работает, с какой стороны ни стоял курсор. Отмена и повтор - только левой: в ней правок
 * нет, её ⌘Z и ⇧⌘Z - отмена и повтор правой стороны.
 */
export const DIFF_ACTIONS = {
  nextChange: 'agenticWorkstation.diff.nextChange',
  previousChange: 'agenticWorkstation.diff.previousChange',
  openFile: 'agenticWorkstation.diff.openFile',
  undo: 'agenticWorkstation.diff.undo',
  redo: 'agenticWorkstation.diff.redo',
} as const
