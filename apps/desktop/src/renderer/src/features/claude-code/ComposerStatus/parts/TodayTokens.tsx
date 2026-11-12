import { useTranslation } from 'react-i18next'

import { TODAY_TOKENS_METER } from '@shared/claude-prefs'
import { useQuery } from '@tanstack/react-query'

import { Tooltip } from '@agentic-workstation/ui/Tooltip'

import { TODAY_TOKENS_REFRESH_MS } from '../ComposerStatus.constants'
import styles from '../ComposerStatus.module.scss'
import { usePanelPrefs } from '../../claude.queries'
import { formatTokens } from '../../claude.utils'
import { invoke } from '../../../../lib/ipc'
import { QUERY_KEYS } from '../../../../state/query-keys'

/**
 * Сколько токенов ушло сегодня по всем проектам машины - счётчик справа от колец, как в
 * ACC. Считает главный процесс по транскриптам CLI; освежается раз в минуту, пока виден.
 * Спрятан в Settings → Under the field - не рисуется и не спрашивает.
 */
export const TodayTokens = () => {
  const { t } = useTranslation()
  const { hiddenMeters } = usePanelPrefs()
  const isShown = !hiddenMeters.includes(TODAY_TOKENS_METER)
  const { data: tokens } = useQuery({
    queryKey: QUERY_KEYS.claudeTodayTokens,
    queryFn: () => invoke('claude:getTodayTokens'),
    refetchInterval: TODAY_TOKENS_REFRESH_MS,
    enabled: isShown,
  })

  if (!isShown || tokens === undefined) return null

  const hint = t('claudeCode.usage.todayTokens')

  return (
    <Tooltip label={hint} placement="top">
      <span className={styles.tokens} tabIndex={0} aria-label={`${hint}: ${formatTokens(tokens)}`}>
        {formatTokens(tokens)}
      </span>
    </Tooltip>
  )
}
