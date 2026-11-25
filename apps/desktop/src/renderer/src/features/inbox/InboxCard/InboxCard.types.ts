import type { InboxItem, InboxAction } from '@shared/inbox'

export type InboxCardProps = {
  item: InboxItem
  /** К нему привёл баннер ОС: подсвечено на миг. */
  highlighted?: boolean | undefined
  /**
   * На виде уведомлений - свёрнута до шапки, пока её не раскроют (выбор - в inbox.store), а ждущая
   * ответа - раскрыта. В окне прогона - нет: там карточка и есть то, на что отвечают.
   */
  collapsible?: boolean | undefined
  /** Стоит в окне своего прогона: кнопки «открыть прогон» нет. */
  inRun?: boolean | undefined
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

export type ItemButtonProps = {
  item: InboxItem
  action: InboxAction
  /** Свои слова к кнопке: замечание к плану. */
  text: string
  size?: 'sm' | 'md' | undefined
}

export type PlanFeedbackProps = { value: string; onChange: (value: string) => void }
