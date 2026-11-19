import type { PreparedFile } from '../../lib/file-match.types'
import { rankFiles, prepareFiles } from '../../lib/file-match.utils'
import { plainText } from './draft.utils'
import { commandChip, argumentQuery } from './slash-capture.utils'
import { MAX_SUGGESTIONS } from './slash.constants'
import {
  slashQuery,
  matchCommands,
  matchArguments,
  requiresArgument,
  commandNameBeforeArgument,
} from './slash.utils'
import type { SlashInput, SlashState, SuggestRow } from './suggestions.types'

/**
 * Подсказка над полем (как в ACC): по «/» в начале - команды, после имени и пробела -
 * значения аргумента (/model, /effort), у остальных команд - серый синтаксис; по «@» под
 * кареткой - файлы проекта.
 */
export const slashState = ({
  head,
  tokens,
  commands,
  argumentSets,
  dismissed,
}: SlashInput): SlashState => {
  const query = head === null ? null : slashQuery(head)
  const commandMatches = query === null || dismissed ? [] : matchCommands(commands, query)
  const chip = commandChip(tokens)
  const argumentText = chip === null ? '' : plainText(tokens.slice(1)).trim()
  const chipOptions = chip === null ? undefined : argumentSets[chip]
  const argument =
    dismissed || commandMatches.length > 0
      ? null
      : chip !== null
        ? chipOptions && !/\s/.test(argumentText)
          ? { command: chip, query: argumentText, options: chipOptions }
          : null
        : head === null
          ? null
          : argumentQuery(head, argumentSets)
  const ghostName =
    dismissed || commandMatches.length > 0 || argument
      ? null
      : chip !== null
        ? argumentText === ''
          ? chip
          : null
        : head === null
          ? null
          : commandNameBeforeArgument(head)

  if (commandMatches.length > 0) {
    return {
      rows: commandMatches.map((entry) => ({
        id: entry.id,
        label: `/${entry.id}`,
        description: entry.hint || entry.argumentHint || undefined,
        group: entry.group,
        kind: 'command',
      })),
      argument: null,
      ghost: null,
      listKey: `/${query ?? ''}`,
      typedInFull:
        query !== null && commands.some((entry) => entry.id === query) && !requiresArgument(query),
    }
  }

  return {
    rows: argument
      ? matchArguments(argument.options, argument.query).map((option) => ({
          id: option.id,
          label: option.id,
          description: option.hint || undefined,
          kind: 'value',
        }))
      : [],
    argument: argument && { command: argument.command, query: argument.query },
    ghost: commands.find((entry) => entry.id === ghostName)?.argumentHint || null,
    listKey: argument ? `${argument.command}\u0000${argument.query}` : '',
    typedInFull: argument ? argument.options.some((option) => option.id === argument.query) : false,
  }
}

/**
 * Файлы и папки проекта для «@»: папки выводятся из путей файлов и кончаются «/» - CLI
 * понимает упоминание папки как её список.
 */
export const prepareMentionTargets = (paths: readonly string[]): PreparedFile[] => {
  const folders = new Set<string>()

  for (const path of paths) {
    for (let slash = path.indexOf('/'); slash > 0; slash = path.indexOf('/', slash + 1)) {
      folders.add(path.slice(0, slash))
    }
  }

  return [
    ...prepareFiles(paths),
    ...prepareFiles([...folders]).map((folder) => ({ ...folder, path: `${folder.path}/` })),
  ]
}

/** Файлы под «@запрос» - тем же нечётким поиском, что в «Поиске везде». Пусто - ничего. */
export const fileRows = (targets: readonly PreparedFile[], query: string): SuggestRow[] =>
  query
    ? rankFiles(targets, query, MAX_SUGGESTIONS).map(({ file, match }) => ({
        id: file.path,
        label: file.name,
        description: file.folder || undefined,
        highlight: match.ranges,
        kind: file.path.endsWith('/') ? 'folder' : 'file',
      }))
    : []
