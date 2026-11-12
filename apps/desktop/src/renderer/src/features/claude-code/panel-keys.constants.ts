import { IS_MAC } from '../../lib/platform'

/**
 * Клавиши панели Claude Code плашками (порядок модификаторов как у macOS: ⌃ ⌥ ⇧ ⌘).
 * Действуют, пока фокус в правой панели; ⌘W ловит меню приложения и отдаёт панели
 * (main/menu.ts), остальные слушает сама панель (ClaudeCodeView). Поменял клавишу -
 * поправь и здесь: по этим плашкам рисуются подсказки.
 */
export const PANEL_KEYS = {
  nextTab: ['⇧', '⌘', ']'],
  previousTab: ['⇧', '⌘', '['],
  newTab: ['⌘', 'T'],
  closeTab: ['⌘', 'W'],
  reopenTab: ['⇧', '⌘', 'T'],
  /** Поиск по разговорам - только из панели: поиск в других зонах окна не перехватывается. */
  search: ['⌘', 'F'],
} as const satisfies Record<string, readonly string[]>

export type PanelKey = keyof typeof PANEL_KEYS

/**
 * «Открыть панель» (Open the panel в ACC) - клавиша всего окна, а не панели: показывает
 * правую панель с Claude Code и ставит клавиатуру в поле; из самой панели - прячет её.
 * ⌘Esc - как быстрый вызов Claude Code в расширениях для VS Code и JetBrains; в IDE и macOS
 * она ничем не занята. На Windows Ctrl+Esc открывает «Пуск» и до окна не доходит - там
 * Ctrl+Shift+Space (⇧⌘Space в записи мака, ADR 0048). Слушает workbench (actions/claude-panel.ts).
 */
export const OPEN_PANEL_KEY: readonly string[] = IS_MAC ? ['⌘', 'Esc'] : ['⇧', '⌘', 'Space']
