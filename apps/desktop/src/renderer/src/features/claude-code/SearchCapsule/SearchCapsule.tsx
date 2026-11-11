import clsx from 'clsx'
import { X, Search, ChevronUp, ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { IconButton } from '@agentic-workstation/ui/IconButton'
import { Spinner } from '@agentic-workstation/ui/Spinner'

import { useSearchStore } from '../search.store'
import styles from './SearchCapsule.module.scss'
import type { SearchCapsuleProps } from './SearchCapsule.types'

/**
 * Поиск, свёрнутый в угол ленты после выбора находки (как в ACC): назад в окно с тем же
 * запросом, «2/5» со стрелками по находкам ЭТОГО разговора (по кругу, только когда есть
 * куда шагать) и крестик - с поиском покончено. Пока лента идёт к находке, над ней
 * непрозрачная вуаль: разговор не открывается концом и не прыгает на глазах.
 */
export const SearchCapsule = ({ conversationId, offset }: SearchCapsuleProps) => {
  const { t } = useTranslation()
  const capsule = useSearchStore((store) =>
    store.capsule?.conversationId === conversationId ? store.capsule : null,
  )
  const openSearch = useSearchStore((store) => store.openSearch)
  const stepHit = useSearchStore((store) => store.stepHit)
  const resetSearch = useSearchStore((store) => store.resetSearch)

  if (!capsule) return null

  const isLoading = capsule.note === 'loading'

  return (
    <>
      <div className={clsx(styles.veil, isLoading && styles.veilOn)} aria-hidden={!isLoading}>
        <Spinner tone="neutral" />
        <span>{t('claudeCode.search.capsule.loading')}</span>
      </div>
      <div
        className={styles.capsule}
        role="toolbar"
        aria-label={t('claudeCode.search.title')}
        // eslint-disable-next-line no-restricted-syntax -- высота полки закреплённых меряется в рантайме
        style={{ top: offset }}>
        <Button variant="ghost" size="sm" icon={Search} onClick={() => openSearch(conversationId)}>
          {t('claudeCode.search.capsule.reopen')}
        </Button>
        {capsule.note === 'missing' && (
          <span className={styles.note}>{t('claudeCode.search.capsule.missing')}</span>
        )}
        {capsule.hits.length > 1 && (
          <>
            <span className={styles.rule} aria-hidden />
            <span className={styles.count}>
              {t('claudeCode.search.capsule.position', {
                at: capsule.at + 1,
                total: capsule.hits.length,
              })}
            </span>
            <IconButton
              icon={ChevronUp}
              size="sm"
              label={t('claudeCode.search.capsule.previous')}
              onClick={() => stepHit(-1)}
            />
            <IconButton
              icon={ChevronDown}
              size="sm"
              label={t('claudeCode.search.capsule.next')}
              onClick={() => stepHit(1)}
            />
          </>
        )}
        <IconButton
          icon={X}
          size="sm"
          label={t('claudeCode.search.capsule.close')}
          onClick={resetSearch}
        />
      </div>
    </>
  )
}
