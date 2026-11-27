import { useTranslation } from 'react-i18next'

import { Card } from '@agentic-workstation/ui/Card'
import { HelpButton } from '@agentic-workstation/ui/HelpButton'
import { Switch } from '@agentic-workstation/ui/Switch'

import styles from '../SettingsDialog.module.scss'
import { useIdePrefs, useSetIdePrefs } from '../../../../state/ide-prefs.queries'
import { SettingRow } from './SettingRow'

/**
 * Карточка «Computer Use» раздела Chat (ADR 0130): работа ИИ на компьютере кончилась - IDE
 * выходит вперёд с её чатом. Когда возврата не бывает (человек сам взял мышь), - за «?».
 */
export const ReturnCard = () => {
  const { t } = useTranslation()
  const { returnAfterComputer } = useIdePrefs()
  const save = useSetIdePrefs()

  const handleToggle = (on: boolean) => void save({ returnAfterComputer: on })

  return (
    <Card
      title={t('settings.chat.computerTitle')}
      help={
        <HelpButton
          label={t('settings.chat.returnHelpLabel')}
          title={t('settings.chat.return')}
          text={t('settings.chat.returnHelp')}
          closeLabel={t('common.close')}
        />
      }>
      <div className={styles.rows}>
        <SettingRow
          label={t('settings.chat.return')}
          description={
            returnAfterComputer ? t('settings.chat.returnOn') : t('settings.chat.returnOff')
          }>
          <Switch
            label={t('settings.chat.return')}
            labelHidden
            checked={returnAfterComputer}
            onChange={handleToggle}
          />
        </SettingRow>
      </div>
    </Card>
  )
}
