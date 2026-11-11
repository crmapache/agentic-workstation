import type { PanelSide, MainViewId, SideViewId, ProviderViewId } from './layout.types'

/** Виды, которые есть сейчас. Сохранённый вид не из списка - удалённый, его не открыть. */
export const SIDE_VIEW_IDS: readonly SideViewId[] = ['files', 'changes']
export const MAIN_VIEW_IDS: readonly MainViewId[] = [
  'file',
  'scenarios',
  'statistics',
  'connectors',
]
export const PROVIDER_VIEW_IDS: readonly ProviderViewId[] = ['claude-code']

/**
 * Уже панель не бывает. Потолка нет: шире панель растёт только в место середины, а та,
 * когда места мало, сворачивается сама - панель дотягивается до самой полосы иконок.
 */
export const PANEL_MIN_WIDTH: Record<PanelSide, number> = { side: 180, provider: 300 }

/**
 * Меньше этого месту середины не быть: уже 300 у листа в нём ни код, ни сценарии не
 * читаются, и середина сворачивается сама, пока место не вернётся. Место считается
 * вместе с зазором до правой панели (Workbench.module.scss), отсюда 300 + --space-2.
 * Окно не уже MIN_WINDOW_SIZE главного процесса, а его хватает на обе панели на
 * минимуме и середину на этом пределе - поэтому показать её по просьбе можно всегда.
 */
export const MAIN_MIN_WIDTH = 308

export const DEFAULT_PANEL_WIDTH: Record<PanelSide, number> = {
  side: 280,
  // Разговор с Claude Code - это лента с кодом и диффами: уже 520 ей тесно.
  provider: 520,
}

/**
 * Ниже терминал не бывает (просьба владельца), и панель провайдера над ним - тоже, пока
 * колонке хватает места на обоих. Не хватает - делят её пополам (ADR 0037).
 */
export const TERMINAL_MIN_HEIGHT = 250
export const PROVIDER_MIN_HEIGHT = 250

/** Открытый терминал - половина колонки, как попросил владелец. */
export const DEFAULT_TERMINAL_SHARE = 0.5

/** Ключ в localStorage. Версия в имени: сменилась форма - старое не подхватится. */
export const LAYOUT_STORAGE_KEY = 'agentic-workstation.layout.v1'
