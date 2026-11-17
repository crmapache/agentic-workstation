import { Bell, AlarmClock } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { EmptyState } from '@agentic-workstation/ui/EmptyState'
import { HelpButton } from '@agentic-workstation/ui/HelpButton'
import { PageHeader } from '@agentic-workstation/ui/PageHeader'
import { Tabs } from '@agentic-workstation/ui/Tabs'

import { useInboxActions } from '../inbox.actions'
import { INBOX_TABS } from '../inbox.constants'
import { useInboxStore } from '../inbox.store'
import { readOf, itemsOf, tabCounts } from '../inbox.utils'
import { InboxCard } from '../InboxCard/InboxCard'
import { ReminderModal } from '../ReminderModal/ReminderModal'
import { useInbox } from '../../../state/inbox.queries'
import { useMarkRead, useRevealed } from './InboxView.hooks'
import styles from './InboxView.module.scss'

/**
 * Уведомления IDE (ADR 0069) - вид середины окна: всё, что ждёт человека, карточками с кнопками
 * ответа. Вкладки - входящие, запланированные напоминания и закрытые; «Remind me» - напоминание
 * себе без ИИ.
 */
export const InboxView = () => {
  const { t } = useTranslation()
  const { data } = useInbox()
  const tab = useInboxStore((state) => state.tab)
  const setTab = useInboxStore((state) => state.setTab)
  const reminding = useInboxStore((state) => state.reminding)
  const setReminding = useInboxStore((state) => state.setReminding)
  const actions = useInboxActions()
  const items = itemsOf(data, tab)
  const revealed = useRevealed(items)

  useMarkRead(tab === 'open' ? items : [])

  const counts = tabCounts(data)
  const readIds = readOf(items)
  const tabs = INBOX_TABS.map((id) => ({ id, label: t(`inbox.tabs.${id}`), count: counts[id] }))

  return (
    <div className={styles.view}>
      <PageHeader
        icon={Bell}
        title={t('inbox.title')}
        help={
          <HelpButton
            label={t('inbox.help.label')}
            title={t('inbox.help.title')}
            text={t('inbox.help.text')}
            closeLabel={t('common.close')}
          />
        }
        actions={
          <Button variant="ghost" icon={AlarmClock} onClick={() => setReminding(true)}>
            {t('inbox.actions.remind')}
          </Button>
        }
        toolbar={<Tabs label={t('inbox.tabs.label')} items={tabs} value={tab} onChange={setTab} />}
      />
      <div className={styles.scroller}>
        <div className={styles.page}>
          {tab === 'done' && items.length > 0 && (
            <div className={styles.listHead}>
              <Button size="sm" variant="ghost" onClick={() => void actions.clearDone()}>
                {t('inbox.actions.clearDone')}
              </Button>
            </div>
          )}
          {tab === 'open' && readIds.length > 0 && (
            <div className={styles.listHead}>
              <Button size="sm" variant="ghost" onClick={() => void actions.dismiss(readIds)}>
                {t('inbox.actions.dismissRead')}
              </Button>
            </div>
          )}
          {items.length === 0 ? (
            <EmptyState icon={Bell} title={t(`inbox.empty.${tab}`)} />
          ) : (
            items.map((item) => (
              <InboxCard key={item.id} item={item} highlighted={item.id === revealed} />
            ))
          )}
        </div>
      </div>
      {reminding && <ReminderModal onClose={() => setReminding(false)} />}
    </div>
  )
}
