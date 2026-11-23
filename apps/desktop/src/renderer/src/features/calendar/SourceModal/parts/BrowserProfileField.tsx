import { useTranslation } from 'react-i18next'

import { ChoiceField } from '@agentic-workstation/ui/ChoiceField'

import styles from '../SourceModal.module.scss'
import type { SourceFieldsProps } from '../SourceModal.types'
import { useConnectors } from '../../../../state/connectors.queries'

/**
 * Профиль Chrome, где выполнен вход в календарь: подключённые сейчас и те, где стоит расширение
 * (закрытый IDE откроет сама). Модель уйти в другой профиль не сможет.
 */
export const BrowserProfileField = ({ form, onChange }: SourceFieldsProps) => {
  const { t } = useTranslation()
  const { data } = useConnectors()
  const browser = data?.browser
  const names = [
    ...new Set([
      ...(browser?.profiles ?? []).map((profile) => profile.chromeProfile ?? profile.name),
      ...(browser?.chromeProfiles ?? [])
        .filter((profile) => profile.hasExtension)
        .map((profile) => profile.name),
      ...(form.profile ? [form.profile] : []),
    ]),
  ]

  if (names.length === 0) {
    return <span className={styles.note}>{t('calendar.form.noProfiles')}</span>
  }

  return (
    <ChoiceField
      label={t('calendar.form.profile')}
      value={form.profile}
      options={names.map((name) => ({ value: name, label: name }))}
      onPick={(profile) => onChange({ profile })}
    />
  )
}
