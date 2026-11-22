import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Toast } from '@agentic-workstation/ui/Toast'

import { useTrackerActions } from '../tracker.actions'
import { DAY_TICK_MS, NOTICE_CLOSE_MS } from '../tracker.constants'
import { useDueLabel, useFailureText } from '../tracker.hooks'
import { useTrackerStore } from '../tracker.store'
import { useNow } from '../../../lib/now.hooks'
import { objectKey } from '../../../lib/object-key'
import { useLayoutStore } from '../../../state/layout.store'

/**
 * Карточки трекера в углу окна: отказ правки или отправки (по коду), итог отправки в очередь
 * с переходом к очередям и «Undo» только что удалённого или сдвинутой повторяющейся карточки.
 * Итог и «Undo» уходят сами, отказ висит, пока его не закроют.
 */
export const TrackerNotice = () => {
  const { t } = useTranslation()
  const notice = useTrackerStore((state) => state.notice)
  const undo = useTrackerStore((state) => state.undo)
  const dismiss = useTrackerStore((state) => state.dismiss)
  const offerUndo = useTrackerStore((state) => state.offerUndo)
  const showMainView = useLayoutStore((state) => state.showMainView)
  const { apply } = useTrackerActions()
  const failureText = useFailureText()
  // Часы идут, только пока видна подпись нового срока: окно живёт сутками, и «Tomorrow» без
  // обновления на следующий день читалось бы неправдой.
  const now = useNow(undo?.kind === 'repeat', DAY_TICK_MS)
  const repeatDue = useDueLabel(
    undo?.kind === 'repeat' ? undo.due : null,
    new Date(now).setHours(0, 0, 0, 0),
  )

  const handleUndo = async () => {
    offerUndo(null)

    if (undo?.kind === 'repeat') {
      for (const op of undo.ops) await apply(op, undo.projectId)
    } else if (undo) await apply({ kind: 'undelete', ids: undo.ids }, undo.projectId)
  }
  const handleOpenQueues = () => {
    dismiss()
    showMainView('scenarios')
  }

  return (
    <>
      {undo && (
        <Toast
          key={objectKey(undo)}
          title={t(`tracker.undo.${undo.kind}`, { when: repeatDue })}
          close={{
            label: t('common.close'),
            onClose: () => offerUndo(null),
            autoCloseMs: NOTICE_CLOSE_MS,
          }}
          actions={
            <Button variant="secondary" size="sm" onClick={() => void handleUndo()}>
              {t('tracker.undo.action')}
            </Button>
          }
        />
      )}
      {notice?.kind === 'sent' && (
        <Toast
          key={objectKey(notice)}
          title={t('tracker.sent.title', { count: notice.count })}
          close={{ label: t('common.close'), onClose: dismiss, autoCloseMs: NOTICE_CLOSE_MS }}
          actions={
            <Button variant="secondary" size="sm" onClick={handleOpenQueues}>
              {t('tracker.sent.open')}
            </Button>
          }
        />
      )}
      {notice?.kind === 'failed' && (
        <Toast
          tone="danger"
          title={failureText(notice.code)}
          close={{ label: t('common.close'), onClose: dismiss }}
        />
      )}
    </>
  )
}
