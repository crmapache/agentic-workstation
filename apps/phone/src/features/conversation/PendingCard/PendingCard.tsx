import type { PendingCardProps } from './PendingCard.types'
import { PermissionCard } from './parts/PermissionCard'
import { PlanCard } from './parts/PlanCard'
import { QuestionCard } from './parts/QuestionCard'

/**
 * Вопрос, на котором стоит ход, - над полем ввода: разрешение (разрешить один раз или нет -
 * «всегда» с телефона не даётся), вопрос с вариантами, план (одобрить или доработать).
 */
export const PendingCard = (props: PendingCardProps) => {
  const { pending } = props

  switch (pending.kind) {
    case 'permission':
      return <PermissionCard {...props} pending={pending} />
    case 'question':
      return <QuestionCard {...props} pending={pending} />
    case 'plan':
      return <PlanCard {...props} pending={pending} />
  }
}
