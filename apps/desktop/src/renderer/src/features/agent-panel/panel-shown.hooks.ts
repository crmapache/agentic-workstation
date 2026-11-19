import type { ProviderId } from '@shared/providers'

import { PROVIDER_VIEW_OF } from '../../state/layout.constants'
import { useLayoutStore } from '../../state/layout.store'
import type { PanelState, ProviderViewId } from '../../state/layout.types'
import { usePanelProvider } from '../../state/panel-provider.context'

/**
 * Видна ли панель провайдера owner: полоса зоны 3 открыта и в ней - она. Смонтированы все
 * панели сразу, поэтому всё, что приходит в окно целиком (⌘W от меню, кусок «Send to Chat»,
 * зов), берёт только видная.
 */
export const isProviderPanelShown = (
  provider: PanelState<ProviderViewId>,
  owner: ProviderId,
): boolean => provider.isOpen && provider.activeViewId === PROVIDER_VIEW_OF[owner]

/** Видна ли панель из контекста. */
export const usePanelShown = (): boolean => {
  const owner = usePanelProvider()

  return useLayoutStore((state) => isProviderPanelShown(state.provider, owner))
}

/**
 * Выбрана ли панель из контекста в полосе зоны 3 - и при свёрнутой полосе: её настройки вида
 * (спокойные шкалы) - на всё окно, пока выбрана она.
 */
export const usePanelSelected = (): boolean => {
  const viewId = PROVIDER_VIEW_OF[usePanelProvider()]

  return useLayoutStore((state) => state.provider.activeViewId === viewId)
}
