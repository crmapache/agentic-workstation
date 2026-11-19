import type { DraftToken } from '@shared/message-draft'

import { asideQuestion } from './aside.utils'
import { PANEL_COMMANDS } from './slash.constants'
import type { CommandEntry, LocalCommand, CommandOption } from './slash.types'

/**
 * Команда в черновике: когда набранное имя становится чипом, что заменяется выбором из
 * подсказки и какие команды выполняет панель, а не CLI (как в ACC).
 */

/**
 * Отрезать от начала кусков столько символов текста. Вложение в отрезаемом - значит,
 * это не голова из текста, ничего не трогаем.
 */
const withoutTextHead = (tokens: readonly DraftToken[], length: number): DraftToken[] | null => {
  const rest: DraftToken[] = []
  let left = length

  for (const token of tokens) {
    if (left === 0) {
      rest.push(token)
      continue
    }

    if (token.kind !== 'text') return null

    if (token.value.length <= left) {
      left -= token.value.length
      continue
    }

    rest.push({ kind: 'text', value: token.value.slice(left) })
    left = 0
  }

  return left === 0 ? rest : null
}

const withoutLeadingSpace = (tokens: readonly DraftToken[]): DraftToken[] => {
  const [first, ...rest] = tokens

  if (first?.kind !== 'text' || !first.value.startsWith(' ')) return [...tokens]

  const value = first.value.slice(1)

  return value ? [{ kind: 'text', value }, ...rest] : rest
}

/**
 * Готовые куски вместо набираемой команды; всё, что после каретки, остаётся: команду
 * можно поставить перед уже написанным сообщением. head - текст поля до каретки.
 */
export const replaceCommandHead = (
  tokens: readonly DraftToken[],
  head: string,
  replacement: readonly DraftToken[],
): DraftToken[] | null => {
  const rest = withoutTextHead(tokens, head.length)

  if (rest === null) return null

  const last = replacement.at(-1)
  const spaced = last?.kind === 'text' && last.value.endsWith(' ')

  return [...replacement, ...(spaced ? withoutLeadingSpace(rest) : rest)]
}

const commandChipOf = (name: string): DraftToken => ({
  kind: 'chip',
  chip: { kind: 'cmd', value: name },
})

/**
 * Набранная команда становится чипом в момент, когда после знакомого имени поставили
 * пробел. Незнакомое имя - не трогаем: чип обещает, что команда существует.
 */
export const captureCommand = (
  tokens: readonly DraftToken[],
  commands: readonly CommandEntry[],
  head: string | null,
): DraftToken[] | null => {
  const name = head === null ? undefined : /^\/(\S+) $/.exec(head)?.[1]

  if (!name || head === null || !commands.some((command) => command.id === name)) return null

  return replaceCommandHead(tokens, head, [commandChipOf(name), { kind: 'text', value: ' ' }])
}

/**
 * Команда в начале, пришедшая целиком (вставка, Enter сразу после имени), - тоже чип:
 * та же команда не должна выглядеть по-разному от того, как её написали.
 */
export const captureWrittenCommand = (
  tokens: readonly DraftToken[],
  commands: readonly CommandEntry[],
): DraftToken[] | null => {
  const first = tokens[0]

  if (first?.kind !== 'text') return null

  const name = /^\/(\S+)/.exec(first.value)?.[1]

  if (!name || !commands.some((command) => command.id === name)) return null

  const head = `/${name}`
  const replacement =
    first.value.length > head.length
      ? [commandChipOf(name)]
      : [commandChipOf(name), { kind: 'text' as const, value: ' ' }]

  return replaceCommandHead(tokens, head, replacement)
}

/** Команда, уже ставшая чипом: она всегда первая. */
export const commandChip = (tokens: readonly DraftToken[]): string | null => {
  const first = tokens[0]

  return first?.kind === 'chip' && first.chip.kind === 'cmd' ? first.chip.value : null
}

/** Имя набрано, за ним пробел и значение - второй шаг подсказки, если значения считанные. */
export const argumentQuery = (
  head: string,
  argumentSets: Readonly<Record<string, readonly CommandOption[]>>,
): { command: string; query: string; options: readonly CommandOption[] } | null => {
  const match = /^\/([a-z-]+) ([^\s]*)$/.exec(head)
  const command = match?.[1] ?? ''
  const options = argumentSets[command]

  return match && options ? { command, query: match[2] ?? '', options } : null
}

/**
 * Команда, которую выполняет панель. Команды панели - всегда (кроме `/config ключ=значение`
 * - это CLI сделает сам); /model и /effort - со знакомым значением: выбор живёт в
 * панели, а ход ради него стоил бы обмена с моделью. Незнакомое значение - CLI.
 */
export const localCommand = (
  text: string,
  panel: ReadonlySet<string>,
  argumentSets: Readonly<Record<string, readonly CommandOption[]>>,
): LocalCommand | null => {
  const trimmed = text.trim()

  if (!trimmed.startsWith('/')) return null

  const [name = '', ...rest] = trimmed.slice(1).split(/\s+/)
  // Вопрос сбоку - проза: переводы строк в нём остаются.
  const argument = name === 'btw' ? (asideQuestion(trimmed) ?? '') : rest.join(' ')

  if (name === 'config' && argument) return null
  if (panel.has(name) && PANEL_COMMANDS.some((id) => id === name)) return { name, argument }

  return argumentSets[name]?.some((option) => option.id === argument) ? { name, argument } : null
}
