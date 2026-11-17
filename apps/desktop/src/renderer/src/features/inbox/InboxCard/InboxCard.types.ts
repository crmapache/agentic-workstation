import type { InboxItem, InboxAction } from '@shared/inbox'

export type InboxCardProps = {
  item: InboxItem
  /** К нему привёл баннер ОС: подсвечено на миг. */
  highlighted?: boolean | undefined
}

export type ItemPartProps = { item: InboxItem }

export type ItemButtonsProps = {
  item: InboxItem
  /** Свои слова к кнопке: замечание к плану. */
  text: string
  /** Какие кнопки: у вопроса ответ рисует его часть, здесь - остальное. */
  actions: readonly InboxAction[]
  size?: 'sm' | 'md' | undefined
}

export type PlanFeedbackProps = { value: string; onChange: (value: string) => void }
