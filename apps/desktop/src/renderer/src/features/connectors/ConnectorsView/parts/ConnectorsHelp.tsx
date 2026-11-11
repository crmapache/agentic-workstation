import { useTranslation } from 'react-i18next'

import { HelpButton } from '@agentic-workstation/ui/HelpButton'

import type { ConnectorsHelpProps } from '../ConnectorsView.types'

/** «?» у заголовка вида Connectors или его раздела: пояснение окном, а не абзацем. */
export const ConnectorsHelp = ({ topic }: ConnectorsHelpProps) => {
  const { t } = useTranslation()

  return (
    <HelpButton
      label={t('connectors.help.label')}
      title={t(`connectors.help.${topic}.title`)}
      text={t(`connectors.help.${topic}.text`)}
      closeLabel={t('connectors.modal.close')}
    />
  )
}
