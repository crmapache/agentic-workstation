import { useMemo, useState, useEffect } from 'react'

import type { DraftToken } from '@shared/message-draft'
import type { ProjectFileList } from '@shared/search'
import type { Project } from '@shared/workspace'
import { useQuery } from '@tanstack/react-query'

import { projectFilesQuery } from '../../state/project-files.queries'
import { headText, atQueryAt } from './field-caret'
import { placeCaretBefore } from './field-dom'
import type { Field, FieldInsert } from './field.types'
import { replaceCommandHead } from './slash-capture.utils'
import type { HeldChoice, CommandEntry, CommandOption } from './slash.types'
import { chosenRow, enterSends } from './slash.utils'
import type { SuggestRow } from './suggestions.types'
import { fileRows, slashState, prepareMentionTargets } from './suggestions.utils'

// Вне хука: React Query пересчитывает select только на новых данных, а не на каждую букву.
const selectTargets = (list: ProjectFileList) => prepareMentionTargets(list.paths)

type SuggestOptions = {
  project: Project
  field: Field
  insert: FieldInsert
  tokens: DraftToken[]
  commands: readonly CommandEntry[]
  argumentSets: Readonly<Record<string, readonly CommandOption[]>>
  isActive: boolean
}

/**
 * Подсказка над полем (как в ACC): «/» - команды и значения аргумента, «@» - файлы.
 * Выбор держится за имя, а не за место; мышь только подсвечивает. Tab подставляет,
 * Enter подставляет, пока команда не набрана целиком, а набранную отправляет; строка,
 * на которую спустились стрелкой, важнее. Esc закрывает список и дальше не идёт.
 */
export const useSuggestions = (options: SuggestOptions) => {
  const { field, insert, tokens, commands, argumentSets, isActive } = options
  const [dismissed, setDismissed] = useState(false)
  const [held, setHeld] = useState<HeldChoice | null>(null)
  const [caret, setCaret] = useState<{ head: string | null; at: string | null }>({
    head: null,
    at: null,
  })
  const [seenTokens, setSeenTokens] = useState(tokens)

  // Любая правка открывает подсказку снова и возвращает выбор наверх.
  if (seenTokens !== tokens) {
    setSeenTokens(tokens)
    setDismissed(false)
    setHeld(null)
  }

  const sync = () => {
    const node = field.fieldRef.current

    setCaret({
      head: node ? headText(node, field.registry.chipOf) : null,
      at: node ? (atQueryAt(node)?.query ?? null) : null,
    })
  }

  // Каретка ушла от недописанной команды - подсказка закрывается.
  useEffect(() => {
    document.addEventListener('selectionchange', sync)

    return () => document.removeEventListener('selectionchange', sync)
  })

  const slash = useMemo(
    () => slashState({ head: caret.head, tokens, commands, argumentSets, dismissed }),
    [caret.head, tokens, commands, argumentSets, dismissed],
  )
  const fileQuery = slash.rows.length > 0 || dismissed || !isActive ? null : caret.at
  const files = useQuery({
    ...projectFilesQuery(options.project.id),
    enabled: fileQuery !== null,
    select: selectTargets,
  })
  const found = useMemo(
    () => (fileQuery ? fileRows(files.data ?? [], fileQuery) : []),
    [files.data, fileQuery],
  )
  const isFiles = slash.rows.length === 0 && found.length > 0
  const rows: SuggestRow[] = isActive ? (isFiles ? found : slash.rows) : []
  const listKey = isFiles ? `@${fileQuery ?? ''}` : slash.listKey
  const highlight = chosenRow(rows, held, listKey)

  const step = (delta: number) =>
    setHeld((value) => {
      const from = chosenRow(rows, value, listKey)
      const row = rows[(from + delta + rows.length) % rows.length]

      return row ? { id: row.id, list: listKey, by: 'key' } : value
    })

  const hover = (index: number) => {
    const row = rows[index]

    if (row) setHeld({ id: row.id, list: listKey, by: 'pointer' })
  }

  /** Выбор команды - чип; выбор значения - чип команды и значение за ним. */
  const pickCommand = (row: SuggestRow) => {
    const node = field.fieldRef.current
    const command = slash.argument ? slash.argument.command : row.id
    const replacement: DraftToken[] = [
      { kind: 'chip', chip: { kind: 'cmd', value: command } },
      { kind: 'text', value: slash.argument ? ` ${row.id}` : ' ' },
    ]
    const head = caret.head
    const next =
      (head === null ? null : replaceCommandHead(tokens, head, replacement)) ?? replacement

    field.applyTokens(next)
    setDismissed(true)

    if (node) placeCaretBefore(node, replacement.length)

    node?.focus()
  }

  const pick = (row: SuggestRow | undefined) => {
    if (!row) return
    if (row.kind === 'file' || row.kind === 'folder') insert.insertFileReference(row.id)
    else pickCommand(row)
  }

  /** Клавиши, которые принадлежат открытому списку; true - клавиша его. */
  const handleKey = (event: KeyboardEvent): boolean => {
    if (rows.length === 0) return false

    const bare = !event.metaKey && !event.ctrlKey && !event.shiftKey
    const sends = !isFiles && enterSends(slash.typedInFull, held, listKey)
    const picks =
      (event.key === 'Enter' && bare && !sends) || (event.key === 'Tab' && !event.shiftKey)

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      step(event.key === 'ArrowDown' ? 1 : -1)
    } else if (picks) {
      pick(rows[highlight])
    } else if (event.key === 'Escape') {
      // Список закрыт - этого хватит: Esc не идёт дальше и не останавливает ход.
      event.stopPropagation()
      setDismissed(true)
    } else {
      return false
    }

    event.preventDefault()

    return true
  }

  return {
    /** Текст поля до каретки: «/» с кнопки - только в начале. */
    head: caret.head,
    rows,
    highlight,
    ghost: isActive ? slash.ghost : null,
    isFiles,
    pick,
    hover,
    handleKey,
    sync,
  }
}
