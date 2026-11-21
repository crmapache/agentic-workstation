import { useTranslation } from 'react-i18next'

import { Switch } from '@agentic-workstation/ui/Switch'

import type { AutoRunFieldProps } from '../CardModal.types'
import { autoRunHint } from '../CardModal.utils'
import { useDueLabel, useFailureText } from '../../tracker.hooks'
import { dueMomentOf } from '../../tracker.utils'

/**
 * Запуск сценария карточки в срок на этом компьютере. Под переключателем - что будет: без срока
 * запускать нечего, прошлый отказ - почему, сделанная не уходит, на этот срок уже уходила,
 * прошедший срок уходит сразу, иначе - когда уйдёт.
 */
export const AutoRunField = ({ form, card, now }: AutoRunFieldProps) => {
  const { t } = useTranslation()
  const failureText = useFailureText()
  const when = useDueLabel(form.due, new Date(now).setHours(0, 0, 0, 0))
  const moment = form.due ? dueMomentOf(form.due) : null
  // Прошлое о карточке верно, пока в форме тот же срок, что у неё на доске.
  const sameDue = card !== null && JSON.stringify(card.due) === JSON.stringify(form.due)
  const failure = sameDue && form.autoRun ? card.autoRunFailure : null
  const hint = autoRunHint({
    hasDue: form.due !== null,
    failed: failure !== null,
    done: form.done && !form.repeat,
    sent: sameDue && card.autoRunSent,
    passed: moment !== null && moment <= now,
  })

  return (
    <Switch
      label={t('tracker.autoRun.label')}
      description={t(`tracker.autoRun.${hint}`, {
        when,
        reason: failure ? failureText(failure) : '',
      })}
      checked={form.autoRun}
      disabled={!form.due && !form.autoRun}
      onChange={(on) => form.set('autoRun', on)}
    />
  )
}
