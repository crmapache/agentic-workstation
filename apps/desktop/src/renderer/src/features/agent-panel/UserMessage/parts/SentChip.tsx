import { memo } from 'react'
import { useTranslation } from 'react-i18next'

import styles from '../UserMessage.module.scss'
import type { SentChipProps } from '../UserMessage.types'
import { chipLabel } from '../../chips.utils'
import { rangePlace } from '../../message.utils'
import { DraftChipView } from '../../DraftChipView/DraftChipView'
import { PathLink } from '../../PathLink/PathLink'

/**
 * Вложение в отправленном сообщении: та же плашка, что в поле (DraftChipView), но
 * нажимается - файл и кусок файла открываются в редакторе на своём месте, папка - в
 * дереве, картинка (вставленная или выбранная) - крупно, а под курсором показывает себя.
 * Команда, цитата и вставка - просто плашка с подсказкой; свёрнутую вставку лента
 * раскрывает своим видом.
 */
export const SentChip = memo(({ chip, picture, onOpen }: SentChipProps) => {
  const { t } = useTranslation()
  const isLink = chip.kind === 'file' || chip.kind === 'dir' || chip.kind === 'ref'

  if (isLink) {
    const place = chip.kind === 'ref' && chip.range ? rangePlace(chip.range) : {}

    return (
      <PathLink
        request={{ path: chip.value, ...place }}
        folder={chip.kind === 'dir'}
        tone="inherit">
        <DraftChipView chip={chip} />
      </PathLink>
    )
  }

  if (chip.kind === 'img' && onOpen) {
    return (
      <button
        type="button"
        className={styles.chipButton}
        aria-label={t('agentPanel.picture.open', { name: chipLabel(chip) })}
        onClick={onOpen}>
        <DraftChipView chip={chip} picture={picture} opens />
      </button>
    )
  }

  return <DraftChipView chip={chip} picture={picture} />
})

SentChip.displayName = 'SentChip'
