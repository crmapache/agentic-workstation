import type { MarkdownLayout } from './editor.types'

export const MARKDOWN_LAYOUT_STORAGE_KEY = 'agentic-workstation.markdown-layout.v1'

/** Как открывается первый файл Markdown, пока вид ни разу не выбирали: как было - кодом. */
export const DEFAULT_MARKDOWN_LAYOUT: MarkdownLayout = 'editor'

/**
 * Доля ширины под код, когда рядом просмотр: поровну, как в WebStorm. Ручка двигает
 * её, но ни код, ни просмотр не ужимаются до нечитаемой полоски.
 */
export const SPLIT_RATIO_DEFAULT = 0.5
export const SPLIT_RATIO_MIN = 0.2
export const SPLIT_RATIO_MAX = 0.8
