import { I18nextProvider } from 'react-i18next'

import { panelI18n } from '../panel-i18n'
import { PanelFrame } from '../PanelFrame/PanelFrame'
import { PanelProviderContext } from '../../../state/panel-provider.context'
import type { ProviderPanelProps } from './ProviderPanel.types'

/**
 * Правая панель провайдера (ADR 0083): общая панель, которой сказано, чей она. Запросы, кэш,
 * события и слова (panel-i18n.ts) внутри - этого провайдера; чего он не умеет, панель не
 * показывает (state.capabilities).
 */
export const ProviderPanel = ({ provider, onReload }: ProviderPanelProps) => (
  <PanelProviderContext.Provider value={provider}>
    <I18nextProvider i18n={panelI18n(provider)}>
      <PanelFrame onReload={onReload} />
    </I18nextProvider>
  </PanelProviderContext.Provider>
)
