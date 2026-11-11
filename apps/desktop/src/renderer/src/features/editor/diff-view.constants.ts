import type { DiffViewOptions } from './editor.types'

export const DIFF_VIEW_STORAGE_KEY = 'agentic-workstation.diff-view.v1'

/**
 * Как открывается первая разница: две колонки, как в WebStorm, и неизменённое свёрнуто -
 * изменения Claude Code читаются кусками, а не листанием файла целиком.
 */
export const DEFAULT_DIFF_VIEW: DiffViewOptions = { layout: 'sideBySide', collapsed: true }
