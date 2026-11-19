import { useTranslation } from 'react-i18next'

import { MenuItem } from '@agentic-workstation/ui/MenuItem'

import { DEFAULT_CHOICE_ICON } from '../ComposerStatus.constants'
import { useModelPick } from '../ComposerStatus.hooks'
import type { SectionProps } from '../ComposerStatus.types'

/** Пункт «по умолчанию» раздела Model - общий у меню каталога CLI и меню подключений. */
export const DefaultModelItem = ({ conversation, onPicked }: SectionProps) => {
  const { t } = useTranslation()
  const pick = useModelPick(conversation, onPicked)

  return (
    <MenuItem
      icon={DEFAULT_CHOICE_ICON}
      label={t('agentPanel.model.default')}
      description={t('agentPanel.model.defaultHint')}
      current={conversation.model === null}
      keepOpen={onPicked !== undefined}
      onSelect={() => pick(null)}
    />
  )
}
