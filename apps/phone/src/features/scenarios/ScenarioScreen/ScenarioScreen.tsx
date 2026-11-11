import { useState } from 'react'
import { Copy, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { IconButton } from '@agentic-workstation/ui/IconButton'

import { ScenarioView } from '../ScenarioView/ScenarioView'
import type { RouteOf } from '../../../lib/route.types'
import { failureText } from '../../../state/commands.utils'
import { ConfirmDialog } from '../../../shell/ConfirmDialog/ConfirmDialog'
import { LinkWait } from '../../../shell/LinkWait/LinkWait'
import { Screen } from '../../../shell/Screen/Screen'
import { useScenarioScreen } from './ScenarioScreen.hooks'
import styles from './ScenarioScreen.module.scss'

/**
 * Сценарий целиком на чтение: вопросы, голова, этапы и карточки. Запустить и поставить на час -
 * в низу под пальцем; копия и удаление (с «точно?») - значками в шапке: это действия над самим
 * сценарием, не главные.
 */
export const ScenarioScreen = ({ route }: { route: RouteOf<'scenario'> }) => {
  const { t } = useTranslation()
  const screen = useScenarioScreen(route)
  const { scenario } = screen
  const [isDeleting, setIsDeleting] = useState(false)

  return (
    <Screen
      title={scenario.data?.name ?? t('scenario.title')}
      subtitle={t(`start.shelf.${route.scope}`)}
      agentId={route.agentId}
      help={{ title: t('scenario.help.title'), text: t('scenario.help.text') }}
      actions={
        scenario.data && (
          <>
            <IconButton
              icon={Copy}
              size="touch"
              label={t('scenario.duplicate')}
              disabled={screen.busy}
              onClick={screen.handleDuplicate}
            />
            <IconButton
              icon={Trash2}
              size="touch"
              label={t('scenarios.delete')}
              disabled={screen.busy}
              onClick={() => setIsDeleting(true)}
            />
          </>
        )
      }
      footer={
        scenario.data && (
          <div className={styles.footer}>
            <Button size="touch" onClick={screen.handleSchedule}>
              {t('scenario.schedule')}
            </Button>
            <Button size="touch" variant="primary" onClick={screen.handleStart}>
              {t('start.start')}
            </Button>
          </div>
        )
      }>
      {scenario.isPending && <LinkWait agentId={route.agentId} label={t('scenario.loading')} />}
      {scenario.isError && (
        <div className={styles.failed}>
          <p className={styles.error}>{failureText(t, scenario.error)}</p>
          <Button size="touch" onClick={() => void scenario.refetch()}>
            {t('history.retry')}
          </Button>
        </div>
      )}
      {scenario.data && <ScenarioView scenario={scenario.data} />}
      <ConfirmDialog
        open={isDeleting}
        title={t('scenario.deleteConfirm', { name: scenario.data?.name ?? '' })}
        text={t('scenario.deleteText')}
        confirmLabel={t('scenarios.delete')}
        onConfirm={screen.handleDelete}
        onClose={() => setIsDeleting(false)}
      />
    </Screen>
  )
}
