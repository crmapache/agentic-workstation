import type { DraftChip } from '@shared/message-draft'
import type { ProviderId } from '@shared/providers'

import { useBarArrangement } from './bar-buttons.store'
import { shownIds } from './bar-buttons.utils'
import { useChatHandoffStore } from './chat-handoff.store'
import { PANEL_PROVIDERS, PROVIDER_VIEW_OF, PROVIDER_VIEW_IDS } from './layout.constants'
import { useLayoutStore } from './layout.store'
import { useProviders } from './providers.queries'
import { useActiveProject } from './workspace.queries'

/** Чат провайдера, куда можно передать работу: не установлен - пункт виден, но погашен. */
export type ChatTarget = { provider: ProviderId; missing: boolean }

/**
 * Куда передать работу в новый чат ИИ («Implement» у карточки трекера, «Ask AI» у накладки
 * звонков): провайдеры, чьи кнопки стоят на правой полосе, в её порядке - спрятанную кнопку
 * человек убрал как ненужную. Передача кладёт чип в новый разговор выбранного провайдера в
 * открытом проекте и показывает его панель; отправляет человек. Проекта нет - передавать
 * некуда (null).
 */
export const useChatTargets = () => {
  const project = useActiveProject()
  const { data: providers = [] } = useProviders()
  const arrangement = useBarArrangement('provider')
  const showProviderView = useLayoutStore((state) => state.showProviderView)
  const shown = shownIds(PROVIDER_VIEW_IDS, arrangement, 'top')
  const order = (id: ProviderId) => shown.indexOf(PROVIDER_VIEW_OF[id])
  const targets: ChatTarget[] = PANEL_PROVIDERS.filter((id) => order(id) >= 0)
    .sort((a, b) => order(a) - order(b))
    // Список ещё не пришёл - пункт доступен: отказ, если он будет, скажет сама панель.
    .map((id) => ({
      provider: id,
      missing: providers.find((one) => one.id === id)?.available === false,
    }))

  const hand = project
    ? (provider: ProviderId, chip: DraftChip) => {
        useChatHandoffStore.getState().hand({ projectId: project.id, provider, chip, fresh: true })
        showProviderView(PROVIDER_VIEW_OF[provider])
      }
    : null

  return { targets, hand }
}
