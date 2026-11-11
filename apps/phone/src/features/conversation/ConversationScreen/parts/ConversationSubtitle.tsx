import { useTranslation } from 'react-i18next'

import type { ConversationWire } from '@agentic-workstation/remote-protocol/wire-types'
import { Badge } from '@agentic-workstation/ui/Badge'

import { CONVERSATION_TONES } from '../../../../lib/status.constants'

/** Под заголовком разговора: состояние и модель с усилием. */
export const ConversationSubtitle = ({
  conversation,
  model,
}: {
  conversation: ConversationWire
  model: string
}) => {
  const { t } = useTranslation()

  return (
    <>
      <Badge tone={CONVERSATION_TONES[conversation.status]}>
        {t(`status.${conversation.status}`)}
      </Badge>
      {[
        model,
        conversation.effort &&
          t(`effort.${conversation.effort}`, { defaultValue: conversation.effort }),
      ]
        .filter(Boolean)
        .join(' · ')}
    </>
  )
}
