import { MAX_CALL_DOTS } from './ProjectTab.constants'
import type { ProjectCall } from './ProjectTab.types'

/** Точки на вкладке: самые новые справа, старые сверх предела - числом слева. */
export const callDots = (
  calls: readonly ProjectCall[],
): { shown: readonly ProjectCall[]; hidden: number } => ({
  shown: calls.slice(-MAX_CALL_DOTS),
  hidden: Math.max(0, calls.length - MAX_CALL_DOTS),
})

/** Подсказка вкладки: путь проекта, под ним - каждый позвавший разговор своей строкой. */
export const tabHint = (rootPath: string, calls: readonly ProjectCall[]): string =>
  [rootPath, ...calls.map((call) => call.text)].join('\n')
