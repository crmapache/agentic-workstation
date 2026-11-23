import { useState } from 'react'

import { useCalendarActions } from '../calendar.actions'
import { useCalendarStore } from '../calendar.store'
import { useCalendar } from '../../../state/calendar.queries'
import type { SourceForm } from './SourceModal.types'
import { formOf, draftOf, freeColor, problemOf } from './SourceModal.utils'

/**
 * Форма источника: набранное, чего не хватает, сохранение и отказ главного процесса кодом.
 * Новый прямой источник главный процесс сразу читает, а источник ИИ - сразу встаёт в очередь.
 */
export const useSourceForm = (sourceId: string | null) => {
  const { data: state } = useCalendar()
  const close = useCalendarStore((store) => store.closeEditor)
  const { save } = useCalendarActions()
  const sources = state?.sources ?? []
  const source = sources.find((one) => one.id === sourceId) ?? null
  const [form, setForm] = useState<SourceForm>(() => formOf(source, freeColor(sources)))
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const problem = problemOf(form, source !== null)

  const change = (patch: Partial<SourceForm>) => {
    setFailure(null)
    setForm((previous) => ({ ...previous, ...patch }))
  }

  const submit = async () => {
    if (problem || saving) return

    setSaving(true)

    const outcome = await save(draftOf(form, source?.id ?? null))

    setSaving(false)

    if (outcome.ok) close()
    else setFailure(outcome.code)
  }

  return {
    form,
    source,
    change,
    problem,
    saving,
    failure,
    close,
    submit,
    vault: state?.vault ?? true,
  }
}
