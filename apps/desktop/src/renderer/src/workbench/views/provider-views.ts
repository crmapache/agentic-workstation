import { lazy } from 'react'

import { PROVIDER_ICONS, PROVIDER_LABEL_KEYS } from '../../lib/provider-panels.constants'
import type { ProviderViewId } from '../../state/layout.types'
import type { ViewDescriptor } from './views.types'

/**
 * GUI провайдеров LLM для правой панели (зона 7) в порядке иконок зоны 3. GUI
 * провайдера тяжёлый, поэтому грузится только при первом показе. Новый провайдер:
 * id в ProviderViewId, фича в features/, запись здесь (docs/architecture.md).
 */
export const PROVIDER_VIEWS: readonly ViewDescriptor<ProviderViewId>[] = [
  {
    id: 'claude-code',
    icon: PROVIDER_ICONS.claude,
    labelKey: PROVIDER_LABEL_KEYS.claude,
    // Панель за границей ошибок: упавшая отрисовка - экран «Reload the panel», а не пустота.
    Component: lazy(() =>
      import('../../features/agent-panel/ClaudeCodePanel/ClaudeCodePanel').then((module) => ({
        default: module.ClaudeCodePanel,
      })),
    ),
  },
  {
    // Codex (ADR 0083): та же панель провайдера, свои вкладки, настройки и лимиты.
    id: 'codex',
    icon: PROVIDER_ICONS.codex,
    labelKey: PROVIDER_LABEL_KEYS.codex,
    Component: lazy(() =>
      import('../../features/agent-panel/CodexPanel/CodexPanel').then((module) => ({
        default: module.CodexPanel,
      })),
    ),
  },
  {
    // Google Antigravity (ADR 0092): `agy acp`, только чат человека (ADR 0094).
    id: 'antigravity',
    icon: PROVIDER_ICONS.antigravity,
    labelKey: PROVIDER_LABEL_KEYS.antigravity,
    Component: lazy(() =>
      import('../../features/agent-panel/AntigravityPanel/AntigravityPanel').then((module) => ({
        default: module.AntigravityPanel,
      })),
    ),
  },
  {
    // Kimi Code (ADR 0092): `kimi acp`.
    id: 'kimi',
    icon: PROVIDER_ICONS.kimi,
    labelKey: PROVIDER_LABEL_KEYS.kimi,
    Component: lazy(() =>
      import('../../features/agent-panel/KimiPanel/KimiPanel').then((module) => ({
        default: module.KimiPanel,
      })),
    ),
  },
  {
    // Открытые модели (ADR 0084): OpenCode с моделями из подключений - локальных и облачных.
    id: 'open-models',
    icon: PROVIDER_ICONS.opencode,
    labelKey: PROVIDER_LABEL_KEYS.opencode,
    Component: lazy(() =>
      import('../../features/agent-panel/OpenModelsPanel/OpenModelsPanel').then((module) => ({
        default: module.OpenModelsPanel,
      })),
    ),
  },
]
