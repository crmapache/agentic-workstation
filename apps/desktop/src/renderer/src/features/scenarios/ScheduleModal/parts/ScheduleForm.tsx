import { CalendarClock } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { SCENARIO_REPEATS } from '@shared/scenarios'
import type { ScenarioRepeat } from '@shared/scenarios'

import { Button } from '@agentic-workstation/ui/Button'
import { HelpButton } from '@agentic-workstation/ui/HelpButton'
import { Modal } from '@agentic-workstation/ui/Modal'
import { Switch } from '@agentic-workstation/ui/Switch'
import { Tabs } from '@agentic-workstation/ui/Tabs'

import { useScheduleForm } from '../ScheduleModal.hooks'
import styles from '../ScheduleModal.module.scss'
import type { ScheduleFormProps } from '../ScheduleModal.types'
import { schedulable } from '../ScheduleModal.utils'
import { WEEKDAYS, weekdayName } from '../../scenarios-hours.utils'
import { useProviders } from '../../../../state/scenarios.queries'
import { HourPicker } from './HourPicker'
import { InputFields } from './InputFields'
import { ProviderPicker } from './ProviderPicker'
import { ScenarioPicker } from './ScenarioPicker'

/**
 * Форма часа целиком: сценарий (если его не дали), час и минуты, ритм и день недели, ответы на
 * вопросы - в назначенный час за клавиатурой никого нет, - отдельный worktree и провайдер.
 * Сверху сказано, добавляется час или правится: у сценария их сколько угодно.
 */
export const ScheduleForm = (props: ScheduleFormProps) => {
  const { t } = useTranslation()
  const providers = useProviders().data ?? []
  const when = useScheduleForm(props)
  const { form, scenario } = when
  const title = t('scenarios.schedule.form.title')
  const repeats = SCENARIO_REPEATS.map((id) => ({
    id,
    label: t(`scenarios.schedule.form.repeats.${id}`),
  }))
  const weekdays = WEEKDAYS.map((day) => ({ id: String(day), label: weekdayName(day) }))
  const asksSomething = scenario?.inputs.some((input) => input.name.trim()) ?? false

  const handleRepeat = (repeat: ScenarioRepeat) => when.setHour({ ...form.hour, repeat })

  const handleWeekday = (day: string) => when.setHour({ ...form.hour, weekday: Number(day) })

  return (
    <Modal
      open
      icon={CalendarClock}
      title={title}
      description={
        scenario
          ? props.request.scheduleId
            ? t('scenarios.schedule.form.changing', { name: scenario.name })
            : t('scenarios.schedule.form.adding', { name: scenario.name })
          : undefined
      }
      headerActions={
        <HelpButton
          label={t('scenarios.schedule.form.help.label')}
          title={title}
          text={t('scenarios.schedule.form.help.text')}
          closeLabel={t('common.close')}
        />
      }
      footer={
        <div className={styles.footer}>
          <Button variant="ghost" onClick={when.close}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" disabled={!when.canSave} onClick={when.save}>
            {t('scenarios.schedule.form.submit')}
          </Button>
        </div>
      }
      closeLabel={t('common.close')}
      onClose={when.close}>
      <div className={styles.body}>
        {/* Сценарий, с которого открыли, не выбирают; пропал с полки - час можно перевести на другой. */}
        {(!props.request.scenarioId || !scenario) && (
          <ScenarioPicker
            scenarios={schedulable(props.scenarios)}
            value={scenario}
            onPick={when.pickScenario}
          />
        )}
        <HourPicker hour={form.hour} onChange={when.setHour} />
        <div className={styles.field}>
          <span className={styles.caption} aria-hidden>
            {t('scenarios.schedule.form.repeat')}
          </span>
          <div className={styles.picker}>
            <Tabs
              label={t('scenarios.schedule.form.repeat')}
              items={repeats}
              value={form.hour.repeat}
              onChange={handleRepeat}
            />
          </div>
        </div>
        {form.hour.repeat === 'weekly' && (
          <div className={styles.field}>
            <span className={styles.caption} aria-hidden>
              {t('scenarios.schedule.form.onDay')}
            </span>
            <div className={styles.picker}>
              <Tabs
                label={t('scenarios.schedule.form.onDay')}
                items={weekdays}
                value={String(form.hour.weekday)}
                onChange={handleWeekday}
              />
            </div>
          </div>
        )}
        {scenario && asksSomething && (
          <InputFields scenario={scenario} values={form.values} onChange={when.setValues} />
        )}
        <ProviderPicker providers={providers} value={form.provider} onPick={when.setProvider} />
        <Switch
          label={t('scenarios.schedule.form.worktree')}
          description={t('scenarios.schedule.form.worktreeHint')}
          checked={form.worktree}
          onChange={when.setWorktree}
        />
      </div>
    </Modal>
  )
}
