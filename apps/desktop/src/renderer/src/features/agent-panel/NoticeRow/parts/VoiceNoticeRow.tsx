import { useTranslation } from 'react-i18next'

import { VOICE_END_KEYS } from '../NoticeRow.constants'
import styles from '../NoticeRow.module.scss'
import type { NoticeItemProps } from '../NoticeRow.types'
import { LabelRow } from './LabelRow'

/**
 * Отметки голосового звонка (ADR 0104), подписью VOICE: звонок начался (из панели или с
 * телефона), кончился (и почему, если не положили сами), ответ перебит - и что человек успел
 * услышать: в ленте ответ целиком, а услышал он только начало.
 */
export const VoiceNoticeRow = ({ item }: NoticeItemProps) => {
  const { t } = useTranslation()
  const label = t('agentPanel.notice.voice.label')

  if (item.code === 'voice-heard') {
    return (
      <LabelRow label={label}>
        <span className={styles.muted}>
          {t('agentPanel.notice.voice.heard', { heard: item.detail })}
        </span>
      </LabelRow>
    )
  }

  if (item.code === 'voice-started') {
    return (
      <LabelRow label={label}>
        {item.detail === 'phone'
          ? t('agentPanel.notice.voice.started.phone')
          : t('agentPanel.notice.voice.started.desktop')}
      </LabelRow>
    )
  }

  const why = VOICE_END_KEYS[item.detail]

  return (
    <LabelRow label={label}>
      {t('agentPanel.notice.voice.ended')}
      {why && <span className={styles.reason}>{t(why)}</span>}
    </LabelRow>
  )
}
