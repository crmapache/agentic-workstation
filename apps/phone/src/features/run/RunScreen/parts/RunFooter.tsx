import { useTranslation } from 'react-i18next'

import type { RunWire } from '@agentic-workstation/remote-protocol/wire-types'

import type { useRunScreen } from '../RunScreen.hooks'
import styles from '../RunScreen.module.scss'
import { Composer } from '../../../../shell/Composer/Composer'
import { RunControls } from './RunControls'
import { RunQuestion } from './RunQuestion'

/** Низ идущего прогона: вопрос головы, пауза и стоп, поле «написать голове». */
export const RunFooter = ({
  draftKey,
  run,
  screen,
}: {
  draftKey: string
  run: RunWire
  screen: ReturnType<typeof useRunScreen>
}) => {
  const { t } = useTranslation()
  const { question } = run

  return (
    <div className={styles.footer}>
      {question && (
        <RunQuestion
          key={`${question.stepKey}|${question.askedAt}`}
          question={question}
          busy={screen.busy || run.answering}
          onAnswer={(allow, text) => screen.answer(question, allow, text)}
        />
      )}
      <RunControls run={run} busy={screen.busy} onControl={screen.control} />
      <Composer
        draftKey={draftKey}
        placeholder={t('run.tellPlaceholder')}
        sendLabel={t('run.tell')}
        onSend={screen.handleTell}
      />
    </div>
  )
}
