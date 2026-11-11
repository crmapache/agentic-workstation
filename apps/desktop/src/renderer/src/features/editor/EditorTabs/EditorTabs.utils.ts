import { isOutsidePath } from '../../../lib/path.utils'
import type { TabTarget } from '../../../state/editor-tabs.types'

/**
 * Подписи вкладок по путям файлов: имя файла, а у одноимённых - с папками над ним, ровно
 * столько, чтобы различались: `index.ts` и `index.ts` становятся `editor/index.ts` и
 * `tabs/index.ts`.
 */
export const tabLabels = (tabPaths: readonly string[]): Map<string, string> => {
  // Файл и разница с ним - один путь: подпись у них общая, различает их иконка.
  const paths = [...new Set(tabPaths)]
  const parts = new Map(paths.map((path) => [path, path.split('/')]))
  const labels = new Map<string, string>()
  const suffix = (path: string, depth: number) => (parts.get(path) ?? []).slice(-depth).join('/')

  for (const path of paths) {
    const segments = parts.get(path) ?? []
    let depth = 1

    while (
      depth < segments.length &&
      paths.some((other) => other !== path && suffix(other, depth) === suffix(path, depth))
    ) {
      depth += 1
    }

    labels.set(path, suffix(path, depth))
  }

  return labels
}

/** Какая подсказка у вкладки: перевод подсказки разницы, истории, файла вне проекта; null - путь. */
export type TabHintKey = 'diffHint' | 'historyHint' | 'projectHistoryHint' | 'outsideHint'

/**
 * Подсказка вкладки: у разницы и истории - что это и чьё, у файла вне проекта - его путь
 * с пометкой, у файла проекта - просто путь от корня.
 */
export const tabHintOf = (target: TabTarget): TabHintKey | null => {
  if (target.kind === 'diff') return 'diffHint'
  if (target.kind === 'history') return target.path === '' ? 'projectHistoryHint' : 'historyHint'

  return isOutsidePath(target.path) ? 'outsideHint' : null
}
