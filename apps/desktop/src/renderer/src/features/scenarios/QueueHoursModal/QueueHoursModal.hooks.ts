import { useState } from 'react'

import type { QueueHours, ScenarioQueue } from '@shared/scenario-queues'
import { useMutation } from '@tanstack/react-query'

import { DEFAULT_HOURS } from '../scenarios-queue-hours.utils'
import { useScenarioActions } from '../scenarios.actions'
import { useScenariosStore } from '../scenarios.store'

/**
 * Форма часов: дни, начало и конец - черновиком до Save. Сохранённые часы главный процесс
 * применяет сразу (уснуть или проснуться) и присылает очередь событием; окно закрывается,
 * когда он ответил «вышло».
 */
export const useHoursForm = (queue: ScenarioQueue) => {
  const close = useScenariosStore((state) => state.close)
  const actions = useScenarioActions()
  const [hours, setHours] = useState<QueueHours>(() => queue.hours ?? DEFAULT_HOURS)
  const saving = useMutation({
    mutationFn: (next: QueueHours | null) =>
      actions.queue(queue.id, { kind: 'hours', hours: next }),
    onSuccess: (isSaved) => {
      if (isSaved) close()
    },
  })

  // Правки - от текущего черновика, а не от снимка рендера: два нажатия подряд не затирают друг друга.
  const toggleDay = (day: number) => (pressed: boolean) =>
    setHours((current) => ({
      ...current,
      days: pressed
        ? [...new Set([...current.days, day])].sort((left, right) => left - right)
        : current.days.filter((one) => one !== day),
    }))

  return {
    hours,
    /** Часы у очереди уже есть - их можно снять. */
    isSet: queue.hours !== null,
    canSave: hours.days.length > 0 && !saving.isPending,
    isSaving: saving.isPending,
    toggleDay,
    setFrom: (from: number) => setHours((current) => ({ ...current, from })),
    setTo: (to: number) => setHours((current) => ({ ...current, to })),
    save: () => saving.mutate(hours),
    remove: () => saving.mutate(null),
    close,
  }
}
