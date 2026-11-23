import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { ChoiceField } from '@agentic-workstation/ui/ChoiceField'

import styles from '../SourceModal.module.scss'
import type { SourceFieldsProps } from '../SourceModal.types'
import { CONNECTOR_KIND } from '../SourceModal.utils'
import { useConnectors } from '../../../../state/connectors.queries'
import { useLayoutStore } from '../../../../state/layout.store'

/**
 * Коннектор, через который читается источник: аккаунт Google Calendar, Browser или Computer.
 * Один подходящий - выбран сам; ни одного - кнопка на вид Connectors, где его подключают.
 */
export const ConnectorField = ({ form, onChange }: SourceFieldsProps) => {
  const { t } = useTranslation()
  const { data } = useConnectors()
  const kind = CONNECTOR_KIND[form.kind]
  const fitting = (data?.connectors ?? []).filter((one) => one.kind === kind)
  const [only] = fitting

  useEffect(() => {
    if (fitting.length === 1 && only && form.connectorId !== only.id)
      onChange({ connectorId: only.id })
  }, [fitting.length, only, form.connectorId, onChange])

  if (fitting.length === 0) {
    return (
      <div className={styles.field}>
        <span className={styles.caption}>{t(`calendar.form.noConnector.${form.kind}`)}</span>
        <div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => useLayoutStore.getState().showMainView('connectors')}>
            {t('calendar.form.openConnectors')}
          </Button>
        </div>
      </div>
    )
  }

  if (fitting.length === 1) return null

  return (
    <ChoiceField
      label={t(`calendar.form.connector.${form.kind}`)}
      value={form.connectorId}
      options={fitting.map((one) => ({
        value: one.id,
        label: one.account || one.label || one.serverName,
        description: one.enabled ? undefined : t('calendar.form.connectorOff'),
      }))}
      onPick={(connectorId) => onChange({ connectorId, calendarIds: [] })}
    />
  )
}
