import { PackageOpen } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { FeedStubWire } from '@agentic-workstation/remote-protocol/wire-types'

import { ROW_ICON_SIZE, ROW_ICON_STROKE } from '../Feed.constants'
import styles from '../Feed.module.scss'
import { text, toolLabel } from '../Feed.utils'

/**
 * Элемент ленты, который IDE не смогла уместить в кадр даже урезанным: вид, имя и состояние,
 * что пришли простыми полями, и честное «слишком большой для телефона» - целиком он в IDE.
 */
export const StubItem = ({ item }: { item: FeedStubWire }) => {
  const { t } = useTranslation()
  const name = toolLabel(text(item, 'name'))
  const state = text(item, 'status') || text(item, 'state')

  return (
    <div className={styles.stub}>
      <PackageOpen size={ROW_ICON_SIZE} strokeWidth={ROW_ICON_STROKE} aria-hidden />
      <span className={styles.toolName}>
        {t(`feed.kinds.${item.kind}`, { defaultValue: item.kind })}
      </span>
      {name && <span className={styles.toolSummary}>{name}</span>}
      {state && (
        <span className={styles.steps}>
          {t(`feed.toolStatus.${state}`, { defaultValue: state })}
        </span>
      )}
      <span className={styles.stubNote}>{t('feed.tooBig')}</span>
    </div>
  )
}
