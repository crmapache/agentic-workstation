import { lazy } from 'react'
import { Boxes, SquareTerminal } from 'lucide-react'

import { AI_ICON } from '../../lib/ai-icon.constants'
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
    icon: AI_ICON,
    labelKey: 'providerViews.claudeCode',
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
    icon: SquareTerminal,
    labelKey: 'providerViews.codex',
    Component: lazy(() =>
      import('../../features/agent-panel/CodexPanel/CodexPanel').then((module) => ({
        default: module.CodexPanel,
      })),
    ),
  },
  {
    // Открытые модели (ADR 0084): OpenCode с моделями из подключений - локальных и облачных.
    id: 'open-models',
    icon: Boxes,
    labelKey: 'providerViews.openModels',
    Component: lazy(() =>
      import('../../features/agent-panel/OpenModelsPanel/OpenModelsPanel').then((module) => ({
        default: module.OpenModelsPanel,
      })),
    ),
  },
]
