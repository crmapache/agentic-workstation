import { useTranslation } from 'react-i18next'

import { Card } from '@agentic-workstation/ui/Card'
import { Switch } from '@agentic-workstation/ui/Switch'

import { useClaudeActions } from '../claude-actions.hooks'
import { usePanelPrefs } from '../claude.queries'
import { PanelScreen } from '../PanelScreen/PanelScreen'

/**
 * Settings → Open file and selection: уходит ли с сообщением открытый файл и выделенные
 * строки. Тот же выключатель - в меню чипа файла под полем; там же одно сообщение можно
 * отправить наперекор.
 */
export const ShareEditorScreen = () => {
  const { t } = useTranslation()
  const { shareEditor } = usePanelPrefs()
  const { setPrefs } = useClaudeActions()

  return (
    <PanelScreen title={t('claudeCode.menu.titles.shareEditor.title')}>
      <Card>
        <Switch
          label={t('claudeCode.shareEditor.label')}
          description={t('claudeCode.shareEditor.hint')}
          checked={shareEditor}
          onChange={(value) => void setPrefs({ shareEditor: value })}
        />
      </Card>
    </PanelScreen>
  )
}
