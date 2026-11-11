import { memo } from 'react'
import { Square } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@agentic-workstation/ui/Badge'
import { IconButton } from '@agentic-workstation/ui/IconButton'

import { useClaudeActions } from '../claude-actions.hooks'
import { useFeedScope } from '../feed-scope.context'
import styles from './ShellCard.module.scss'
import type { ShellCardProps } from './ShellCard.types'
import { shellOutcome } from './ShellCard.utils'

/**
 * Команда «!», как BashCard ACC: её запустил человек, выполнила панель, а не агент.
 * Шапка - чип «!», команда и чем кончилось (богаче ACC: метка исхода и кнопка стоп), ниже
 * вывод терминалом, ошибки - красным, или «no output». Модель увидит команду и вывод
 * вместе со следующим сообщением.
 */
export const ShellCard = memo(({ item }: ShellCardProps) => {
  const { t } = useTranslation()
  const { conversationId } = useFeedScope()
  const { stopShell } = useClaudeActions()
  const outcome = shellOutcome(item)
  const hasOutput = Boolean(item.stdout || item.stderr)

  const handleStop = () => void stopShell(conversationId, item.id)

  return (
    <div className={styles.shellCard}>
      <div className={styles.header}>
        <Badge tone="warning" variant="soft">
          {t('claudeCode.shell.chip')}
        </Badge>
        <code className={styles.command}>{item.command}</code>
        {outcome ? (
          <Badge tone={outcome.tone}>{t(outcome.key, { code: outcome.code })}</Badge>
        ) : (
          <span className={styles.running}>{t('claudeCode.shell.running')}</span>
        )}
        {item.status === 'running' && (
          <IconButton
            icon={Square}
            size="sm"
            label={t('claudeCode.shell.stop')}
            onClick={handleStop}
          />
        )}
      </div>
      {hasOutput && (
        <pre className={styles.output}>
          {item.stdout}
          {item.stderr && <span className={styles.stderr}>{item.stderr}</span>}
        </pre>
      )}
      {!hasOutput && item.status !== 'running' && (
        <div className={styles.note}>{t('claudeCode.shell.noOutput')}</div>
      )}
      {item.truncated && <div className={styles.note}>{t('claudeCode.shell.truncated')}</div>}
    </div>
  )
})

ShellCard.displayName = 'ShellCard'
