import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Section } from '@agentic-workstation/ui/Section'
import { Switch } from '@agentic-workstation/ui/Switch'

import type { RouteOf } from '../../../lib/route.types'
import { failureText } from '../../../state/commands.utils'
import { LinkWait } from '../../../shell/LinkWait/LinkWait'
import { OptionList } from '../../../shell/OptionList/OptionList'
import { ScenarioInputs } from '../../../shell/ScenarioInputs/ScenarioInputs'
import { Screen } from '../../../shell/Screen/Screen'
import { useScheduleScreen } from './ScheduleScreen.hooks'
import styles from './ScheduleScreen.module.scss'
import { WhenFields } from './parts/WhenFields'

/**
 * Поставить сценарий на час: когда, ответы на его вопросы (в тот час отвечать некому), своя
 * worktree или папка проекта, провайдер. Час - по часам Mac: так его считает IDE.
 */
export const ScheduleScreen = ({ route }: { route: RouteOf<'schedule'> }) => {
  const { t } = useTranslation()
  const screen = useScheduleScreen(route)
  const { shelves, scenario, form, update } = screen

  return (
    <Screen
      title={t('schedule.title')}
      subtitle={scenario?.name}
      agentId={route.agentId}
      help={{ title: t('schedule.help.title'), text: t('schedule.help.text') }}
      footer={
        <Button
          size="touch"
          variant="primary"
          disabled={!screen.canSubmit}
          onClick={() => void screen.handleSubmit()}>
          {t('schedule.submit')}
        </Button>
      }>
      {shelves.isPending && <LinkWait agentId={route.agentId} label={t('start.loading')} />}
      {shelves.isError && <p className={styles.error}>{failureText(t, shelves.error)}</p>}
      {shelves.data && !scenario && (
        <p className={styles.error}>{t('errors.refusedBecause.scenarioGone')}</p>
      )}
      {scenario && (
        <>
          <WhenFields screen={screen} />
          <ScenarioInputs
            scenario={scenario}
            values={form.inputs}
            onChange={(inputs) => update({ inputs })}
          />
          <Section size="sm" title={t('start.options')}>
            <Switch
              label={t('start.worktree')}
              description={t('start.worktreeHint')}
              checked={form.worktree}
              onChange={(worktree) => update({ worktree })}
            />
          </Section>
          {screen.providers.length > 1 && (
            <Section size="sm" title={t('newConversation.provider')}>
              <OptionList
                label={t('newConversation.provider')}
                options={screen.providers.map((one) => ({ value: one.id, label: one.label }))}
                isSelected={(value) => value === screen.provider}
                onSelect={(provider) => update({ provider })}
              />
            </Section>
          )}
        </>
      )}
    </Screen>
  )
}
