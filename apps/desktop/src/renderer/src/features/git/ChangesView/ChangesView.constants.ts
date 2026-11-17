import type { GitChangeKind } from '@shared/git'

import type { ChangeGroupId } from './ChangesView.types'

/**
 * Буква вида изменения справа от строки, как в VS Code и Cursor: цвет имени - язык
 * WebStorm, а буква договаривает то, что цветом не сказать (удалён и переименован).
 */
export const CHANGE_LETTERS: Readonly<Record<GitChangeKind, string>> = {
  modified: 'M',
  added: 'A',
  deleted: 'D',
  renamed: 'R',
  untracked: 'U',
  conflict: '!',
}

/** Все группы списка: по ним замер узнаёт группу по её метке в разметке (groupMark). */
export const CHANGE_GROUP_IDS: readonly ChangeGroupId[] = ['tracked', 'untracked']

/**
 * Метка строк группы для замера списка (ChangesView.hooks.ts): атрибут, а не класс - классы
 * принадлежат стилям, и то, что меряется, не должно уезжать с их переименованием.
 */
export const ROWS_MARK = { 'data-change-rows': '' }
