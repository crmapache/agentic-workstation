import { useMemo } from 'react'
import clsx from 'clsx'
import { Copy, Check, Sparkles, ChevronUp, ArrowRight, ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { IconButton } from '@agentic-workstation/ui/IconButton'

import styles from '../SearchWindow.module.scss'
import type { HitRowProps } from '../SearchWindow.types'
import { useCopy } from '../../clipboard.hooks'
import { useNow } from '../../clock.hooks'
import { AI_CLOCK_MS, SEARCH_ICON_SIZE, SEARCH_ICON_STROKE } from '../../search.constants'
import { describeWhen, snippetPieces } from '../../search.utils'

/**
 * Одна находка: кто сказал, найденные слова закрашены там, где стоят, и путь в разговор.
 * Свёрнутая - строка целиком кнопка, а плашка «Open in chat» поверх текста лишь говорит
 * об этом. Раскрытая перестаёт быть кнопкой: текст читают и выделяют, а действия - двумя
 * настоящими кнопками под ним.
 */
export const HitRow = ({
  hit,
  index,
  selected,
  withTime,
  unfolded,
  onPick,
  onUnfold,
}: HitRowProps) => {
  const { t } = useTranslation()
  const { isCopied, copy } = useCopy()
  const pieces = useMemo(() => snippetPieces(hit.snippet, hit.spans), [hit])
  // Время открытия окна: «сегодня» не пересчитывается на каждом рендере.
  const now = useNow(false, AI_CLOCK_MS)
  const when = hit.at > 0 ? describeWhen(t, hit.at, now) : ''

  const body = (
    <>
      <span className={clsx(styles.speaker, hit.speaker === 'you' && styles.speakerYou)}>
        {t(hit.speaker === 'you' ? 'claudeCode.search.you' : 'claudeCode.search.claude')}
      </span>
      <span className={styles.hitText}>
        {unfolded ? (
          <span className={styles.whole}>{hit.text}</span>
        ) : (
          <span className={styles.snippet}>
            {pieces.map((piece, at) =>
              piece.hit ? <mark key={at}>{piece.text}</mark> : <span key={at}>{piece.text}</span>,
            )}
          </span>
        )}
        {(unfolded || withTime) && (hit.truncated || when) && (
          <span className={styles.hitMeta}>
            {unfolded && hit.truncated
              ? t('claudeCode.search.chars', { shown: hit.text.length, total: hit.length })
              : null}
            {unfolded && hit.truncated && when ? ' · ' : null}
            {when}
          </span>
        )}
        {hit.reason && (
          <span className={styles.reason}>
            <Sparkles size={SEARCH_ICON_SIZE} strokeWidth={SEARCH_ICON_STROKE} aria-hidden />
            {hit.reason}
          </span>
        )}
        {unfolded && (
          <span className={styles.hitActions}>
            <Button variant="secondary" size="sm" icon={ArrowRight} onClick={onPick}>
              {t('claudeCode.search.openInChat')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={isCopied ? Check : Copy}
              onClick={() => copy(hit.text)}>
              {t(isCopied ? 'claudeCode.search.copied' : 'claudeCode.search.copy')}
            </Button>
          </span>
        )}
      </span>
    </>
  )

  return (
    <div
      className={clsx(styles.hit, selected && styles.hitSelected, unfolded && styles.hitOpen)}
      data-search-hit={index}>
      {unfolded ? (
        <div className={styles.hitBody}>{body}</div>
      ) : (
        <button type="button" className={styles.hitBody} onClick={onPick}>
          {body}
          <span className={styles.openPill} aria-hidden>
            {t('claudeCode.search.openInChat')}
            <ArrowRight size={SEARCH_ICON_SIZE} strokeWidth={SEARCH_ICON_STROKE} />
          </span>
        </button>
      )}
      <IconButton
        icon={unfolded ? ChevronUp : ChevronDown}
        size="sm"
        label={t(unfolded ? 'claudeCode.search.less' : 'claudeCode.search.more')}
        tooltipPlacement="start"
        onClick={onUnfold}
      />
    </div>
  )
}
