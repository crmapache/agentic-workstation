import { useTranslation } from 'react-i18next'

import { Menu } from '@agentic-workstation/ui/Menu'
import { MenuItem } from '@agentic-workstation/ui/MenuItem'

import { useClaudeActions } from '../claude-actions.hooks'
import { usePanelPrefs, useClaudeState } from '../claude.queries'
import { PanelScreen } from '../PanelScreen/PanelScreen'
import styles from './MetersScreen.module.scss'
import { toggleMeter, meterChoices } from './MetersScreen.utils'

/**
 * Settings → Usage meters: какие показания стоят справа под полем ввода - каждое кольцо
 * лимита и токены за день, отметкой. По умолчанию видно всё; снятая отметка прячет
 * показание во всех вкладках сразу.
 */
export const MetersScreen = () => {
  const { t } = useTranslation()
  const { hiddenMeters } = usePanelPrefs()
  const { data: state } = useClaudeState()
  const { setPrefs } = useClaudeActions()
  const usage = state ? state.accounts.usage[state.accounts.current] : undefined
  const choices = meterChoices(usage, t)
  const title = t('claudeCode.menu.titles.meters.title')

  const handleToggle = (key: string) =>
    void setPrefs({ hiddenMeters: toggleMeter(hiddenMeters, key) })

  return (
    <PanelScreen title={title}>
      <Menu label={title} autoFocus>
        {choices.map((choice) => (
          <MenuItem
            key={choice.key}
            selection="multiple"
            checked={!hiddenMeters.includes(choice.key)}
            label={choice.label}
            description={choice.description}
            onSelect={() => handleToggle(choice.key)}
          />
        ))}
      </Menu>
      {!usage && <p className={styles.note}>{t('claudeCode.meters.noLimits')}</p>}
    </PanelScreen>
  )
}
