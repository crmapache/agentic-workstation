import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { AiChoice } from '@shared/ide-prefs'
import { COMMIT_AI_MAX } from '@shared/ide-prefs'

import { Button } from '@agentic-workstation/ui/Button'
import { Card } from '@agentic-workstation/ui/Card'
import { HelpButton } from '@agentic-workstation/ui/HelpButton'
import { Section } from '@agentic-workstation/ui/Section'

import styles from '../SettingsDialog.module.scss'
import { nextFallback } from '../SettingsDialog.utils'
import { useIdePrefs, useSetIdePrefs } from '../../../../state/ide-prefs.queries'
import { useProviders } from '../../../../state/providers.queries'
import { AiChoiceRow } from './AiChoiceRow'

/**
 * Раздел «Git»: кто пишет сообщение коммита у кнопки Commit and push в шапке - провайдер, модель
 * и усилие, а под ним запасные по порядку: не ответил один (лимит, нет CLI, ошибка) -
 * спрашивается следующий. Всё меняется сразу, со следующего нажатия.
 */
export const GitPane = () => {
  const { t } = useTranslation()
  const { commitAi } = useIdePrefs()
  const save = useSetIdePrefs()
  const providers = useProviders().data ?? []

  const saveChain = (chain: AiChoice[]) => void save({ commitAi: chain })

  const handleChange = (index: number, choice: AiChoice) =>
    saveChain(commitAi.map((one, at) => (at === index ? choice : one)))

  const handleRemove = (index: number) => saveChain(commitAi.filter((_, at) => at !== index))

  const handleAdd = () => saveChain([...commitAi, nextFallback(commitAi, providers)])

  return (
    <Section
      title={t('settings.sections.git')}
      description={t('settings.git.description')}
      help={
        <HelpButton
          label={t('settings.git.helpLabel')}
          title={t('settings.git.commitTitle')}
          text={t('settings.git.help')}
          closeLabel={t('common.close')}
        />
      }>
      <Card title={t('settings.git.commitTitle')}>
        <div className={styles.rows}>
          {commitAi.map((choice, index) => (
            <AiChoiceRow
              key={index}
              index={index}
              choice={choice}
              providers={providers}
              onChange={(next) => handleChange(index, next)}
              onRemove={index === 0 ? undefined : () => handleRemove(index)}
            />
          ))}
        </div>
        <div className={styles.addFallback}>
          <Button
            variant="ghost"
            size="sm"
            icon={Plus}
            disabled={commitAi.length >= COMMIT_AI_MAX}
            onClick={handleAdd}>
            {t('settings.git.addFallback')}
          </Button>
        </div>
      </Card>
    </Section>
  )
}
