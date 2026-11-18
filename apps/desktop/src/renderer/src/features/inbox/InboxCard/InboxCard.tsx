import { useState } from 'react'
import clsx from 'clsx'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { isInboxAsking } from '@shared/inbox'

import { Card } from '@agentic-workstation/ui/Card'
import { IconButton } from '@agentic-workstation/ui/IconButton'
import { TextField } from '@agentic-workstation/ui/TextField'

import { useInboxActions } from '../inbox.actions'
import { KIND_ICONS, CLOCK_TICK_MS } from '../inbox.constants'
import { useInboxStore } from '../inbox.store'
import { momentLabel } from '../../../lib/dates.utils'
import { useNow } from '../../../lib/now.hooks'
import styles from './InboxCard.module.scss'
import type { InboxCardProps } from './InboxCard.types'
import { buttonsOf, outcomeOf, subjectOf, expandedByDefault } from './InboxCard.utils'
import { ItemBody } from './parts/ItemBody'
import { ItemButtons } from './parts/ItemButtons'
import { QuestionAnswer } from './parts/QuestionAnswer'

/**
 * Уведомление карточкой: вид (вопрос, отчёт, напоминание) с иконкой, от кого и когда, суть и
 * кнопки ответа. Ждущее ответа - тоном внимания. Закрытое говорит, чем закрыто, без кнопок.
 * На виде уведомлений свёрнута до шапки, кроме ждущей ответа (collapsible). Та же карточка стоит в окне прогона задания
 * (через InboxCardContext).
 */
export const InboxCard = ({ item, highlighted = false, collapsible = false }: InboxCardProps) => {
  const { t } = useTranslation()
  const actions = useInboxActions()
  const chosen = useInboxStore((state) => state.expanded[item.id])
  const setExpanded = useInboxStore((state) => state.setExpanded)
  const [feedback, setFeedback] = useState('')
  // «Today 09:00» стареет: полночь делает его «Yesterday».
  const now = useNow(true, CLOCK_TICK_MS)
  const isOpen = item.doneAt === 0
  const isExpanded = chosen ?? expandedByDefault(item)
  const shownAt = item.arrivedAt || item.deliverAt
  const when = momentLabel(shownAt, now, {
    today: t('inbox.nearDays.today'),
    tomorrow: t('inbox.nearDays.tomorrow'),
    yesterday: t('inbox.nearDays.yesterday'),
  })
  // Свёрнутая говорит и о чём она: тема сообщения ИИ иначе стоит только в теле.
  const isFolded = collapsible && !isExpanded
  const meta = [
    isFolded && subjectOf(item),
    item.source,
    item.arrivedAt ? when : t('inbox.meta.due', { when }),
  ]
    .filter(Boolean)
    .join(' · ')
  const outcome = outcomeOf(item)
  const outcomeText =
    outcome.kind === 'word'
      ? t(`inbox.outcomes.${outcome.key}`, { defaultValue: outcome.key })
      : outcome.kind === 'action'
        ? t(`inbox.actions.${outcome.key}`, { defaultValue: outcome.key })
        : outcome.text

  return (
    <div className={clsx(styles.item, highlighted && styles.highlighted)} data-inbox-item={item.id}>
      <Card
        tone={isOpen && (isInboxAsking(item) || item.tone === 'attention') ? 'accent' : 'neutral'}
        icon={KIND_ICONS[item.kind]}
        title={t(`inbox.kinds.${item.kind}`)}
        description={meta}
        collapse={
          collapsible
            ? {
                expanded: isExpanded,
                label: isExpanded ? t('inbox.actions.collapse') : t('inbox.actions.expand'),
                onToggle: () => setExpanded(item.id, !isExpanded),
              }
            : undefined
        }
        actions={
          isOpen && (
            <IconButton
              icon={X}
              size="sm"
              label={t('inbox.actions.dismiss')}
              onClick={() => void actions.dismiss([item.id])}
            />
          )
        }>
        <div className={styles.body}>
          <ItemBody item={item} />
          {isOpen && item.kind === 'question' && <QuestionAnswer item={item} />}
          {isOpen && item.kind === 'plan' && (
            <TextField
              label={t('inbox.plan.feedback')}
              placeholder={t('inbox.plan.feedbackPlaceholder')}
              value={feedback}
              onChange={setFeedback}
            />
          )}
          {isOpen && <ItemButtons item={item} text={feedback} actions={buttonsOf(item)} />}
          {!isOpen && (
            <div className={styles.outcome}>
              {t('inbox.meta.outcome', { outcome: outcomeText })}
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
