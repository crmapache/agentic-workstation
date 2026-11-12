import { lazy } from 'react'

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
      import('../../features/claude-code/ClaudeCodePanel/ClaudeCodePanel').then((module) => ({
        default: module.ClaudeCodePanel,
      })),
    ),
  },
]
