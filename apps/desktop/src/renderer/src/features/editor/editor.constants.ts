/**
 * Пауза в наборе, после которой файл сам пишется на диск. Короткая, потому что рядом
 * работает Claude Code: он читает файлы с диска, и правка, ждущая записи, для него
 * невидима. Уход из редактора и закрытие вкладки пишут сразу, без паузы.
 */
export const AUTOSAVE_DELAY_MS = 1_000

/**
 * Пауза после движения выделения, прежде чем сказать о нём полю ввода Claude Code: пока
 * выделяют мышью, поле не перерисовывается на каждый сдвиг.
 */
export const SELECTION_PUBLISH_DELAY_MS = 150

/** Строк неизменённого вокруг правки в свёрнутой разнице - как у WebStorm и git diff. */
export const DIFF_CONTEXT_LINES = 3

/** Сколько строк свёрнутого раскрывает одно нажатие по его полосе. */
export const DIFF_REVEAL_LINES = 20

/**
 * Сколько разница ждёт сравнения сторон невидимой (DiffEditor): дольше - показывается как
 * есть и сворачивается, когда досчитает. Столько же ждёт и сам Monaco, прежде чем показать,
 * что считает.
 */
export const DIFF_COMPARE_WAIT_MS = 1_000

/** Признак на разнице, пока Monaco сравнивает новую пару: не видна, но место держит. */
export const DIFF_COMPARING_ATTRIBUTE = 'data-comparing'

/** Команда Monaco за ⌘S в редакторе: записать файл по явной просьбе. */
export const SAVE_COMMAND = 'agenticWorkstation.saveFile'

/**
 * Дорожка полосы прокрутки редактора. Бегунок на ней (monaco.css) - как родной тонкий у
 * Chromium на macOS в соседних панелях: 6 px в 2 px от края. Родная дорожка на пиксель
 * шире (11 px), но бегунок у неё сдвинут к краю, так он встаёт ровно туда же.
 */
export const SCROLLBAR_SIZE = 10

/**
 * Команды поиска Monaco. Его панели поиска в IDE нет (будет свой поиск): сочетания этих
 * команд сняты, а в палитре команд их не видно. Сам модуль поиска остаётся - на нём
 * держится мультикурсор (⌘D, правка всех вхождений).
 */
export const MONACO_FIND_COMMANDS: ReadonlySet<string> = new Set([
  'actions.find',
  'actions.findWithSelection',
  'editor.actions.findWithArgs',
  'editor.action.nextMatchFindAction',
  'editor.action.previousMatchFindAction',
  'editor.action.goToMatchFindAction',
  'editor.action.nextSelectionMatchFindAction',
  'editor.action.previousSelectionMatchFindAction',
  'editor.action.startFindReplaceAction',
  'closeFindWidget',
  'toggleFindCaseSensitive',
  'toggleFindWholeWord',
  'toggleFindRegex',
  'toggleFindInSelection',
  'togglePreserveCase',
  'editor.action.replaceOne',
  'editor.action.replaceAll',
  'editor.action.selectAllMatches',
])

/**
 * Действия разницы (с коммитом и в локальной истории) на клавишах WebStorm: F7 и Shift+F7 - к
 * следующей и предыдущей правке, F4 - сам файл в редакторе (Jump to Source, у разницы с
 * коммитом). Ставятся обеим сторонам разницы: клавиша работает, с какой стороны ни стоял
 * курсор. Отмена и повтор - только левой: в ней правок нет, её ⌘Z и ⇧⌘Z - отмена и повтор
 * правой стороны.
 */
export const DIFF_ACTIONS = {
  nextChange: 'agenticWorkstation.diff.nextChange',
  previousChange: 'agenticWorkstation.diff.previousChange',
  openFile: 'agenticWorkstation.diff.openFile',
  undo: 'agenticWorkstation.diff.undo',
  redo: 'agenticWorkstation.diff.redo',
} as const
