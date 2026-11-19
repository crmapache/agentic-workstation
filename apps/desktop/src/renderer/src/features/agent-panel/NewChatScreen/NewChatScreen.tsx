import { useTranslation } from 'react-i18next'

import { Menu } from '@agentic-workstation/ui/Menu'
import { MenuItem } from '@agentic-workstation/ui/MenuItem'

import { usePickableModels } from '../models.hooks'
import { usePanelPrefs } from '../panel.queries'
import { usePanelStore } from '../panel.store'
import { NEW_CHAT_ROWS } from './NewChatScreen.constants'
import { fieldWord, pinnedValue } from './NewChatScreen.utils'

/**
 * С чем рождается новая вкладка (Settings → New chats): три строки и список за каждой.
 * Справа - закреплённое значение или «как выбрано в последний раз». Форк продолжает
 * свой источник, закреплённое его не трогает.
 */
export const NewChatScreen = () => {
  const { t } = useTranslation()
  const prefs = usePanelPrefs()
  const pickMenu = usePanelStore((store) => store.pickMenu)
  const models = usePickableModels()

  return (
    <Menu label={t('agentPanel.menu.titles.newChat.title')} autoFocus>
      {NEW_CHAT_ROWS.map((row) => {
        const pinned = pinnedValue(prefs, row.field)

        return (
          <MenuItem
            key={row.field}
            icon={row.icon}
            iconTone="neutral"
            label={t(`agentPanel.newChats.rows.${row.field}.label`)}
            description={t(`agentPanel.newChats.rows.${row.field}.sub`)}
            hint={
              pinned === null
                ? t('agentPanel.newChats.lastUsed')
                : fieldWord(row.field, pinned, models, t)
            }
            chevron
            onSelect={() => pickMenu(row.screen)}
          />
        )
      })}
    </Menu>
  )
}
