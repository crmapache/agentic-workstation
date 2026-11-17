import type { GitChange, GitChangeList } from '@shared/git'

/**
 * Группы списка, как в окне Commit у WebStorm: то, что git уже знает (изменено, добавлено,
 * удалено, переименовано, конфликт), и новые файлы, которых в git ещё нет.
 */
export type ChangeGroupId = 'tracked' | 'untracked'

export type ChangeGroupData = { id: ChangeGroupId; files: readonly GitChange[] }

/** Раскрыта ли группа; записи нет - ещё не решено: группа только появилась в списке. */
export type GroupExpansion = Partial<Record<ChangeGroupId, boolean>>

/** Группа в замере списка: сколько по высоте занимают её строки (свёрнутая - ноль). */
export type MeasuredGroup = { id: ChangeGroupId; rowsHeight: number }

/** Строка, на которой открыли меню, и куда его поставить; null - меню закрыто. */
export type ChangeMenuTarget = { change: GitChange; anchor: HTMLElement } | null

export type ProjectChangesProps = { projectId: string }

export type ChangeListProps = { projectId: string; changes: GitChangeList }

export type ChangeGroupProps = {
  projectId: string
  group: ChangeGroupData
  /** undefined - ещё не решено: группа стоит раскрытой, чтобы список её померил. */
  expanded: boolean | undefined
  onToggle: (id: ChangeGroupId) => void
  /** Группа ушла из списка: её раскрытие забывается, вернётся - решится заново. */
  onGone: (id: ChangeGroupId) => void
  onMenu: (change: GitChange, anchor: HTMLElement) => void
}

export type ChangeRowProps = {
  projectId: string
  change: GitChange
  onMenu: (change: GitChange, anchor: HTMLElement) => void
}

export type ChangeMenuProps = {
  projectId: string
  target: ChangeMenuTarget
  onClose: () => void
}
