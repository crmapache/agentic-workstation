import type { AvailablePlugin, InstalledPlugin } from '@shared/claude-tools'

import { BROWSE_LIMIT } from './PluginsScreen.constants'

/**
 * Каталог под поиск: ещё не установленные, по имени и описанию. Пустой поиск - самые
 * устанавливаемые (каталог уже так отсортирован).
 */
export const searchPlugins = (
  available: readonly AvailablePlugin[],
  installed: readonly InstalledPlugin[],
  query: string,
): AvailablePlugin[] => {
  const owned = new Set(installed.map((plugin) => plugin.id))
  const needle = query.trim().toLowerCase()

  return available
    .filter(
      (plugin) =>
        !owned.has(plugin.id) &&
        (!needle ||
          plugin.name.toLowerCase().includes(needle) ||
          plugin.description.toLowerCase().includes(needle)),
    )
    .slice(0, BROWSE_LIMIT)
}
