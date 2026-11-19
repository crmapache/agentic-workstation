import { useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Card } from '@agentic-workstation/ui/Card'
import { TextField } from '@agentic-workstation/ui/TextField'

import { useConversationActions } from '../conversation-actions.hooks'
import { usePanelPrefs } from '../panel.queries'
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
  const { setPrefs } = useConversationActions()
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
    <PanelScreen title={t('agentPanel.menu.titles.customModels.title')}>
      <p className={styles.note}>{t('agentPanel.customModels.note')}</p>
      <p className={styles.note}>{t('agentPanel.customModels.warn')}</p>
      <form className={styles.form} onSubmit={(event) => void handleSubmit(event)}>
        <div className={styles.field}>
          <TextField
            label={t('agentPanel.customModels.field')}
            hideLabel
            value={typed}
            placeholder={t('agentPanel.customModels.placeholder')}
            spellCheck={false}
            error={problem ? t(`agentPanel.customModels.${problem}`) : undefined}
            onChange={setTyped}
          />
        </div>
        <Button type="submit" variant="primary" disabled={!canAdd}>
          {t('agentPanel.customModels.add')}
        </Button>
      </form>
      {prefs.customModels.length > 0 && (
        <Card title={t('agentPanel.customModels.added')}>
          <ul className={styles.list}>
            {prefs.customModels.map((model) => (
              <li key={model} className={styles.model}>
                <span className={styles.name}>{model}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={t('agentPanel.customModels.removeNamed', { model })}
                  onClick={() => handleRemove(model)}>
                  {t('agentPanel.customModels.remove')}
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </PanelScreen>
  )
}
