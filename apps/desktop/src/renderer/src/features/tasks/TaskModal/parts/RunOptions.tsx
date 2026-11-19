import { useTranslation } from 'react-i18next'

import type { TaskMode } from '@shared/tasks'

import { ChoiceField } from '@agentic-workstation/ui/ChoiceField'
import { Switch } from '@agentic-workstation/ui/Switch'

import type { RunOptionsProps } from '../TaskModal.types'
import { switchedTo, taskModesOf, taskEffortsOf } from '../TaskModal.utils'
import { modelChoices, providerChoices } from '../../../../lib/provider-choices'
import { useProviders } from '../../../../state/providers.queries'

/**
 * Как задание идёт: провайдер, модель (каталог провайдера и свои модели человека; у поручения -
 * рабочая, проверки идут своей) и усилие (пусто - как у новой вкладки провайдера), режим
 * разрешений - списками выбранного провайдера; переключатели - по расписанию, наверстывать
 * пропуск, отчёт в уведомления.
 */
export const RunOptions = ({ draft, onChange }: RunOptionsProps) => {
  const { t } = useTranslation()
  const providers = useProviders().data ?? []
  const provider = providers.find((one) => one.id === draft.provider)
  const providerOptions = providerChoices(providers, t)
  const models = modelChoices(provider ?? null, t('tasks.form.defaultModel'))
  const effortChoices = [
    { value: '', label: t('tasks.form.defaultEffort') },
    ...taskEffortsOf(provider, draft.model).map((level) => ({
      value: level,
      label: t(`tasks.form.efforts.${level}`),
      description: t(`tasks.form.effortHints.${level}`),
    })),
  ]
  const modeChoices = taskModesOf(provider).map((mode) => ({
    value: mode,
    label: t(`tasks.form.modes.${mode}`),
  }))
  // Ритм и наверстывание - только у задания по расписанию: поручение живёт до результата.
  const scheduled = draft.kind === 'schedule' && draft.schedule.repeat !== 'manual'

  const handleProvider = (id: string) => {
    const picked = providers.find((one) => one.id === id)

    if (picked && picked.id !== draft.provider) onChange(switchedTo(draft, picked))
  }

  return (
    <>
      <ChoiceField
        label={t('tasks.form.provider')}
        value={draft.provider}
        options={providerOptions}
        onPick={handleProvider}
      />
      <ChoiceField
        label={t('tasks.form.model')}
        value={draft.model}
        options={models}
        onPick={(model) =>
          onChange({
            model,
            // Уровень, которого у новой модели нет, - к «по умолчанию»; есть - остаётся.
            ...(!taskEffortsOf(provider, model).some((level) => level === draft.effort) && {
              effort: '',
            }),
          })
        }
      />
      <ChoiceField
        label={t('tasks.form.effort')}
        value={draft.effort}
        options={effortChoices}
        onPick={(effort) => onChange({ effort })}
      />
      <ChoiceField
        label={t('tasks.form.mode')}
        value={draft.permissionMode}
        options={modeChoices}
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
