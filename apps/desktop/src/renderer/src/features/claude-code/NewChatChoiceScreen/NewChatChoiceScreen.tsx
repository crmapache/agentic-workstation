import { useTranslation } from 'react-i18next'

import { Menu } from '@agentic-workstation/ui/Menu'
import { MenuItem } from '@agentic-workstation/ui/MenuItem'

import { useClaudeActions } from '../claude-actions.hooks'
import { useClaudeCodeStore } from '../claude-code.store'
import { useProjectClaudeSettings } from '../claude-settings.queries'
import { usePanelPrefs, useModelCatalog } from '../claude.queries'
import type { MenuScreenProps } from '../claude.types'
import { pickableModels } from '../models.utils'
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
  const catalog = useModelCatalog()
  const screen = useClaudeCodeStore((store) => store.menu.screen)
  const { setPrefs } = useClaudeActions()
  const field = FIELD_OF_SCREEN[screen] ?? 'model'
  const { data: info } = useProjectClaudeSettings(project.id, field === 'mode')
  const models = pickableModels(catalog, prefs.customModels)
  const pinned = pinnedValue(prefs, field)
  const bypassAllowed = info?.bypassDisabled === false
  const choices = newChatChoices(field, models, bypassAllowed, t)
  const now = fieldWord(field, lastPick(conversation, field), models, t)

  const handlePick = (value: string | null) => void setPrefs(pinPatch(field, value))

  return (
    <>
      <Menu label={t(`claudeCode.menu.titles.${screen}.title`)} autoFocus>
        <MenuItem
          selection="single"
          checked={pinned === null}
          label={t('claudeCode.newChats.lastUsed')}
          description={t('claudeCode.newChats.lastUsedNow', { value: now })}
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
      {field === 'mode' && info?.bypassDisabled && (
        <p className={styles.note}>{t('claudeCode.newChats.bypassOff')}</p>
      )}
    </>
  )
}
