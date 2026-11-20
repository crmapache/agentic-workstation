import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconButton } from '@agentic-workstation/ui/IconButton'

import styles from '../SettingsDialog.module.scss'
import type { AiChoiceRowProps } from '../SettingsDialog.types'
import { editChoice, effortChoices } from '../SettingsDialog.utils'
import { modelChoices, providerChoices } from '../../../../lib/provider-choices'
import { PickButton } from './PickButton'

/**
 * Звено цепочки «кто пишет сообщение коммита»: провайдер, модель и усилие тремя выборами в ряд.
 * Основной - первым, запасные под ним со своим «убрать». Провайдер только для чата и не
 * установленный в выборе погашены: работу IDE они не возьмут.
 */
export const AiChoiceRow = ({ index, choice, providers, onChange, onRemove }: AiChoiceRowProps) => {
  const { t } = useTranslation()
  const provider = providers.find((one) => one.id === choice.provider) ?? null
  const label = index === 0 ? t('settings.git.primary') : t('settings.git.fallback', { index })

  const handleProvider = (id: string) => {
    const picked = providers.find((one) => one.id === id)

    if (picked) onChange(editChoice(choice, { provider: picked.id }, picked))
  }

  return (
    <div className={styles.row}>
      <div className={styles.rowText}>
        <span className={styles.rowLabel}>{label}</span>
        <span className={styles.rowDescription}>
          {index === 0 ? t('settings.git.primaryHint') : t('settings.git.fallbackHint')}
        </span>
      </div>
      <div className={styles.choices}>
        <PickButton
          label={t('settings.git.provider')}
          value={choice.provider}
          options={providerChoices(providers, t)}
          onPick={handleProvider}
        />
        <PickButton
          label={t('settings.git.model')}
          value={choice.model}
          options={modelChoices(provider, t('settings.git.defaultModel'))}
          onPick={(model) => onChange(editChoice(choice, { model }, provider))}
        />
        <PickButton
          label={t('settings.git.effort')}
          value={choice.effort}
          options={effortChoices(provider, choice.model, t)}
          onPick={(effort) =>
            onChange(editChoice(choice, { effort: effort as typeof choice.effort }, provider))
          }
        />
        {onRemove && (
          <IconButton
            icon={X}
            size="sm"
            label={t('settings.git.remove', { label })}
            onClick={onRemove}
          />
        )}
      </div>
    </div>
  )
}
