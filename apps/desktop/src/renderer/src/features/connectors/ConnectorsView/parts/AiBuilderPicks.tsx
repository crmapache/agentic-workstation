import { useTranslation } from 'react-i18next'

import { providerEfforts } from '@shared/providers'

import { ChoiceField } from '@agentic-workstation/ui/ChoiceField'

import type { AiBuilderPicksProps } from '../ConnectorsView.types'
import { modelChoices, providerChoices } from '../../../../lib/provider-choices'
import { useProviders } from '../../../../state/providers.queries'

/**
 * Кто собирает коннектор (ADR 0050): провайдер, модель и усилие - списками выбранного
 * провайдера; пустые модель и усилие - его по умолчанию. Не установленный провайдер погашен:
 * сборка на нём не поднялась бы.
 */
export const AiBuilderPicks = ({ request, onProvider, onChange }: AiBuilderPicksProps) => {
  const { t } = useTranslation()
  const providers = useProviders().data ?? []
  const provider = providers.find((one) => one.id === request.provider) ?? null

  return (
    <>
      <ChoiceField
        label={t('connectors.ai.provider')}
        value={request.provider}
        options={providerChoices(providers, t)}
        onPick={onProvider}
      />
      <ChoiceField
        label={t('connectors.ai.model')}
        value={request.model}
        options={modelChoices(provider, t('connectors.ai.defaultModel'))}
        onPick={(model) =>
          onChange({
            model,
            ...(!providerEfforts(provider, model).some((level) => level === request.effort) && {
              effort: '',
            }),
          })
        }
      />
      <ChoiceField
        label={t('connectors.ai.effort')}
        value={request.effort}
        options={[
          { value: '', label: t('connectors.ai.defaultEffort') },
          ...providerEfforts(provider, request.model).map((level) => ({
            value: level,
            label: t(`tasks.form.efforts.${level}`),
          })),
        ]}
        onPick={(effort) => onChange({ effort })}
      />
    </>
  )
}
