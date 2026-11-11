import type { ScenarioScope } from '@shared/scenarios'

/** Модель пишет сценарий: номер запроса (по нему отменяют и узнают опоздавший ответ) и с какого момента. */
export type Drafting = { id: string; since: number }

export type AuthorState = {
  description: string
  /** Выбранная полка; null - не выбирали: проектная, если она есть. */
  scope: ScenarioScope | null
  drafting: Drafting | null
  /** Чем кончилась последняя попытка: код отказа или слова CLI; пусто - не было отказа. */
  error: string
}

export type AuthorStore = AuthorState & {
  update: (patch: Partial<AuthorState>) => void
  reset: () => void
}

export type DraftWaitProps = {
  /** Когда модель начала писать (мс) - от него считается ожидание. */
  since: number
}

/** Вариант выбора строкой: что выбирают и что из этого выйдет. */
export type ChoiceRow<Id extends string> = {
  id: Id
  label: string
  note: string
  disabled?: boolean | undefined
}

export type ChoiceRowsProps<Id extends string> = {
  /** Подпись группы капсом над строками и имя для скринридера. */
  label: string
  items: readonly ChoiceRow<Id>[]
  value: Id
  /** Вся группа недоступна - пока модель пишет сценарий. */
  disabled?: boolean | undefined
  onChange: (id: Id) => void
}
