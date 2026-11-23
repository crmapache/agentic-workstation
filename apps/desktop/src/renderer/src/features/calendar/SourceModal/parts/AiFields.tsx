import { useTranslation } from 'react-i18next'

import { AI_WEEKS_MAX, CALENDAR_AI_PROVIDERS } from '@shared/calendar'
import type { ProviderId } from '@shared/providers'

import { ChoiceField } from '@agentic-workstation/ui/ChoiceField'
import { TextArea } from '@agentic-workstation/ui/TextArea'

import styles from '../SourceModal.module.scss'
import type { SourceFieldsProps } from '../SourceModal.types'
import { modelChoices, providerChoices } from '../../../../lib/provider-choices'
import { useProviders } from '../../../../state/providers.queries'

/**
 * Чтение ИИ: подсказки человека о своём календаре, на сколько недель вперёд и кто читает.
 * Провайдер, не прошедший проверку чтения календаря, погашен с причиной.
 */
export const AiFields = ({ form, onChange }: SourceFieldsProps) => {
  const { t } = useTranslation()
  const providers = useProviders().data ?? []
  const provider = providers.find((one) => one.id === form.provider) ?? null
  const weeks = Array.from({ length: AI_WEEKS_MAX }, (_, index) => ({
    value: String(index + 1),
    label: t('calendar.form.weeksN', { count: index + 1 }),
  }))
  const choices = providerChoices(providers, t).map((choice) =>
    CALENDAR_AI_PROVIDERS.includes(choice.value as ProviderId)
      ? choice
      : { ...choice, disabled: true, description: t('calendar.form.providerUnverified') },
  )

  return (
    <>
      <TextArea
        label={t('calendar.form.hints')}
        placeholder={t(`calendar.form.hintsPlaceholder.${form.kind}`)}
        value={form.hints}
        onChange={(hints) => onChange({ hints })}
      />
      <div className={styles.row}>
        <div className={styles.grow}>
          <ChoiceField
            label={t('calendar.form.provider')}
            value={form.provider}
            options={choices}
            onPick={(id) => onChange({ provider: id as ProviderId, model: '', effort: '' })}
          />
        </div>
        <div className={styles.grow}>
          <ChoiceField
            label={t('calendar.form.model')}
            value={form.model}
            options={modelChoices(provider, t('calendar.form.defaultModel'))}
            onPick={(model) => onChange({ model, effort: '' })}
          />
        </div>
        <ChoiceField
          label={t('calendar.form.weeks')}
          value={String(form.weeksAhead)}
          options={weeks}
          onPick={(value) => onChange({ weeksAhead: Number(value) })}
        />
      </div>
    </>
  )
}
