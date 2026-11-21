import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Toast } from '@agentic-workstation/ui/Toast'

import { useTrackerActions } from '../tracker.actions'
import { useTrackerStore } from '../tracker.store'
import { useLayoutStore } from '../../../state/layout.store'

/**
 * Карточки трекера в углу окна: отказ правки или отправки (по коду), итог отправки в очередь
 * с переходом к очередям и «Undo» только что удалённого.
 */
export const TrackerNotice = () => {
  const { t } = useTranslation()
  const notice = useTrackerStore((state) => state.notice)
  const undo = useTrackerStore((state) => state.undo)
  const dismiss = useTrackerStore((state) => state.dismiss)
  const offerUndo = useTrackerStore((state) => state.offerUndo)
  const showMainView = useLayoutStore((state) => state.showMainView)
  const { apply } = useTrackerActions()

  const handleUndo = () => {
    if (undo) void apply({ kind: 'undelete', ids: undo.ids })

    offerUndo(null)
  }
  const handleOpenQueues = () => {
    dismiss()
    showMainView('scenarios')
  }

  return (
    <>
      {undo && (
        <Toast
          title={t(`tracker.undo.${undo.kind}`)}
          actions={
            <>
              <Button variant="secondary" size="sm" onClick={handleUndo}>
                {t('tracker.undo.action')}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => offerUndo(null)}>
                {t('tracker.undo.close')}
              </Button>
            </>
          }
        />
      )}
      {notice?.kind === 'sent' && (
        <Toast
          title={t('tracker.sent.title', { count: notice.count })}
          actions={
            <>
              <Button variant="secondary" size="sm" onClick={handleOpenQueues}>
                {t('tracker.sent.open')}
              </Button>
              <Button variant="ghost" size="sm" onClick={dismiss}>
                {t('tracker.sent.close')}
              </Button>
            </>
          }
        />
      )}
      {notice?.kind === 'failed' && (
        <Toast
          tone="danger"
          title={t(`tracker.codes.${notice.code}`, {
            defaultValue: t(`scenarios.codes.${notice.code}`, {
              defaultValue: t('tracker.codes.unknown'),
            }),
          })}
          actions={
            <Button variant="ghost" size="sm" onClick={dismiss}>
              {t('common.close')}
            </Button>
          }
        />
      )}
    </>
  )
}
