import { lazy } from 'react'

/**
 * Редактор с Monaco - отдельным куском: окно стартует без него, а грузится он к первому
 * открытому файлу (ADR 0005). Полоса вкладок и пустые состояния от него не зависят.
 */
export const CodeEditor = lazy(() =>
  import('../CodeEditor/CodeEditor').then((module) => ({ default: module.CodeEditor })),
)

/** Разница файла с последним коммитом - тоже на Monaco, своим куском к первой разнице. */
export const DiffEditor = lazy(() =>
  import('../DiffEditor/DiffEditor').then((module) => ({ default: module.DiffEditor })),
)

/** Локальная история (ADR 0045) - тоже на Monaco, своим куском к первой истории. */
export const LocalHistoryView = lazy(() =>
  import('../LocalHistoryView/LocalHistoryView').then((module) => ({
    default: module.LocalHistoryView,
  })),
)
