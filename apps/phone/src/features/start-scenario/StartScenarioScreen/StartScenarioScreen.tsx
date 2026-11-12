import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'

import type { RouteOf } from '../../../lib/route.types'
import { failureText } from '../../../state/commands.utils'
import { LinkWait } from '../../../shell/LinkWait/LinkWait'
import { ScenarioInputs } from '../../../shell/ScenarioInputs/ScenarioInputs'
import { Screen } from '../../../shell/Screen/Screen'
import { useStartScenario } from './StartScenarioScreen.hooks'
import styles from './StartScenarioScreen.module.scss'
import { ScenarioPicker } from './parts/ScenarioPicker'
import { TargetPicker } from './parts/TargetPicker'

/**
 * Запуск сценария с телефона: сценарий с полки проекта или личной, ответы на его вопросы, новая
 * очередь (своя worktree или папка проекта) или существующая, провайдер. Дальше - экран очереди.
 */
export const StartScenarioScreen = ({ route }: { route: RouteOf<'startScenario'> }) => {
  const { t } = useTranslation()
  const start = useStartScenario(route)
  const { shelves, scenario } = start

  return (
    <Screen
      title={t('start.title')}
      agentId={route.agentId}
      help={{ title: t('start.help.title'), text: t('start.help.text') }}
      footer={
        <Button
          size="touch"
          variant="primary"
          disabled={!start.canStart}
          onClick={() => void start.handleStart()}>
          {t('start.start')}
        </Button>
      }>
      {shelves.isPending && <LinkWait agentId={route.agentId} label={t('start.loading')} />}
      {shelves.isError && <p className={styles.error}>{failureText(t, shelves.error)}</p>}
      {shelves.data && <ScenarioPicker scenarios={shelves.data.scenarios} start={start} />}
      {scenario && (
        <ScenarioInputs
          scenario={scenario}
          values={start.form.inputs}
          onChange={(inputs) => start.update({ inputs })}
        />
      )}
      {scenario && <TargetPicker start={start} />}
    </Screen>
  )
}
