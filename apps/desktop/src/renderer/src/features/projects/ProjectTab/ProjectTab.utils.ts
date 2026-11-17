import { MAX_CALL_DOTS } from './ProjectTab.constants'
import type { ProjectCall, ProjectWork } from './ProjectTab.types'

/** Точки на вкладке: самые новые справа, старые сверх предела - числом слева. */
export const callDots = (
  calls: readonly ProjectCall[],
): { shown: readonly ProjectCall[]; hidden: number } => ({
  shown: calls.slice(-MAX_CALL_DOTS),
  hidden: Math.max(0, calls.length - MAX_CALL_DOTS),
})

/**
 * Подсказка вкладки: путь проекта, под ним своими строками - что сейчас работает, потом каждый
 * позвавший разговор.
 */
export const tabHint = (
  rootPath: string,
  work: readonly ProjectWork[],
  calls: readonly ProjectCall[],
): string =>
  [rootPath, ...work.map((item) => item.text), ...calls.map((call) => call.text)].join('\n')
