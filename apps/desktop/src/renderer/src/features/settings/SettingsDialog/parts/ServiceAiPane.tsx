import { useTranslation } from 'react-i18next'

import { Card } from '@agentic-workstation/ui/Card'
import { HelpButton } from '@agentic-workstation/ui/HelpButton'
import { Section } from '@agentic-workstation/ui/Section'

import styles from '../SettingsDialog.module.scss'
import { modelChoices, providerChoices } from '../../../../lib/provider-choices'
import { useProviders } from '../../../../state/providers.queries'
import { useServiceAi, useSetServiceAi } from '../../../../state/service-ai.queries'
import { PickRow } from './PickRow'

/**
 * Раздел «AI»: кто делает служебную работу IDE - имена очередей, проверки поручений, черновики
 * заданий и сценариев. Провайдер и модель его списка; пустая модель - своя у каждой работы.
 * Смена провайдера сбрасывает модель: имена моделей у провайдеров свои.
 */
export const ServiceAiPane = () => {
  const { t } = useTranslation()
  const value = useServiceAi()
  const save = useSetServiceAi()
  const providers = useProviders().data ?? []
  const provider = providers.find((one) => one.id === value.provider)

  return (
    <Section
      title={t('settings.sections.ai')}
      description={t('settings.ai.description')}
      help={
        <HelpButton
          label={t('settings.ai.help.label')}
          title={t('settings.sections.ai')}
          text={t('settings.ai.help.text')}
          closeLabel={t('common.close')}
        />
      }>
      <Card>
        <div className={styles.rows}>
          <PickRow
            label={t('settings.ai.provider')}
            description={t('settings.ai.providerHint')}
            value={value.provider}
            options={providerChoices(providers, t)}
            onPick={(id) => {
              const picked = providers.find((one) => one.id === id)

              if (picked && picked.id !== value.provider)
                void save({ provider: picked.id, model: '' })
            }}
          />
          <PickRow
            label={t('settings.ai.model')}
            description={t('settings.ai.modelHint')}
            value={value.model}
            options={modelChoices(provider ?? null, t('settings.ai.defaultModel'))}
            onPick={(model) => void save({ ...value, model })}
          />
        </div>
      </Card>
    </Section>
  )
}
