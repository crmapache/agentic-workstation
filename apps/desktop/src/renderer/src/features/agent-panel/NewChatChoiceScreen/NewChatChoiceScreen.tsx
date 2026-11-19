import { useTranslation } from 'react-i18next'

import { Menu } from '@agentic-workstation/ui/Menu'
import { MenuItem } from '@agentic-workstation/ui/MenuItem'

import { useConversationActions } from '../conversation-actions.hooks'
import { usePickableModels } from '../models.hooks'
import { useBypassDisabled } from '../modes.hooks'
import { usePanelPrefs, useEffortLevels, usePanelCapabilities } from '../panel.queries'
import { usePanelStore } from '../panel.store'
import type { MenuScreenProps } from '../panel.types'
import { lastPick, fieldWord, pinnedValue } from '../NewChatScreen/NewChatScreen.utils'
import { FIELD_OF_SCREEN } from './NewChatChoiceScreen.constants'
import styles from './NewChatChoiceScreen.module.scss'
import { pinPatch, newChatChoices } from './NewChatChoiceScreen.utils'

/**
 * Список за строкой New chats: модель, усилие или режим новой вкладки. Первый пункт -
 * «как выбрано в последний раз» и чему это равно сейчас: обещание без имени заставило
 * бы идти и проверять. Выбор пишется сразу, вкладки, что уже открыты, не трогаются.
 */
export const NewChatChoiceScreen = ({ project, conversation }: MenuScreenProps) => {
  const { t } = useTranslation()
  const prefs = usePanelPrefs()
  const screen = usePanelStore((store) => store.menu.screen)
  const { setPrefs } = useConversationActions()
  const field = FIELD_OF_SCREEN[screen] ?? 'model'
  const bypassDisabled = useBypassDisabled(project.id, field === 'mode')
  // Пока слои настроек не прочлись, без вопросов не предлагается: они могли его запретить.
  const bypassAllowed = bypassDisabled === false
  const capabilities = usePanelCapabilities()
  const efforts = useEffortLevels(prefs.newTabModel)
  const models = usePickableModels()
  const pinned = pinnedValue(prefs, field)
  const choices = newChatChoices(
    field,
    models,
    { efforts, modes: capabilities.modes, bypassAllowed },
    t,
  )
  const now = fieldWord(field, lastPick(conversation, field), models, t)

  const handlePick = (value: string | null) => void setPrefs(pinPatch(field, value))

  return (
    <>
      <Menu label={t(`agentPanel.menu.titles.${screen}.title`)} autoFocus>
        <MenuItem
          selection="single"
          checked={pinned === null}
          label={t('agentPanel.newChats.lastUsed')}
          description={t('agentPanel.newChats.lastUsedNow', { value: now })}
          onSelect={() => handlePick(null)}
        />
        {choices.map((choice) => (
          <MenuItem
            key={choice.value}
            selection="single"
            checked={pinned === choice.value}
            label={choice.label}
            description={choice.description}
            onSelect={() => handlePick(choice.value)}
          />
        ))}
      </Menu>
      {field === 'mode' && bypassDisabled && (
        <p className={styles.note}>{t('agentPanel.newChats.bypassOff')}</p>
      )}
    </>
  )
}
