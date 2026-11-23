import type { DraftToken } from '@shared/message-draft'
import type { CommandEntry, CommandGroup } from '@shared/slash-catalog'

import type { MatchRange } from '../../lib/fuzzy-match.types'
import type { CommandOption } from './slash.types'

/**
 * Строка подсказки над полем: команда, значение её аргумента или файл проекта. id - то,
 * что подставится (имя команды, значение, путь), по нему же держится выбор.
 */
export type SuggestRow = {
  id: string
  label: string
  description?: string | undefined
  group?: CommandGroup | undefined
  highlight?: readonly MatchRange[] | undefined
  kind: 'command' | 'value' | 'file' | 'folder'
}

/** Что сейчас подсказывать по «/»: исходные данные - голова поля и черновик. */
export type SlashInput = {
  /** Текст поля от начала до каретки; null - каретки в тексте нет. */
  head: string | null
  tokens: readonly DraftToken[]
  commands: readonly CommandEntry[]
  argumentSets: Readonly<Record<string, readonly CommandOption[]>>
  dismissed: boolean
}

/**
 * Итог разбора «/»: строки (команды или значения), чей аргумент выбирают, серый синтаксис
 * аргумента, ключ списка (выбор держится за него) и набрано ли имя целиком.
 */
export type SlashState = {
  rows: SuggestRow[]
  argument: { command: string; query: string } | null
  ghost: string | null
  listKey: string
  typedInFull: boolean
}
