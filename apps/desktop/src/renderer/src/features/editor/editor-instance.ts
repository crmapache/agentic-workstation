import type { editor } from 'monaco-editor/editor/editor.api.js'

import { onTextSizeApplied } from '../../state/text-size.store'
import { MINIMAP_WIDTH, MONACO_FIND_COMMANDS } from './editor.constants'
import { useEditorStore } from './editor.store'
import { minimapColumns } from './editor.utils'
import { monaco } from './monaco-setup'
import { editorTypography } from './monaco-theme'

type Editor = editor.IStandaloneCodeEditor

/** То, у чего Monaco меняет настройки на ходу: редактор файла и редактор разницы целиком. */
type Configurable = { updateOptions: (options: editor.IEditorOptions) => void }

/**
 * Общее у редактора файла и сторон разницы: Monaco настраивается одинаково, где бы код ни
 * стоял. Здесь - то, что делается с готовым экземпляром.
 */

/** Палитра команд Monaco строится из этого списка: без поиска, его панели в IDE нет. */
export const hideFindFromPalette = (instance: Editor) => {
  const supportedActions = instance.getSupportedActions.bind(instance)

  instance.getSupportedActions = () =>
    supportedActions().filter((action) => !MONACO_FIND_COMMANDS.has(action.id))
}

/**
 * Просьба отдать клавиатуру - редактору активной вкладки: фокус и то, что просили сделать
 * следом (⌘Z вне кода - отмена в нём, editor-sync.hooks.ts).
 */
export const takeFocus = (instance: Editor | null) => {
  const then = useEditorStore.getState().focusThen

  instance?.focus()
  if (then) instance?.trigger('keyboard', then, null)
}

/**
 * Шрифт кода подгружается, когда им впервые пишут, а Monaco меряет буквы при создании:
 * без перемера после загрузки курсор встал бы мимо букв.
 */
export const remeasureWhenLoaded = () => {
  const { fontFamily, fontSize } = editorTypography()

  void document.fonts
    .load(`${fontSize}px ${fontFamily}`)
    .then(() => monaco.editor.remeasureFonts())
    .catch(() => undefined)
}

/**
 * Кегль кода - за размером текста IDE (Settings → Appearance): Monaco считает буквы сам и
 * про переменную на корне документа не знает, ему кегль передаётся числом. Возвращает
 * отписку.
 */
export const followTextSize = (instance: Configurable) =>
  onTextSizeApplied(() => instance.updateOptions(editorTypography()))

/**
 * Миникарта - шириной MINIMAP_WIDTH на любом экране. Колонки в ней зависят от плотности
 * экрана, а окно переезжает между Retina и обычным монитором на ходу: Monaco тогда сам
 * перекладывает редактор, и здесь колонки пересчитываются под новую плотность. Возвращает
 * отписку.
 */
export const holdMinimapWidth = (instance: Editor) =>
  instance.onDidLayoutChange(() => {
    const columns = minimapColumns(window.devicePixelRatio, MINIMAP_WIDTH)
    const { minimap } = instance.getRawOptions()

    if (minimap?.enabled && minimap.maxColumn !== columns) {
      instance.updateOptions({ minimap: { maxColumn: columns } })
    }
  })
