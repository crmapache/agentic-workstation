import { Square, Volume2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconButton } from '@agentic-workstation/ui/IconButton'

import { useReadAloud } from '../read-aloud.hooks'

/**
 * «Прочитать вслух» у ответа модели (ADR 0106): IDE читает его голосом и скоростью из своих
 * настроек, звук идёт сюда через релей. Пока готовится - крутилка, пока звучит - «стоп».
 */
export const ReadAloudButton = ({
  agentId,
  conversationId,
  itemId,
}: {
  agentId: string
  conversationId: string
  itemId: string
}) => {
  const { t } = useTranslation()
  const { phase, toggle } = useReadAloud(agentId, conversationId, itemId)

  return (
    <IconButton
      icon={phase === 'playing' ? Square : Volume2}
      busy={phase === 'loading'}
      label={phase === null ? t('read.start') : t('read.stop')}
      size="touch"
      onClick={toggle}
    />
  )
}
