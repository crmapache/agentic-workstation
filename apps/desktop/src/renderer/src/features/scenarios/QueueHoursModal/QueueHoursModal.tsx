import { useScenarioQueues } from '../../../state/scenarios.queries'
import type { QueueHoursModalProps } from './QueueHoursModal.types'
import { HoursForm } from './parts/HoursForm'

/**
 * Окно рабочих часов очереди (ADR 0074). Форма встаёт, когда очередь найдена: её часы - начало
 * формы. Очередь пропала (закрыли с телефона) - окна нет.
 */
export const QueueHoursModal = ({ request }: QueueHoursModalProps) => {
  const { data: view } = useScenarioQueues()
  const queue = view?.queues.find((one) => one.id === request.queueId)

  return queue ? <HoursForm queue={queue} /> : null
}
