import { useTranslation } from 'react-i18next'

import { CALENDAR_SOURCE_KINDS } from '@shared/calendar'
import type { CalendarSourceKind } from '@shared/calendar'

import { ChoiceField } from '@agentic-workstation/ui/ChoiceField'

import type { SourceFieldsProps } from '../SourceModal.types'

/** Откуда звонки: вид источника - только у нового, у заведённого он не меняется. */
export const KindPicker = ({ form, onChange }: SourceFieldsProps) => {
  const { t } = useTranslation()
  const options = CALENDAR_SOURCE_KINDS.map((kind) => ({
    value: kind,
    label: t(`calendar.kinds.${kind}.label`),
    description: t(`calendar.kinds.${kind}.note`),
  }))

  return (
    <ChoiceField
      label={t('calendar.form.kind')}
      value={form.kind}
      options={options}
      onPick={(kind) => onChange({ kind: kind as CalendarSourceKind, connectorId: '' })}
    />
  )
}
