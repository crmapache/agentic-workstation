import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { ScenarioInput } from '@shared/scenarios'

import { Button } from '@agentic-workstation/ui/Button'

import styles from '../EditorModal.module.scss'
import type { InputsPaneProps } from '../EditorModal.types'
import { blankInput } from '../../scenarios-blank.utils'
import { InputRow } from './InputRow'

/** Что сценарий спрашивает перед запуском: ответы встают в промпты на место `{{имя}}`. */
export const InputsPane = ({ inputs, onInputs }: InputsPaneProps) => {
  const { t } = useTranslation()

  const handleInput = (inputId: string, patch: Partial<ScenarioInput>) =>
    onInputs((list) => list.map((input) => (input.id === inputId ? { ...input, ...patch } : input)))

  const handleRemove = (inputId: string) =>
    onInputs((list) => list.filter((input) => input.id !== inputId))

  const handleAdd = () => onInputs((list) => [...list, blankInput()])

  return (
    <>
      <div className={styles.paneHead}>
        <div className={styles.paneLabel}>
          <span className={styles.paneLabelText}>{t('scenarios.editor.inputs.title')}</span>
          <span className={styles.paneRule} />
        </div>
        <Button size="sm" variant="secondary" icon={Plus} onClick={handleAdd}>
          {t('scenarios.editor.inputs.add')}
        </Button>
      </div>
      {inputs.length === 0 ? (
        <p className={styles.empty}>{t('scenarios.editor.inputs.none')}</p>
      ) : (
        inputs.map((input) => (
          <InputRow
            key={input.id}
            input={input}
            onInput={(patch) => handleInput(input.id, patch)}
            onRemove={() => handleRemove(input.id)}
          />
        ))
      )}
    </>
  )
}
