import type { KeyboardEvent } from 'react'
import { Send } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { isRunFinished } from '@shared/scenario-runs'

import { Button } from '@agentic-workstation/ui/Button'
import { TextArea } from '@agentic-workstation/ui/TextArea'
import { Tooltip } from '@agentic-workstation/ui/Tooltip'

import { useTell } from './ScenarioTellField.hooks'
import styles from './ScenarioTellField.module.scss'
import type { ScenarioTellFieldProps } from './ScenarioTellField.types'

/**
 * Поле главному потоку внизу окна прогона (поле головы в ACC): голова - один разговор на всю
 * ночь, слова ложатся в таймлайн под карточку, где прогон стоит, и ответ - туда же. Отправка -
 * кнопкой или ⌘Enter (Enter - новая строка: пишут абзацами). У законченного прогона поле молчит.
 */
export const ScenarioTellField = ({ place, run }: ScenarioTellFieldProps) => {
  const { t } = useTranslation()
  const isOver = isRunFinished(run.state)
  const { text, setText, canSend, send } = useTell(place, run.id, isOver)

  const handleSend = () => void send()

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey)) return

    event.preventDefault()
    void send()
  }

  return (
    <div className={styles.scenarioTellField}>
      <div className={styles.field}>
        <TextArea
          hideLabel
          label={t('scenarios.run.tell.label')}
          placeholder={isOver ? t('scenarios.run.tell.over') : t('scenarios.run.tell.placeholder')}
          value={text}
          disabled={isOver}
          onChange={setText}
          onKeyDown={handleKeyDown}
        />
      </div>
      <Tooltip label={t('scenarios.run.tell.sendHint')}>
        <Button variant="primary" icon={Send} disabled={!canSend} onClick={handleSend}>
          {t('scenarios.run.tell.send')}
        </Button>
      </Tooltip>
    </div>
  )
}
