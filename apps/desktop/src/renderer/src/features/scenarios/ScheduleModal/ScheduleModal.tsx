import { useState } from 'react'

import { useScenarioShelves } from '../../../state/scenarios.queries'
import type { ScheduleModalProps } from './ScheduleModal.types'
import { initialForm } from './ScheduleModal.utils'
import { ScheduleForm } from './parts/ScheduleForm'

/**
 * Окно отложенного запуска «When» (WhenForm в ACC): какой сценарий, во сколько, как часто, ответы
 * на его вопросы, worktree и провайдер. Форма встаёт, когда полки уже прочитаны: правка часа
 * открывается его же ответами, а их без полок не найти.
 */
export const ScheduleModal = (props: ScheduleModalProps) => {
  const view = useScenarioShelves(props.project.id).data
  // Час «примерно через час» считается от открытия окна, а не от каждой перерисовки.
  const [openedAt] = useState(() => Date.now())

  if (!view) return null

  return (
    <ScheduleForm
      {...props}
      scenarios={view.scenarios}
      initial={initialForm(props.request, view, openedAt)}
    />
  )
}
