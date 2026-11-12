import { shortcutLabel } from '../../lib/keys'
import { IS_MAC } from '../../lib/platform'
import type { MenuScreen } from './claude.types'
import type { PanelKey } from './panel-keys.constants'
import { PANEL_KEYS } from './panel-keys.constants'

/** Клавиша одной строкой - для подсказки («⇧⌘T», на Windows «Ctrl+Shift+T»); плашками - Kbd. */
export const keyLine = (key: PanelKey): string => shortcutLabel(PANEL_KEYS[key].join(''))

/** Что из нажатия нужно, чтобы узнать клавишу панели; знак - запасной путь для ⌘F. */
type Stroke = Pick<KeyboardEvent, 'code' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'> & {
  key?: string
}

/**
 * Клавиша панели, которую слушает сама панель, или null. По физической клавише (code),
 * а не по знаку: с Shift `]` печатается `}`, а в другой раскладке - чем угодно. ⌘F - по
 * коду и, в запасе, по букве: там, где F стоит на другом месте. ⌘W здесь нет: его
 * забирает меню приложения (claude:panelKey).
 */
export const panelKeyOf = (stroke: Stroke): Exclude<PanelKey, 'closeTab'> | null => {
  if (!stroke.metaKey || stroke.ctrlKey || stroke.altKey) return null
  if (stroke.code === 'KeyT') return stroke.shiftKey ? 'reopenTab' : 'newTab'
  if (!stroke.shiftKey && (stroke.code === 'KeyF' || stroke.key?.toLowerCase() === 'f')) {
    return 'search'
  }
  if (!stroke.shiftKey) return null
  if (stroke.code === 'BracketRight') return 'nextTab'
  if (stroke.code === 'BracketLeft') return 'previousTab'

  return null
}

/** Нажата ли «открыть панель» (⌘Esc): ровно ⌘ и Esc, автоповтор не в счёт. */
export const isOpenPanelKey = (
  stroke: Pick<
    KeyboardEvent,
    'key' | 'code' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'repeat'
  >,
): boolean =>
  (IS_MAC
    ? stroke.key === 'Escape' && !stroke.shiftKey
    : stroke.code === 'Space' && stroke.shiftKey) &&
  stroke.metaKey &&
  !stroke.ctrlKey &&
  !stroke.altKey &&
  !stroke.repeat

/**
 * Дотягивается ли клавиша сквозь боковое меню. Поверх меню клавиши молчат - мышь там
 * тоже дотягивается только до меню; исключение - возврат закрытой вкладки на экране
 * истории: её строка «Recently closed» прямо под рукой и называет эту клавишу.
 */
export const reachesPastMenu = (key: PanelKey, screen: MenuScreen, reopenable: number): boolean =>
  key === 'reopenTab' && screen === 'history' && reopenable > 0
