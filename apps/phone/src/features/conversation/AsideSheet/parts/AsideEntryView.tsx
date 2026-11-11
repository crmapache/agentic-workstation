import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Spinner } from '@agentic-workstation/ui/Spinner'

import styles from '../AsideSheet.module.scss'
import type { AsideEntry } from '../../aside.store'
import { useNow } from '../../../../lib/now.hooks'
import { durationText } from '../../../../lib/time.utils'
import { failureText } from '../../../../state/commands.utils'
import { AsideAnswer } from './AsideAnswer'

/** Пока модель думает - сколько уже и «отменить»; дальше - её ответ или почему его нет. */
const Thinking = ({
  askedAt,
  busy,
  onCancel,
}: {
  askedAt: number
  busy: boolean
  onCancel: () => void
}) => {
  const { t } = useTranslation()
  const now = useNow(1000)

  return (
    <div className={styles.thinking}>
      <Spinner size="sm" tone="accent" />
      <span className={styles.thinkingText}>
        {t('aside.thinking', { time: durationText(t, now - askedAt) })}
      </span>
      <Button size="touch" variant="ghost" disabled={busy} onClick={onCancel}>
        {t('common.cancel')}
      </Button>
    </div>
  )
}

/** Один вопрос сбоку: сам вопрос и под ним - думает, ответ или отказ. */
export const AsideEntryView = ({
  entry,
  cancelling,
  onCancel,
}: {
  entry: AsideEntry
  cancelling: boolean
  onCancel: (askId: string) => void
}) => {
  const { t } = useTranslation()

  return (
    <article className={styles.entry}>
      <p className={styles.question}>{entry.question}</p>
      {entry.answer && <AsideAnswer answer={entry.answer} />}
      {entry.error && <p className={styles.error}>{failureText(t, entry.error)}</p>}
      {!entry.answer && !entry.error && (
        <Thinking
          askedAt={entry.askedAt}
          busy={cancelling}
          onCancel={() => onCancel(entry.askId)}
        />
      )}
    </article>
  )
}
