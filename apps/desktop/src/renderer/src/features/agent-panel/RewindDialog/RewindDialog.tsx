import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Dialog } from '@agentic-workstation/ui/Dialog'
import { Tabs } from '@agentic-workstation/ui/Tabs'
import { Tooltip } from '@agentic-workstation/ui/Tooltip'

import { usePanelCapabilities } from '../panel.queries'
import { REWIND_CHOICES } from './RewindDialog.constants'
import { useRewindDialog } from './RewindDialog.hooks'
import styles from './RewindDialog.module.scss'
import type { RewindDialogProps } from './RewindDialog.types'
import { refusalWords, filesFailedWords } from './RewindDialog.utils'
import { RewindCode } from './parts/RewindCode'

/**
 * Вопрос перед откатом - /rewind терминала (как в ACC). Говорит до нажатия, что уйдёт
 * (сообщение и всё после), что ещё с ним (идущий ход, очередь) и какие файлы тронет код.
 * По умолчанию - только разговор; код предлагается, только когда его есть что вернуть и
 * провайдер это умеет. «In a new tab» (если провайдер умеет форк) оставляет вкладку как есть
 * и открывает форк без этого сообщения.
 */
export const RewindDialog = ({ target, conversation }: RewindDialogProps) => {
  const { t } = useTranslation()
  const dialog = useRewindDialog(target, conversation)
  const capabilities = usePanelCapabilities()
  const keepsConversation = dialog.choice === 'code'
  const offersCode = capabilities.rewindFiles && dialog.code?.state === 'ready'
  const isDone = dialog.filesFailed !== null
  const choices = REWIND_CHOICES.filter(({ scope }) =>
    capabilities.rewindScopes.includes(scope),
  ).map(({ scope, labelKey }) => ({ id: scope, label: t(labelKey) }))

  const handleSubmit = () => (isDone ? dialog.close() : void dialog.submit())

  const handleFork = () => void dialog.forkInstead()

  const actions = isDone ? (
    <Button type="submit" variant="primary">
      {t('agentPanel.rewind.close')}
    </Button>
  ) : (
    <>
      <Button type="button" onClick={dialog.close}>
        {t('agentPanel.rewind.cancel')}
      </Button>
      {!keepsConversation && capabilities.fork && (
        <Tooltip label={t('agentPanel.rewind.forkHint')}>
          <Button
            type="button"
            disabled={dialog.isWorking || dialog.isForkHeld}
            onClick={handleFork}>
            {t('agentPanel.rewind.fork')}
          </Button>
        </Tooltip>
      )}
      <Button type="submit" variant="primary" disabled={dialog.isWorking || dialog.isBlocked}>
        {dialog.isWorking
          ? t('agentPanel.rewind.working')
          : keepsConversation
            ? t('agentPanel.rewind.goCode')
            : t('agentPanel.rewind.go')}
      </Button>
    </>
  )

  return (
    <Dialog
      open
      title={t('agentPanel.rewind.title')}
      onSubmit={handleSubmit}
      onClose={dialog.close}
      actions={actions}>
      {dialog.subject && <div className={styles.subject}>{dialog.subject}</div>}
      {isDone ? (
        <div role="alert" className={styles.refusal}>
          {filesFailedWords(t, dialog.filesFailed ?? '')}
        </div>
      ) : (
        <>
          <div className={styles.lead}>
            {keepsConversation ? t('agentPanel.rewind.codeLead') : t('agentPanel.rewind.lead')}
          </div>
          {offersCode && (
            <Tabs
              label={t('agentPanel.rewind.what')}
              items={choices}
              value={dialog.choice}
              onChange={dialog.setChoice}
            />
          )}
          {capabilities.rewindFiles && (
            <RewindCode code={dialog.code} showFiles={dialog.choice !== 'conversation'} />
          )}
          {!keepsConversation && dialog.isRunning && (
            <div className={styles.warning}>{t('agentPanel.rewind.running')}</div>
          )}
          {!keepsConversation && dialog.queued > 0 && (
            <div className={styles.warning}>
              {t('agentPanel.rewind.queued', { count: dialog.queued })}
            </div>
          )}
          {dialog.isBlocked && (
            <div className={styles.warning}>{t('agentPanel.rewind.codeWhileRunning')}</div>
          )}
          {dialog.isForkHeld && (
            <div className={styles.warning}>{t('agentPanel.rewind.forkWhileRunning')}</div>
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
