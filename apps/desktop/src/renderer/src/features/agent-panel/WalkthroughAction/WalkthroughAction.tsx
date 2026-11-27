import { Presentation } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { isWalkthroughReady } from '@shared/walkthrough'

import { IconButton } from '@agentic-workstation/ui/IconButton'

import { useActionNoticeStore } from '../../../state/action-notice.store'
import { useConnectors } from '../../../state/connectors.queries'
import { usePanelProvider } from '../../../state/panel-provider.context'
import { useVoice, useStartWalkthrough } from '../../../state/voice.queries'
import type { WalkthroughActionProps } from './WalkthroughAction.types'

/**
 * Показ Walkthrough из панели (ADR 0134): голосовой звонок в выбранном разговоре, IDE спрашивает,
 * что показать. Кнопки нет, пока коннектор Walkthrough с Computer Use и Browser не видны в
 * проекте; голос недоступен или звонок уже идёт - серая, почему - в подсказке.
 */
export const WalkthroughAction = ({ projectPath, conversationId }: WalkthroughActionProps) => {
  const { t } = useTranslation()
  const provider = usePanelProvider()
  const connectors = useConnectors().data?.connectors
  const voice = useVoice()
  const { start, isStarting } = useStartWalkthrough()
  const showNotice = useActionNoticeStore((state) => state.show)

  if (!voice || !connectors || !isWalkthroughReady(connectors, projectPath)) return null

  const { capability, call } = voice
  const label = !capability.available
    ? t(`voice.unavailable.${capability.reason}`)
    : call
      ? t('voice.refused.busy')
      : t('walkthrough.startTitle')

  const handleStart = async () => {
    const outcome = await start({ provider, projectPath, conversationId })

    if (!outcome.ok) showNotice({ tone: 'danger', title: t(`voice.refused.${outcome.reason}`) })
  }

  return (
    <IconButton
      icon={Presentation}
      label={label}
      disabled={!capability.available || call !== null || isStarting}
      onClick={() => void handleStart()}
    />
  )
}
