import { useTranslation } from 'react-i18next'

import { FAST_REASON_KEYS } from '../NoticeRow.constants'
import styles from '../NoticeRow.module.scss'
import type { NoticeItemProps } from '../NoticeRow.types'
import { LabelRow } from './LabelRow'

/**
 * Отметки с подписью, как в ACC: SESSION - процесс упал (с кодом выхода и причиной из
 * stderr), FAST - быстрый режим не включился и почему, SETTINGS - репозиторий перебивает
 * выбранный аккаунт: чьи имена, без значений. CONNECTORS - процесс поднялся без
 * коннекторов IDE.
 */
export const NoticeLabelRow = ({ item }: NoticeItemProps) => {
  const { t } = useTranslation()

  if (item.code === 'fast') {
    const reason = FAST_REASON_KEYS[item.detail]

    return (
      <LabelRow label={t('claudeCode.notice.fast.label')} tone="warning">
        {t('claudeCode.notice.fast.title')}{' '}
        <span className={styles.muted}>
          {reason ? t(reason) : t('claudeCode.notice.fast.reasons.unknown')}
        </span>
        <span className={styles.reason}>{t('claudeCode.notice.fast.hint')}</span>
      </LabelRow>
    )
  }

  if (item.code === 'connectors-missing') {
    return (
      <LabelRow label={t('claudeCode.notice.connectorsMissing.label')} tone="warning">
        {t('claudeCode.notice.connectorsMissing.text')}
      </LabelRow>
    )
  }

  if (item.code === 'outranked') {
    return (
      <LabelRow label={t('claudeCode.notice.outranked.label')} tone="warning">
        {t('claudeCode.notice.outranked.text')}{' '}
        <span className={styles.modelTo}>{item.detail}</span>
      </LabelRow>
    )
  }

  const code = /^\d+$/.test(item.detail) ? item.detail : ''

  return (
    <LabelRow label={t('claudeCode.notice.crash.label')} tone="danger">
      {code ? t('claudeCode.notice.crash.withCode', { code }) : t('claudeCode.notice.crash.text')}
      {item.detail && !code && <span className={styles.reason}>{item.detail}</span>}
    </LabelRow>
  )
}
