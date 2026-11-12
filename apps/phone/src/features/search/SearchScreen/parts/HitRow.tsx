import { useMemo } from 'react'
import { Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { SearchHitWire } from '@agentic-workstation/remote-protocol/conversation-wire-types'

import styles from '../SearchScreen.module.scss'
import { snippetPieces } from '../SearchScreen.utils'
import { momentText } from '../../../../lib/time.utils'
import { ListRow } from '../../../../shell/ListRow/ListRow'
import { PathText } from '../../../../shell/PathText/PathText'

/**
 * Находка строкой: разговор, кто сказал, когда и сколько в разговоре сообщений; под этим - кусок
 * сообщения с закрашенными словами и, у находки модели, почему она указала сюда. Нажатие
 * открывает разговор.
 */
export const HitRow = ({
  hit,
  now,
  offset,
  onOpen,
}: {
  hit: SearchHitWire
  now: number
  /** Насколько часы IDE впереди часов телефона. */
  offset: number
  onOpen: (hit: SearchHitWire) => void
}) => {
  const { t } = useTranslation()
  const pieces = useMemo(() => snippetPieces(hit.snippet, hit.spans), [hit])
  const facts = [
    t(`search.speaker.${hit.speaker}`, { defaultValue: hit.speaker }),
    hit.at > 0 && momentText(hit.at - offset, now),
    hit.messages > 0 && t('search.messages', { count: hit.messages }),
  ]

  return (
    <ListRow
      title={hit.title ? <PathText text={hit.title} /> : t('search.untitled')}
      description={facts.filter(Boolean).join(' · ')}
      detail={
        <>
          <span className={styles.snippet}>
            {pieces.map((piece, at) =>
              piece.hit ? (
                <mark key={at}>
                  <PathText text={piece.text} />
                </mark>
              ) : (
                <PathText key={at} text={piece.text} />
              ),
            )}
          </span>
          {hit.reason && (
            <span className={styles.reason}>
              <Sparkles className={styles.reasonIcon} aria-hidden />
              {hit.reason}
            </span>
          )}
        </>
      }
      onClick={() => onOpen(hit)}
    />
  )
}
