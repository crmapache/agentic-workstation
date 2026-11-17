import { useTranslation } from 'react-i18next'

import type { ConversationWire } from '@agentic-workstation/remote-protocol/wire-types'
import { Badge } from '@agentic-workstation/ui/Badge'

import { modeShortLabel } from '../../../../lib/options.utils'
import { conversationBadge } from '../../../../lib/status.constants'
import { StatusLine } from '../../../../shell/StatusLine/StatusLine'

/**
 * Под заголовком разговора: состояние (или чем кончился ход), за ним режим, если он не
 * «спрашивать», и модель с усилием. Режим - сразу за меткой, а не в конце, как у индикатора окна:
 * длинная строка режется с конца, а разговор, оставленный в Bypass или Auto, должен быть виден
 * с первого взгляда.
 */
export const ConversationSubtitle = ({
  conversation,
  model,
}: {
  conversation: ConversationWire
  model: string
}) => {
  const { t } = useTranslation()
  const badge = conversationBadge(conversation)
  const text = [
    modeShortLabel(t, conversation.permissionMode),
    model,
    conversation.effort &&
      t(`effort.${conversation.effort}`, { defaultValue: conversation.effort }),
  ]
    .filter(Boolean)
    .join(' · ')

  return <StatusLine badge={<Badge tone={badge.tone}>{t(badge.key)}</Badge>} text={text} />
}
