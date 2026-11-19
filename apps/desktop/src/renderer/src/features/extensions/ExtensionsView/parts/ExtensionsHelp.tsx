import { useTranslation } from 'react-i18next'

import { HelpButton } from '@agentic-workstation/ui/HelpButton'

/** «?» у заголовка вида Extensions: что это и как устроены права - окном, а не абзацем. */
export const ExtensionsHelp = () => {
  const { t } = useTranslation()

  return (
    <HelpButton
      label={t('extensions.help.label')}
      title={t('extensions.help.title')}
      text={t('extensions.help.text')}
      closeLabel={t('extensions.help.close')}
    />
  )
}
