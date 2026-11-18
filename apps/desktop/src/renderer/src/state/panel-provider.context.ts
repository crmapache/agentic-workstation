import { useContext, createContext } from 'react'

import type { ProviderId } from '@shared/providers'

/**
 * Провайдер панели, внутри которой рисуется компонент (ADR 0083): панели Claude, Codex и
 * открытых моделей - один код, запросы и кэш - по провайдеру. Без обёртки - Claude: так
 * рисуются и экраны, которые есть только у него.
 */
export const PanelProviderContext = createContext<ProviderId>('claude')

/** Провайдер своей панели - для каналов `agent:*` и ключей кэша. */
export const usePanelProvider = (): ProviderId => useContext(PanelProviderContext)
