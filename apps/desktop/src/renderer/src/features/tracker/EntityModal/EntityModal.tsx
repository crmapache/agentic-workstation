import { useState } from 'react'
import { Columns3, SquareKanban, GalleryHorizontalEnd } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Modal } from '@agentic-workstation/ui/Modal'
import { TextArea } from '@agentic-workstation/ui/TextArea'
import { TextField } from '@agentic-workstation/ui/TextField'

import { useTrackerActions } from '../tracker.actions'
import { useTrackerStore } from '../tracker.store'
import styles from './EntityModal.module.scss'
import type { EntityModalProps } from './EntityModal.types'
import { entityOp } from './EntityModal.utils'

/**
 * Проект, поток или группа: заголовок и подзаголовок (у проекта - описание). Одно окно на три
 * вида - отличаются только подписи и правка.
 */
export const EntityModal = ({ editor, title, subtitle, onCreated }: EntityModalProps) => {
  const { t } = useTranslation()
  const { apply } = useTrackerActions()
  const edit = useTrackerStore((state) => state.edit)
  const [name, setName] = useState(title)
  const [note, setNote] = useState(subtitle)
  const isNew = editor.id === null
  const icon =
    editor.kind === 'project'
      ? SquareKanban
      : editor.kind === 'flow'
        ? GalleryHorizontalEnd
        : Columns3
  const heading = {
    project: isNew ? t('tracker.entity.newProject') : t('tracker.entity.editProject'),
    flow: isNew ? t('tracker.entity.newFlow') : t('tracker.entity.editFlow'),
    group: isNew ? t('tracker.entity.newGroup') : t('tracker.entity.editGroup'),
  }[editor.kind]

  const handleClose = () => edit(null)
  const handleSave = async () => {
    const { ok, created } = await apply(entityOp(editor, name, note))

    if (!ok) return
    if (created && editor.kind === 'project') onCreated(created)

    handleClose()
  }

  return (
    <Modal
      open
      icon={icon}
      title={heading}
      closeLabel={t('common.close')}
      onClose={handleClose}
      footer={
        <div className={styles.footer}>
          <Button variant="ghost" onClick={handleClose}>
            {t('tracker.entity.cancel')}
          </Button>
          <Button variant="primary" disabled={!name.trim()} onClick={() => void handleSave()}>
            {isNew ? t('tracker.entity.create') : t('tracker.entity.save')}
          </Button>
        </div>
      }>
      <form
        className={styles.body}
        onSubmit={(event) => {
          event.preventDefault()
          if (name.trim()) void handleSave()
        }}>
        <TextField
          data-autofocus
          label={t('tracker.entity.title')}
          value={name}
          onChange={setName}
        />
        {editor.kind === 'project' ? (
          <TextArea label={t('tracker.entity.description')} value={note} onChange={setNote} />
        ) : (
          <TextField label={t('tracker.entity.subtitle')} value={note} onChange={setNote} />
        )}
      </form>
    </Modal>
  )
}
