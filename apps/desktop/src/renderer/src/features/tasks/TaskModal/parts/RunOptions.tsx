import { useTranslation } from 'react-i18next'

import { EFFORT_LEVELS } from '@shared/claude'
import { TASK_MODES } from '@shared/tasks'
import type { TaskMode } from '@shared/tasks'

import { Switch } from '@agentic-workstation/ui/Switch'

import type { RunOptionsProps } from '../TaskModal.types'
import { useProviders } from '../../../../state/scenarios.queries'
import { ChoiceField } from './ChoiceField'

/**
 * Как задание идёт: модель (каталог провайдера и свои модели человека; у поручения - рабочая,
 * проверки идут на дешёвой) и усилие (пусто - как у новой вкладки), режим разрешений и
 * переключатели - по расписанию, наверстывать пропуск, отчёт в уведомления.
 */
export const RunOptions = ({ draft, onChange }: RunOptionsProps) => {
  const { t } = useTranslation()
  const providers = useProviders().data ?? []
  const models = providers.find((provider) => provider.id === draft.provider)?.models ?? []
  const modelChoices = [
    { value: '', label: t('tasks.form.defaultModel') },
    ...models.map((model) => ({
      value: model.value,
      label: model.displayName,
      description: model.description,
    })),
  ]
  const effortChoices = [
    { value: '', label: t('tasks.form.defaultEffort') },
    ...EFFORT_LEVELS.map((level) => ({
      value: level,
      label: t(`tasks.form.efforts.${level}`),
      description: t(`tasks.form.effortHints.${level}`),
    })),
  ]
  const modeChoices = TASK_MODES.map((mode) => ({
    value: mode,
    label: t(`tasks.form.modes.${mode}`),
  }))
  // Ритм и наверстывание - только у задания по расписанию: поручение живёт до результата.
  const scheduled = draft.kind === 'schedule' && draft.schedule.repeat !== 'manual'

  return (
    <>
      <ChoiceField
        label={t('tasks.form.model')}
        value={draft.model}
        choices={modelChoices}
        onPick={(model) => onChange({ model })}
      />
      <ChoiceField
        label={t('tasks.form.effort')}
        value={draft.effort}
        choices={effortChoices}
        onPick={(effort) => onChange({ effort })}
      />
      <ChoiceField
        label={t('tasks.form.mode')}
        value={draft.permissionMode}
        choices={modeChoices}
        onPick={(mode) => onChange({ permissionMode: mode as TaskMode })}
      />
      {scheduled && (
        <Switch
          label={t('tasks.form.enabled')}
          description={t('tasks.form.enabledHint')}
          checked={draft.enabled}
          onChange={(enabled) => onChange({ enabled })}
        />
      )}
      {scheduled && (
        <Switch
          label={t('tasks.form.catchUp')}
          description={t('tasks.form.catchUpHint')}
          checked={draft.catchUp}
          onChange={(catchUp) => onChange({ catchUp })}
        />
      )}
      <Switch
        label={t('tasks.form.report')}
        description={t('tasks.form.reportHint')}
        checked={draft.report}
        onChange={(report) => onChange({ report })}
      />
    </>
  )
}
