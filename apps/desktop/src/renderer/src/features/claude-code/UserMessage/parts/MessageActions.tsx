import { useMemo } from 'react'
import { Copy, Check, Undo2, History } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconButton } from '@agentic-workstation/ui/IconButton'
import { MenuItem } from '@agentic-workstation/ui/MenuItem'

import styles from '../UserMessage.module.scss'
import type { MessageActionsProps } from '../UserMessage.types'
import { useClaudeCodeStore } from '../../claude-code.store'
import { useCopy } from '../../clipboard.hooks'
import { useFeedScope } from '../../feed-scope.context'
import { applyDraft } from '../../field-bus'
import { useReuseDraft } from '../../message.hooks'
import { lostImages, messageClipboard } from '../../message.utils'
import { MessageMenu } from '../../MessageMenu/MessageMenu'
import { PinButton } from '../../PinButton/PinButton'
import { PinItem } from '../../PinItem/PinItem'

/**
 * Угол своего сообщения, как в ACC: горящая булавка (только у закреплённого), копия (с
 * путями вложений) и три точки. В меню - вернуть в поле, закрепить, откатить; откат
 * последний: он забирает. Что картинка не вернётся в поле, вторая строка пункта говорит до
 * нажатия; написанное посреди хода откатить нельзя - пункт погашен и говорит, к чему
 * откатываться.
 */
export const MessageActions = ({ item, draft }: MessageActionsProps) => {
  const { t } = useTranslation()
  const { conversationId, readOnly } = useFeedScope()
  const { isCopied, copy } = useCopy()
  const openRewind = useClaudeCodeStore((store) => store.openRewind)
  const reuseDraft = useReuseDraft()
  const lost = useMemo(() => lostImages(draft, item.images.length), [draft, item.images.length])

  const handleCopy = () => copy(messageClipboard(draft))

  const handleReuse = () => {
    void reuseDraft(conversationId, item, draft).then((reused) =>
      applyDraft(conversationId, reused),
    )
  }

  const handleRewind = () => openRewind({ conversationId, messageId: item.id })

  const copyButton = (
    <IconButton
      icon={isCopied ? Check : Copy}
      size="sm"
      label={isCopied ? t('claudeCode.message.copied') : t('claudeCode.message.copy')}
      onClick={handleCopy}
    />
  )

  // Журнал чужого разговора: копия остаётся, а вернуть в поле, закрепить и откатить там нечего.
  if (readOnly) return <div className={styles.actions}>{copyButton}</div>

  return (
    <div className={styles.actions}>
      <PinButton conversationId={conversationId} itemId={item.id} />
      {copyButton}
      <MessageMenu>
        <MenuItem
          icon={Undo2}
          label={t('claudeCode.message.reuse')}
          description={
            lost > 0 ? t('claudeCode.message.reuseLostImages', { count: lost }) : undefined
          }
          wrapDescription
          onSelect={handleReuse}
        />
        <PinItem conversationId={conversationId} itemId={item.id} />
        <MenuItem
          icon={History}
          label={t('claudeCode.message.rewind')}
          description={
            item.steering
              ? t('claudeCode.message.rewindSteering')
              : t('claudeCode.message.rewindSub')
          }
          wrapDescription
          disabled={item.steering}
          onSelect={handleRewind}
        />
      </MessageMenu>
    </div>
  )
}
