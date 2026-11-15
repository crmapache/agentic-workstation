import type { editor } from 'monaco-editor/editor/editor.api.js'

import {
  MINIMAP_WIDTH,
  SCROLLBAR_SIZE,
  DIFF_REVEAL_LINES,
  DIFF_CONTEXT_LINES,
} from './editor.constants'
import type { DiffViewOptions } from './editor.types'
import { minimapColumns } from './editor.utils'
import { editorTypography } from './monaco-theme'
import { EDITOR_THEME } from './monaco-theme.constants'

/** Отступ кода от верха листа - ступень шкалы отступов, как у остальных листов. */
const PADDING_ROLE = '--space-2'

/**
 * Полосы прокрутки - как родные в соседних панелях (base.css): тонкие, без теней,
 * бегунок рисует monaco.css. Классические полосы macOS видны
 * всегда, накладные - только при прокрутке и под курсором. Какие сейчас, решает система
 * и меняет на ходу (подключили мышь), поэтому режим приходит снаружи.
 */
export const scrollbarOptions = (classic: boolean): editor.IEditorScrollbarOptions => {
  const visibility = classic ? 'visible' : 'auto'

  return {
    vertical: visibility,
    horizontal: visibility,
    useShadows: false,
    verticalScrollbarSize: SCROLLBAR_SIZE,
    horizontalScrollbarSize: SCROLLBAR_SIZE,
  }
}

/**
 * Полосы редактора файла: вертикальной нет, её место и работу взяла миникарта (ниже).
 * Горизонтальная - как у разницы.
 */
export const fileScrollbarOptions = (classic: boolean): editor.IEditorScrollbarOptions => ({
  ...scrollbarOptions(classic),
  vertical: 'hidden',
  verticalScrollbarSize: 0,
})

/**
 * Миникарта редактора файла - его полоса прокрутки шириной MINIMAP_WIDTH: устройство файла
 * сбоку и рамка видимой части, которую тянут, как бегунок. Код - цветными блоками, а не
 * буквами: в такой ширине буквы не читаются, а блоки дешевле рисовать. Ширину Monaco считает
 * колонками от плотности экрана, поэтому колонки пересчитывает holdMinimapWidth.
 */
export const minimapOptions = (): editor.IEditorMinimapOptions => ({
  enabled: true,
  side: 'right',
  size: 'proportional',
  showSlider: 'always',
  renderCharacters: false,
  scale: 1,
  maxColumn: minimapColumns(window.devicePixelRatio, MINIMAP_WIDTH),
})

/**
 * Настройки кода середины окна - и у редактора файла, и у обеих сторон разницы. Шрифт и
 * тема - из токенов. Миникарта - только у редактора файла (editorOptions): у разницы справа
 * своя полоса отметок правок. Липких заголовков нет: строки внешних
 * блоков поверх кода владелец просил убрать. Подсказки по словам и цветные скобки
 * выключены: подсказки дадут языковые серверы, а радуга скобок спорит с подсветкой ролей.
 */
const codeOptions = (classicScrollbars: boolean) => {
  const padding = Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue(PADDING_ROLE),
  )

  return {
    theme: EDITOR_THEME,
    ...editorTypography(),
    automaticLayout: true,
    fixedOverflowWidgets: true,
    padding: { top: padding, bottom: padding },
    tabSize: 2,
    minimap: { enabled: false },
    stickyScroll: { enabled: false },
    bracketPairColorization: { enabled: false },
    guides: { indentation: true, bracketPairs: false },
    quickSuggestions: false,
    suggestOnTriggerCharacters: false,
    wordBasedSuggestions: 'off',
    parameterHints: { enabled: false },
    'semanticHighlighting.enabled': false,
    smoothScrolling: true,
    cursorSmoothCaretAnimation: 'on',
    overviewRulerBorder: false,
    hideCursorInOverviewRuler: true,
    renderLineHighlightOnlyWhenFocus: true,
    scrollbar: scrollbarOptions(classicScrollbars),
    // Меню правой кнопки - наше (EditorContextMenu): своё Monaco рисует в теневом DOM внутри
    // панели, куда не доходят цвета темы, и край панели его обрезает.
    contextmenu: false,
    // Необычные переводы строк (U+2028 в JSON и минифицированном коде) Monaco по умолчанию
    // предлагает удалить системным окном, а «да» молча переписало бы файл.
    unusualLineTerminators: 'off',
    // Буквы, похожие на латинские, Monaco обводит рамкой как возможную подмену символа. Для
    // кириллицы это каждая с, у, а, о в русском тексте и комментариях - шум, а не находка.
    // Невидимые символы (широкий пробел и подобные) рамкой по-прежнему: глазом их не отличить.
    unicodeHighlight: { ambiguousCharacters: false },
  } satisfies editor.IStandaloneEditorConstructionOptions
}

/** Редактор файла: модель ставится, когда файл прочитан; справа миникарта вместо полосы. */
export const editorOptions = (
  classicScrollbars: boolean,
): editor.IStandaloneEditorConstructionOptions => ({
  model: null,
  ...codeOptions(classicScrollbars),
  scrollbar: fileScrollbarOptions(classicScrollbars),
  minimap: minimapOptions(),
})

/**
 * Что из настроек разницы выбирает человек: две колонки или одна, свёрнуто ли
 * неизменённое (вокруг правки остаются три строки, как в WebStorm).
 */
export const diffViewOptions = ({
  layout,
  collapsed,
}: DiffViewOptions): editor.IDiffEditorOptions => ({
  renderSideBySide: layout === 'sideBySide',
  hideUnchangedRegions: {
    enabled: collapsed,
    contextLineCount: DIFF_CONTEXT_LINES,
    minimumLineCount: DIFF_CONTEXT_LINES,
    revealLineCount: DIFF_REVEAL_LINES,
  },
})

/**
 * Разница файла с последним коммитом, как в WebStorm: вид (две колонки или одна) и
 * сворачивание неизменённого выбирает человек, и выбор не подменяется сам - узкая середина
 * не переводит две колонки в одну. Пробелы не игнорируются: файл в списке изменений из-за
 * отступов должен показать отступы. Левая сторона (коммит) не правится, правая - сам файл,
 * стрелки между ними возвращают кусок из коммита, как » в WebStorm.
 */
export const diffEditorOptions = (
  classicScrollbars: boolean,
  view: DiffViewOptions,
): editor.IStandaloneDiffEditorConstructionOptions => ({
  ...codeOptions(classicScrollbars),
  ...diffViewOptions(view),
  originalEditable: false,
  ignoreTrimWhitespace: false,
  useInlineViewWhenSpaceIsLimited: false,
  renderMarginRevertIcon: true,
  renderGutterMenu: false,
  // Поле значков справа - место стрелки «вернуть кусок из коммита» у изменённых строк.
  glyphMargin: true,
  renderOverviewRuler: true,
  enableSplitViewResizing: true,
  diffWordWrap: 'off',
})
