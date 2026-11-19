import { useTranslation } from 'react-i18next'

import type { EffortLevel } from '@shared/conversation'

import { MenuItem } from '@agentic-workstation/ui/MenuItem'

import { EFFORT_ICONS, DEFAULT_CHOICE_ICON } from '../ComposerStatus.constants'
import type { SectionProps } from '../ComposerStatus.types'
import { useConversationActions } from '../../conversation-actions.hooks'
import { useEffortLevels } from '../../panel.queries'

/**
 * Раздел EFFORT панели индикатора: сколько модель думает перед ответом - уровни, которые
 * понимает модель разговора, сильнейший сверху. «По умолчанию» (как в настройках CLI) -
 * последним, как в разделе Model:
 * это отказ от выбора, а не ступень шкалы. Уровень - иконкой по смыслу, как режимы в Mode.
 * С onPicked выбор ведёт дальше, к режиму, а не закрывает панель.
 */
export const EffortItems = ({ conversation, onPicked }: SectionProps) => {
  const { t } = useTranslation()
  const { setOptions } = useConversationActions()
  const levels = useEffortLevels(conversation.model)
  const keepOpen = onPicked !== undefined

  const handlePick = (effort: EffortLevel | null) => {
    void setOptions(conversation.id, { effort })
    onPicked?.()
  }

  return (
    <>
      {levels.map((level) => (
        <MenuItem
          key={level}
          icon={EFFORT_ICONS[level]}
          label={t(`agentPanel.effort.levels.${level}`)}
          description={t(`agentPanel.effort.hints.${level}`)}
          current={level === conversation.effort}
          keepOpen={keepOpen}
          onSelect={() => handlePick(level)}
        />
      ))}
      <MenuItem
        icon={DEFAULT_CHOICE_ICON}
        label={t('agentPanel.effort.default')}
        description={t('agentPanel.effort.defaultHint')}
        current={conversation.effort === null}
        keepOpen={keepOpen}
        onSelect={() => handlePick(null)}
      />
    </>
  )
}
