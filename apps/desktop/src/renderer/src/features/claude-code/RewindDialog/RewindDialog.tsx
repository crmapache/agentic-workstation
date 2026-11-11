import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Dialog } from '@agentic-workstation/ui/Dialog'
import { Tabs } from '@agentic-workstation/ui/Tabs'
import { Tooltip } from '@agentic-workstation/ui/Tooltip'

import { REWIND_CHOICES } from './RewindDialog.constants'
import { useRewindDialog } from './RewindDialog.hooks'
import styles from './RewindDialog.module.scss'
import type { RewindDialogProps } from './RewindDialog.types'
import { refusalWords } from './RewindDialog.utils'
import { RewindCode } from './parts/RewindCode'

/**
 * Вопрос перед откатом - /rewind терминала (как в ACC). Говорит до нажатия, что уйдёт
 * (сообщение и всё после), что ещё с ним (идущий ход, очередь) и какие файлы тронет код.
 * По умолчанию - только разговор; код предлагается, только когда его есть что вернуть.
 * «In a new tab» оставляет вкладку как есть и открывает форк без этого сообщения.
 */
export const RewindDialog = ({ target, conversation }: RewindDialogProps) => {
  const { t } = useTranslation()
  const dialog = useRewindDialog(target, conversation)
  const keepsConversation = dialog.choice === 'code'
  const offersCode = dialog.code?.state === 'ready'
  const isDone = dialog.filesFailed !== null
  const choices = REWIND_CHOICES.map(({ scope, labelKey }) => ({ id: scope, label: t(labelKey) }))

  const handleSubmit = () => (isDone ? dialog.close() : void dialog.submit())

  const handleFork = () => void dialog.forkInstead()

  const actions = isDone ? (
    <Button type="submit" variant="primary">
      {t('claudeCode.rewind.close')}
    </Button>
  ) : (
    <>
      <Button type="button" onClick={dialog.close}>
        {t('claudeCode.rewind.cancel')}
      </Button>
      {!keepsConversation && (
        <Tooltip label={t('claudeCode.rewind.forkHint')}>
          <Button
            type="button"
            disabled={dialog.isWorking || dialog.isForkHeld}
            onClick={handleFork}>
            {t('claudeCode.rewind.fork')}
          </Button>
        </Tooltip>
      )}
      <Button type="submit" variant="primary" disabled={dialog.isWorking || dialog.isBlocked}>
        {dialog.isWorking
          ? t('claudeCode.rewind.working')
          : keepsConversation
            ? t('claudeCode.rewind.goCode')
            : t('claudeCode.rewind.go')}
      </Button>
    </>
  )

  return (
    <Dialog
      open
      title={t('claudeCode.rewind.title')}
      onSubmit={handleSubmit}
      onClose={dialog.close}
      actions={actions}>
      {dialog.subject && <div className={styles.subject}>{dialog.subject}</div>}
      {isDone ? (
        <div role="alert" className={styles.refusal}>
          {t('claudeCode.rewind.filesFailed', { detail: dialog.filesFailed })}
        </div>
      ) : (
        <>
          <div className={styles.lead}>
            {keepsConversation ? t('claudeCode.rewind.codeLead') : t('claudeCode.rewind.lead')}
          </div>
          {offersCode && (
            <Tabs
              label={t('claudeCode.rewind.what')}
              items={choices}
              value={dialog.choice}
              onChange={dialog.setChoice}
            />
          )}
          <RewindCode code={dialog.code} showFiles={dialog.choice !== 'conversation'} />
          {!keepsConversation && dialog.isRunning && (
            <div className={styles.warning}>{t('claudeCode.rewind.running')}</div>
          )}
          {!keepsConversation && dialog.queued > 0 && (
            <div className={styles.warning}>
              {t('claudeCode.rewind.queued', { count: dialog.queued })}
            </div>
          )}
          {dialog.isBlocked && (
            <div className={styles.warning}>{t('claudeCode.rewind.codeWhileRunning')}</div>
          )}
          {dialog.isForkHeld && (
            <div className={styles.warning}>{t('claudeCode.rewind.forkWhileRunning')}</div>
          )}
          {dialog.refusal && (
            <div role="alert" className={styles.refusal}>
              {refusalWords(t, dialog.refusal)}
            </div>
          )}
        </>
      )}
    </Dialog>
  )
}
