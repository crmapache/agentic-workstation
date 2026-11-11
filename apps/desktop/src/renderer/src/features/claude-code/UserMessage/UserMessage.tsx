import { memo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { DraftChip } from '@shared/claude-draft'

import { Tooltip } from '@agentic-workstation/ui/Tooltip'

import { chipLabel } from '../chips.utils'
import { useFeedScope } from '../feed-scope.context'
import { useMessageDraft } from '../message.hooks'
import type { PictureSource } from '../picture.types'
import { autoWhy } from '../CarryOnRow/CarryOnRow.utils'
import { PictureLightbox } from '../PictureLightbox/PictureLightbox'
import styles from './UserMessage.module.scss'
import type { OpenedPicture, UserMessageProps } from './UserMessage.types'
import { formatClock } from './UserMessage.utils'
import { EditorLine } from './parts/EditorLine'
import { MessageActions } from './parts/MessageActions'
import { MessageBody } from './parts/MessageBody'
import { MessageImages } from './parts/MessageImages'

/**
 * Сообщение человека - карточка с рамкой (как в ACC): в шапке «YOU» и время, в углу
 * кнопки. Ниже - цитаты, с которыми оно ушло (без них вопрос «а почему?» висит в
 * воздухе), слова с живыми ссылками и чипы вложений, картинки, строка редактора.
 */
export const UserMessage = memo(({ item }: UserMessageProps) => {
  const { t } = useTranslation()
  const { conversationId } = useFeedScope()
  const draft = useMessageDraft(conversationId, item)
  const [openedImage, setOpenedImage] = useState<number | null>(null)
  const [openedPicture, setOpenedPicture] = useState<OpenedPicture | null>(null)
  const why = autoWhy(item.auto, t)

  const handleOpenPicture = (source: PictureSource, chip: DraftChip) =>
    setOpenedPicture({ source, label: chipLabel(chip) })

  const handleClosePicture = () => setOpenedPicture(null)

  return (
    <div className={styles.userMessage}>
      <div className={styles.head}>
        {/* Написала панель (продолжение оборванной работы) - PANEL, причина в подсказке. */}
        <Tooltip label={why} disabled={!why} placement="top">
          <span className={styles.label}>
            {item.auto ? t('claudeCode.carryOn.label') : t('claudeCode.message.you')}
          </span>
        </Tooltip>
        <span className={styles.time}>{formatClock(item.time)}</span>
      </div>
      <MessageActions item={item} draft={draft} />
      {draft.quotes.map((quote, index) => (
        <blockquote key={index} className={styles.quote}>
          {quote}
        </blockquote>
      ))}
      <MessageBody
        tokens={draft.tokens}
        messageId={item.id}
        onOpenImage={setOpenedImage}
        onOpenPicture={handleOpenPicture}
      />
      <MessageImages item={item} opened={openedImage} onOpen={setOpenedImage} />
      {openedPicture && (
        <PictureLightbox
          source={openedPicture.source}
          label={openedPicture.label}
          onClose={handleClosePicture}
        />
      )}
      {item.editor && <EditorLine editor={item.editor} />}
    </div>
  )
})

UserMessage.displayName = 'UserMessage'
