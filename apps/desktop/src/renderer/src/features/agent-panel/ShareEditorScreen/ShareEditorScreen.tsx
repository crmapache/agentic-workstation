import { useTranslation } from 'react-i18next'

import { Card } from '@agentic-workstation/ui/Card'
import { Switch } from '@agentic-workstation/ui/Switch'

import { useConversationActions } from '../conversation-actions.hooks'
import { usePanelPrefs } from '../panel.queries'
import { PanelScreen } from '../PanelScreen/PanelScreen'
import styles from './ShareEditorScreen.module.scss'

/**
 * Settings → Open file and selection: уходит ли с сообщением открытый файл и выделенные
 * строки. Тот же выключатель - в меню чипа файла под полем; там же одно сообщение можно
 * отправить наперекор.
 */
export const ShareEditorScreen = () => {
  const { t } = useTranslation()
  const { shareEditor } = usePanelPrefs()
  const { setPrefs } = useConversationActions()

  return (
    <PanelScreen title={t('agentPanel.menu.titles.shareEditor.title')}>
      <Card>
        <div className={styles.row}>
          <Switch
            label={t('agentPanel.shareEditor.label')}
            description={t('agentPanel.shareEditor.hint')}
            checked={shareEditor}
            onChange={(value) => void setPrefs({ shareEditor: value })}
          />
        </div>
      </Card>
    </PanelScreen>
  )
}
