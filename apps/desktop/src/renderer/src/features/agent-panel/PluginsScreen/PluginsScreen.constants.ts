import type { PluginsTab } from './PluginsScreen.types'

export const TABS: readonly PluginsTab[] = ['installed', 'browse', 'marketplaces']

/** Сколько плагинов каталога показывать: дальше человек уточнит поиск. */
export const BROWSE_LIMIT = 30
