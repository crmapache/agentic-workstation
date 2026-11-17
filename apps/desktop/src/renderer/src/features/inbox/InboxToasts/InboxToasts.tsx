import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Toast } from '@agentic-workstation/ui/Toast'

import { useInboxStore } from '../inbox.store'
import { useInboxUiStore } from '../../../state/inbox-ui.store'
import { useInbox } from '../../../state/inbox.queries'
import { InboxToast } from './parts/InboxToast'

/**
 * Уведомления IDE в углу окна (ADR 0069): только что пришедшие, пока человек не на виде
 * уведомлений, и отказ последнего нажатия. Закрытое уведомление уходит из угла само.
 */
export const InboxToasts = () => {
  const { t } = useTranslation()
  const { data } = useInbox()
  const toasts = useInboxUiStore((state) => state.toasts)
  const notice = useInboxStore((state) => state.notice)
  const dismissNotice = useInboxStore((state) => state.dismissNotice)
  const items = toasts.flatMap(
    (id) => data?.items.filter((item) => item.id === id && item.doneAt === 0) ?? [],
  )

  return (
    <>
      {items.map((item) => (
        <InboxToast key={item.id} item={item} />
      ))}
      {notice && (
        <Toast
          tone="danger"
          title={t(`inbox.codes.${notice.code}`, { defaultValue: t('tasks.codes.unknown') })}
          actions={
            <Button variant="ghost" size="sm" onClick={dismissNotice}>
              {t('common.close')}
            </Button>
          }
        />
      )}
    </>
  )
}
