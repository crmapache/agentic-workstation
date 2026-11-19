import type { Project } from '@shared/workspace'

export type RecentlyClosedProps = {
  project: Project
  /** Строка поиска в нижнем регистре: закрытые фильтруются по имени так же, как история. */
  needle: string
  now: number
}
