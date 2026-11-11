import { useTranslation } from 'react-i18next'

import { CONNECTOR_DESCRIPTION_MAX } from '@shared/connectors'

import { Section } from '@agentic-workstation/ui/Section'
import { TextArea } from '@agentic-workstation/ui/TextArea'

import { useDescriptionDraft } from '../ConnectorsView.hooks'
import type { ConnectorPartProps } from '../ConnectorsView.types'
import { ConnectorsHelp } from './ConnectorsHelp'

/**
 * Описание коннектора словами человека: что это и когда им пользоваться. Читает и он сам, и
 * модель - в пояснении сервера. Сохраняется само; что видит модель, объясняет «?».
 */
export const ConnectorDescription = ({ connector }: ConnectorPartProps) => {
  const { t } = useTranslation()
  const { draft, setDraft, flush } = useDescriptionDraft(connector)

  return (
    <Section
      size="sm"
      title={t('connectors.description.title')}
      help={<ConnectorsHelp topic="description" />}>
      <TextArea
        label={t('connectors.description.title')}
        hideLabel
        placeholder={t('connectors.description.placeholder')}
        value={draft}
        maxLength={CONNECTOR_DESCRIPTION_MAX}
        onChange={setDraft}
        onBlur={flush}
      />
    </Section>
  )
}
