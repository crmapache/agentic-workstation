import { useState } from 'react'

import { useQueryClient } from '@tanstack/react-query'

import type { PanelFrameProps } from '../ClaudeCodePanel.types'
import { ClaudeCodeView } from '../../ClaudeCodeView/ClaudeCodeView'
import { PanelCrash } from '../../PanelCrash/PanelCrash'
import { usePanelProvider } from '../../../../state/panel-provider.context'

/**
 * Панель провайдера целиком - за границей ошибок. «Reload the panel» собирает её заново:
 * зеркала данных главного процесса перечитываются (общее - под ключом провайдера, своё
 * провайдера - onReload), дерево монтируется с нуля, а окно IDE и разговоры (они в главном
 * процессе) остаются как были.
 */
export const PanelFrame = ({ onReload }: PanelFrameProps) => {
  const queryClient = useQueryClient()
  const provider = usePanelProvider()
  const [generation, setGeneration] = useState(0)

  const handleReload = () => {
    void queryClient.resetQueries({ queryKey: ['agent', provider] })
    onReload?.()
    setGeneration((value) => value + 1)
  }

  return (
    <PanelCrash key={generation} onReload={handleReload}>
      <ClaudeCodeView />
    </PanelCrash>
  )
}
