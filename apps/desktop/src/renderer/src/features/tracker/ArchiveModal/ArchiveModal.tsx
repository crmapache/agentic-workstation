import { useState } from 'react'
import { Trash2, Archive, ArchiveRestore } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { DAY_MS } from '@shared/time-units'
import type { TrackerArchived } from '@shared/tracker'

import { Button } from '@agentic-workstation/ui/Button'
import { Dialog } from '@agentic-workstation/ui/Dialog'
import { EmptyState } from '@agentic-workstation/ui/EmptyState'
import { Modal } from '@agentic-workstation/ui/Modal'

import { useTrackerActions } from '../tracker.actions'
import { useTrackerStore } from '../tracker.store'
import { useNow } from '../../../lib/now.hooks'
import styles from './ArchiveModal.module.scss'
import type { ArchiveModalProps } from './ArchiveModal.types'

/**
 * Архив проектов трекера: убранный проект лежит здесь 30 дней и удаляется сам. Его можно
 * вернуть вкладкой или удалить сразу - после вопроса: это необратимо на всех компьютерах.
 */
export const ArchiveModal = ({ archived }: ArchiveModalProps) => {
  const { t } = useTranslation()
  const { apply } = useTrackerActions()
  const open = useTrackerStore((state) => state.open)
  const now = useNow(false, 0)
  const [purging, setPurging] = useState<TrackerArchived | null>(null)

  const handleClose = () => open(null)
  const handlePurge = async () => {
    if (purging) await apply({ kind: 'project.purge', id: purging.id })

    setPurging(null)
  }

  return (
    <Modal
      open
      icon={Archive}
      title={t('tracker.archive.title')}
      closeLabel={t('common.close')}
      onClose={handleClose}>
      {archived.length === 0 ? (
        <EmptyState icon={Archive} title={t('tracker.archive.empty')} />
      ) : (
        <ul className={styles.list}>
          {archived.map((project) => (
            <li key={project.id} className={styles.row}>
              <span className={styles.text}>
                <span className={styles.title}>{project.title}</span>
                <span className={styles.when}>
                  {t('tracker.archive.purgeIn', {
                    count: Math.max(1, Math.ceil((project.purgeAt - now) / DAY_MS)),
                  })}
                </span>
              </span>
              <Button
                variant="secondary"
                size="sm"
                icon={ArchiveRestore}
                onClick={() => void apply({ kind: 'project.restore', id: project.id })}>
                {t('tracker.archive.restore')}
              </Button>
              <Button variant="ghost" size="sm" icon={Trash2} onClick={() => setPurging(project)}>
                {t('tracker.archive.deleteNow')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Dialog
        open={purging !== null}
        title={t('tracker.archive.confirmTitle', { title: purging?.title ?? '' })}
        onSubmit={() => void handlePurge()}
        onClose={() => setPurging(null)}
        actions={
          <>
            <Button variant="ghost" onClick={() => setPurging(null)}>
              {t('tracker.archive.cancel')}
            </Button>
            <Button variant="danger" type="submit">
              {t('tracker.archive.confirm')}
            </Button>
          </>
        }>
        {t('tracker.archive.confirmText')}
      </Dialog>
    </Modal>
  )
}
