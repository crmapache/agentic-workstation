import { useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Card } from '@agentic-workstation/ui/Card'
import { TextField } from '@agentic-workstation/ui/TextField'

import { useClaudeActions } from '../claude-actions.hooks'
import { usePanelPrefs } from '../claude.queries'
import { PanelScreen } from '../PanelScreen/PanelScreen'
import styles from './CustomModelsScreen.module.scss'
import { modelNameProblem } from './CustomModelsScreen.utils'

/**
 * Свои модели (Settings → Custom models): то, чего нет в каталоге CLI, - через прокси
 * или шлюз. Добавленное встаёт в меню MODEL под полем; выбирают там, а не здесь.
 * Список - на машину. Удалённая модель снимается и с новых вкладок.
 */
export const CustomModelsScreen = () => {
  const { t } = useTranslation()
  const prefs = usePanelPrefs()
  const { setPrefs } = useClaudeActions()
  const [typed, setTyped] = useState('')
  const name = typed.trim()
  const problem = modelNameProblem(name, prefs.customModels)
  const canAdd = Boolean(name) && problem === null

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!canAdd) return
    if (await setPrefs({ customModels: [...prefs.customModels, name] })) setTyped('')
  }

  const handleRemove = (model: string) =>
    void setPrefs({ customModels: prefs.customModels.filter((item) => item !== model) })

  return (
    <PanelScreen title={t('claudeCode.menu.titles.customModels.title')}>
      <p className={styles.note}>{t('claudeCode.customModels.note')}</p>
      <p className={styles.note}>{t('claudeCode.customModels.warn')}</p>
      <form className={styles.form} onSubmit={(event) => void handleSubmit(event)}>
        <div className={styles.field}>
          <TextField
            label={t('claudeCode.customModels.field')}
            hideLabel
            value={typed}
            placeholder={t('claudeCode.customModels.placeholder')}
            spellCheck={false}
            error={problem ? t(`claudeCode.customModels.${problem}`) : undefined}
            onChange={setTyped}
          />
        </div>
        <Button type="submit" variant="primary" disabled={!canAdd}>
          {t('claudeCode.customModels.add')}
        </Button>
      </form>
      {prefs.customModels.length > 0 && (
        <Card title={t('claudeCode.customModels.added')}>
          <ul className={styles.list}>
            {prefs.customModels.map((model) => (
              <li key={model} className={styles.model}>
                <span className={styles.name}>{model}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={t('claudeCode.customModels.removeNamed', { model })}
                  onClick={() => handleRemove(model)}>
                  {t('claudeCode.customModels.remove')}
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </PanelScreen>
  )
}
