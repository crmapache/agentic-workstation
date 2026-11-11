import { useTranslation } from 'react-i18next'

import { HelpButton } from '@agentic-workstation/ui/HelpButton'

import type { StatisticsHelpProps } from '../StatisticsView.types'

/** «?» у шапки вида или раздела статистики: что считается и откуда - окном, а не абзацем. */
export const StatisticsHelp = ({ topic }: StatisticsHelpProps) => {
  const { t } = useTranslation()

  return (
    <HelpButton
      label={t('statistics.help.label')}
      title={t(`statistics.help.${topic}.title`)}
      text={t(`statistics.help.${topic}.text`)}
      closeLabel={t('common.close')}
    />
  )
}
