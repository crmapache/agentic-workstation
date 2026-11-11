import { memo } from 'react'
import { useTranslation } from 'react-i18next'

import { ModelNoteRow } from '../ModelNoteRow/ModelNoteRow'
import { ModLogRow } from '../ModLogRow/ModLogRow'
import { ACCOUNT_STOP } from './NoticeRow.constants'
import styles from './NoticeRow.module.scss'
import type { NoticeRowProps } from './NoticeRow.types'
import { CheckpointRow } from './parts/CheckpointRow'
import { CompactRow } from './parts/CompactRow'
import { ErrorRow } from './parts/ErrorRow'
import { ForkSeam } from './parts/ForkSeam'
import { LabelRow } from './parts/LabelRow'
import { LimitRow } from './parts/LimitRow'
import { NoticeLabelRow } from './parts/NoticeLabelRow'
import { RetryRow } from './parts/RetryRow'
import { SessionRow } from './parts/SessionRow'

/**
 * Служебные строки ленты, как в ACC: отметки (cleared, rewound, шов форка), CONTEXT,
 * RETRY, MODEL, LIMIT, SESSION, FAST, SETTINGS и ошибки красной плашкой с крестиком
 * (сюда же - форк, который пришлось нести целиком).
 */
export const NoticeRow = memo(({ item }: NoticeRowProps) => {
  const { t } = useTranslation()

  switch (item.kind) {
    case 'compact':
      return <CompactRow item={item} />
    case 'retry':
      return <RetryRow item={item} />
    case 'limit':
      return <LimitRow item={item} />
    case 'model':
      return (
        <LabelRow label={t('claudeCode.notice.model.label')} tone="warning">
          <span className={styles.modelFrom}>{item.from}</span>
          {' → '}
          <span className={styles.modelTo}>{item.to}</span>{' '}
          <span className={styles.muted}>{t('claudeCode.notice.model.note')}</span>
          {item.reason && <span className={styles.reason}>{item.reason}</span>}
        </LabelRow>
      )
    default:
      break
  }

  switch (item.code) {
    case 'cleared':
      return (
        <CheckpointRow chip={t('claudeCode.notice.chips.clear')}>
          {t('claudeCode.notice.cleared')}
        </CheckpointRow>
      )
    case 'rewound':
      return (
        <CheckpointRow chip={t('claudeCode.notice.chips.rewind')}>
          {t('claudeCode.notice.rewound')}
        </CheckpointRow>
      )
    case 'forked':
      return <ForkSeam item={item} />
    case 'session':
      return <SessionRow item={item} />
    case 'interrupted':
      // Процесс сняла панель ради переезда на другой аккаунт - так и сказано (как в ACC).
      return (
        <div className={styles.quiet}>
          {item.detail === ACCOUNT_STOP
            ? t('claudeCode.notice.interruptedForAccount')
            : t('claudeCode.notice.interrupted')}
        </div>
      )
    case 'process-exited':
    case 'fast':
    case 'outranked':
    case 'connectors-missing':
      return <NoticeLabelRow item={item} />
    // Лог мода CLI и судьба выбора модели (panel/): свои строки рядом.
    case 'mod':
      return <ModLogRow item={item} />
    case 'model-stuck':
    case 'model-swap':
      return <ModelNoteRow item={item} />
    default:
      return <ErrorRow item={item} />
  }
})

NoticeRow.displayName = 'NoticeRow'
