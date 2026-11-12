import { useTranslation } from 'react-i18next'

import type { SearchHitWire } from '@agentic-workstation/remote-protocol/conversation-wire-types'

import type { useSearchScreen } from '../SearchScreen.hooks'
import styles from '../SearchScreen.module.scss'
import { summaryOf } from '../SearchScreen.utils'
import { useNow } from '../../../../lib/now.hooks'
import { failureText } from '../../../../state/commands.utils'
import { ListGroup } from '../../../../shell/ListGroup/ListGroup'
import { HitRow } from './HitRow'

/** Найденное последним поиском: итог строкой и находки - нажатие открывает разговор. */
export const SearchResults = ({
  screen,
  offset,
}: {
  screen: ReturnType<typeof useSearchScreen>
  offset: number
}) => {
  const { t } = useTranslation()
  const now = useNow(60_000)
  const { result, error } = screen

  if (error) return <p className={styles.error}>{failureText(t, error)}</p>
  if (!result) return <p className={styles.note}>{t('search.empty')}</p>

  const hits: SearchHitWire[] =
    result.kind === 'words'
      ? result.data.hits
      : result.data.status === 'found'
        ? result.data.hits
        : []

  return (
    <div className={styles.results}>
      <p className={styles.note}>{summaryOf(t, result)}</p>
      {hits.length > 0 && (
        <ListGroup label={t('search.title')}>
          {hits.map((hit) => (
            <HitRow
              key={`${hit.sessionId}|${hit.anchor}`}
              hit={hit}
              now={now}
              offset={offset}
              onOpen={(picked) => void screen.handleOpen(picked)}
            />
          ))}
        </ListGroup>
      )}
    </div>
  )
}
