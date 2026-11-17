import type { FormEvent } from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { isRunLive } from '@shared/tasks'

import { Button } from '@agentic-workstation/ui/Button'
import { TextField } from '@agentic-workstation/ui/TextField'

import styles from '../TaskRunModal.module.scss'
import type { RunPartProps } from '../TaskRunModal.types'
import { useTaskActions } from '../../tasks.actions'

/**
 * Подвал прогона: свои слова прогону (идущему - следующим сообщением, спящему поручению -
 * пробуждением, законченному - продолжением разговора), разбудить и остановить спящее, остановка
 * идущего, разговор вкладкой панели и запуск заново.
 */
export const RunFooter = ({ run }: RunPartProps) => {
  const { t } = useTranslation()
  const actions = useTaskActions()
  const [text, setText] = useState('')
  const live = isRunLive(run.state)
  const sleeping = run.state === 'sleeping'

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!text.trim()) return

    void actions.tell(run.id, text.trim())
    setText('')
  }

  return (
    <form className={styles.footer} onSubmit={handleSubmit}>
      {run.sessionId && (
        <div className={styles.tell}>
          <TextField
            hideLabel
            label={t('tasks.run.tell')}
            placeholder={t('tasks.run.tellPlaceholder')}
            value={text}
            onChange={setText}
          />
        </div>
      )}
      {run.sessionId && (
        <Button type="submit" variant="secondary" disabled={!text.trim()}>
          {t('tasks.run.send')}
        </Button>
      )}
      {sleeping && (
        <Button type="button" variant="ghost" onClick={() => void actions.wake(run.id)}>
          {t('tasks.actions.wake')}
        </Button>
      )}
      {live || sleeping ? (
        <Button type="button" variant="danger" onClick={() => void actions.stop(run.id)}>
          {t('tasks.actions.stop')}
        </Button>
      ) : (
        <>
          {run.sessionId && (
            <Button type="button" variant="ghost" onClick={() => void actions.openChat(run.id)}>
              {t('tasks.actions.openChat')}
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={() => void actions.runNow(run.taskId)}>
            {t('tasks.actions.runAgain')}
          </Button>
        </>
      )}
    </form>
  )
}
