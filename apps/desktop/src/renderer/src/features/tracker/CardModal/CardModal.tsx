import { Lock, Send, Trash2, SquareKanban } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { isInQueue, isLockedWith } from '@shared/tracker'

import { Button } from '@agentic-workstation/ui/Button'
import { HelpButton } from '@agentic-workstation/ui/HelpButton'
import { Modal } from '@agentic-workstation/ui/Modal'
import { Switch } from '@agentic-workstation/ui/Switch'
import { TextArea } from '@agentic-workstation/ui/TextArea'
import { TextField } from '@agentic-workstation/ui/TextField'

import { useTrackerActions } from '../tracker.actions'
import { useShelfScenarios } from '../tracker.hooks'
import { useTrackerStore } from '../tracker.store'
import { useNow } from '../../../lib/now.hooks'
import { PLACEHOLDER_WORDS } from './CardModal.constants'
import { useCardForm } from './CardModal.hooks'
import styles from './CardModal.module.scss'
import type { CardModalProps } from './CardModal.types'
import { AutoRunField } from './parts/AutoRunField'
import { DueFields } from './parts/DueFields'
import { PriorityField } from './parts/PriorityField'
import { RepeatField } from './parts/RepeatField'
import { ScenarioFields } from './parts/ScenarioFields'

/**
 * Карточка целиком: заголовок, подзаголовок, описание, срок с повтором, приоритет, отметка
 * «сделано», сценарий с его полями и запуск в срок. Новая карточка создаётся этим же окном -
 * задачей группы или продолжением. Карточка со сценарием в работе правит только описание и
 * «сделано» (ADR 0110): остальные поля выключены группами.
 */
export const CardModal = (props: CardModalProps) => {
  const { t } = useTranslation()
  const form = useCardForm(props)
  const scenarios = useShelfScenarios()
  const { apply } = useTrackerActions()
  const edit = useTrackerStore((state) => state.edit)
  const openSend = useTrackerStore((state) => state.openSend)
  const now = useNow(false, 0)
  const today = new Date(now).setHours(0, 0, 0, 0)
  const isNew = props.mode === 'new'
  // Карточка уже в очереди: второй раз её не шлют, главный процесс отказал бы.
  const isQueued = props.mode === 'edit' && isInQueue(props.card.run)
  const lock = props.mode === 'edit' ? props.card.lock : null
  // Выполненную сценарием открывает снятая «сделано» - сразу, тем же Save, как у главного процесса.
  const isLocked = isLockedWith(lock, form.done)
  const handleClose = () => edit(null)
  const save = async (): Promise<string | null> => {
    if (props.mode === 'edit') {
      const fields = form.changed()

      if (Object.keys(fields).length === 0) return props.card.id

      const { ok } = await apply({ kind: 'card.update', id: props.card.id, fields })

      return ok ? props.card.id : null
    }

    const { created } = await apply({
      kind: 'card.create',
      groupId: props.groupId,
      followUpOf: props.followUpOf,
      fields: form.all(),
    })

    return created
  }
  const handleSave = async () => {
    if (await save()) handleClose()
  }
  const handleSend = async () => {
    const cardId = await save()

    if (cardId) openSend({ kind: 'card', cardId })
  }
  const handleDelete = async () => {
    if (props.mode === 'edit' && (await apply({ kind: 'card.delete', id: props.card.id })).ok)
      handleClose()
  }

  return (
    <Modal
      open
      size="lg"
      icon={SquareKanban}
      title={
        isNew
          ? props.followUpOf
            ? t('tracker.cardModal.newFollowUp')
            : t('tracker.cardModal.newTask')
          : t('tracker.cardModal.edit')
      }
      closeLabel={t('common.close')}
      onClose={handleClose}
      headerActions={
        <HelpButton
          label={t('tracker.cardModal.inputsHelpLabel')}
          title={t('tracker.cardModal.inputsHelpLabel')}
          text={t('tracker.cardModal.inputsHelp', PLACEHOLDER_WORDS)}
          closeLabel={t('common.close')}
        />
      }
      footer={
        <div className={styles.footer}>
          {!isNew && (
            <Button variant="danger" icon={Trash2} onClick={() => void handleDelete()}>
              {t('tracker.cardModal.delete')}
            </Button>
          )}
          <span className={styles.spacer} />
          {form.scenario && (
            <Button
              variant="secondary"
              icon={Send}
              disabled={!form.title.trim() || isQueued || isLocked}
              onClick={() => void handleSend()}>
              {t('tracker.cardModal.send')}
            </Button>
          )}
          <Button variant="ghost" onClick={handleClose}>
            {t('tracker.cardModal.cancel')}
          </Button>
          <Button variant="primary" disabled={!form.title.trim()} onClick={() => void handleSave()}>
            {isNew ? t('tracker.cardModal.create') : t('tracker.cardModal.save')}
          </Button>
        </div>
      }>
      <div className={styles.body}>
        {isLocked && lock && (
          <p className={styles.lock}>
            <Lock className={styles.lockIcon} aria-hidden />
            {t(`tracker.cardModal.locked.${lock}`)}
          </p>
        )}
        <fieldset disabled={isLocked} className={styles.group}>
          <TextField
            data-autofocus={!isLocked || undefined}
            label={t('tracker.cardModal.title')}
            value={form.title}
            onChange={(value) => form.set('title', value)}
          />
          <TextField
            label={t('tracker.cardModal.subtitle')}
            value={form.subtitle}
            onChange={(value) => form.set('subtitle', value)}
          />
        </fieldset>
        <TextArea
          resizable
          label={t('tracker.cardModal.description')}
          value={form.description}
          onChange={(value) => form.set('description', value)}
        />
        <fieldset disabled={isLocked} className={styles.group}>
          <DueFields form={form} today={today} />
          <RepeatField form={form} today={today} now={now} />
        </fieldset>
        <div className={styles.row}>
          <fieldset disabled={isLocked} className={styles.group}>
            <PriorityField form={form} />
          </fieldset>
          <Switch
            label={form.repeat ? t('tracker.cardModal.doneRepeat') : t('tracker.cardModal.done')}
            checked={form.done}
            onChange={(done) => form.set('done', done)}
          />
        </div>
        <fieldset disabled={isLocked} className={styles.group}>
          <ScenarioFields form={form} scenarios={scenarios} />
          {form.scenario && (
            <AutoRunField form={form} card={props.mode === 'edit' ? props.card : null} now={now} />
          )}
        </fieldset>
      </div>
    </Modal>
  )
}
