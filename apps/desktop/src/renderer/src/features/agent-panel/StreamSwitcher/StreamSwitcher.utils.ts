import type { ToolFeedItem } from '@shared/conversation-feed'

import type { ShellTask } from './StreamSwitcher.types'

/**
 * Команда двумя словами для чипа: `pnpm dev`, `sandbox.sh`. Описание модели - целое
 * предложение, на узкой панели оно вытолкнуло бы остальные чипы.
 */
export const commandLabel = (command: string): string => {
  const words = (command.split('\n')[0] ?? '').trim().split(/\s+/).filter(Boolean)
  const [first = '', second = ''] = words
  const name = first.split('/').pop() ?? first

  return second && !second.startsWith('-') ? `${name} ${second}` : name
}

/** Что за фоновой задачей процесса - по виду её вызова: команда оболочки или адрес сокета. */
export const shellTaskOf = ({ action, task }: ToolFeedItem): ShellTask => {
  const kind = task?.kind === 'monitor' ? 'monitor' : 'command'

  if (action.kind === 'command') {
    return { kind, command: action.command, url: '', description: action.description }
  }

  if (action.kind === 'monitor') {
    return { kind, command: action.command, url: action.url, description: action.description }
  }

  return { kind, command: '', url: '', description: '' }
}

/**
 * Подпись на чипе: у команды - она двумя словами, у наблюдателя - описание модели. Его команда
 * обычно `tail -F … | grep`, и двумя словами это просто «tail».
 */
export const shellLabel = (shell: ShellTask): string =>
  shell.kind === 'monitor'
    ? shell.description || commandLabel(shell.command) || shell.url
    : commandLabel(shell.command) || shell.description

/**
 * Сколько осталось до будильника - грубо и вверх: «45s», «14m», «1h 05m». Секунды нужны
 * только в последнюю минуту; прошедший срок - ноль (CLI вот-вот начнёт ход).
 */
export const formatCountdown = (ms: number): string => {
  const seconds = Math.max(0, Math.ceil(ms / 1000))

  if (seconds < 60) return `${seconds}s`

  const minutes = Math.ceil(seconds / 60)

  return minutes < 60
    ? `${minutes}m`
    : `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`
}

/** Шаг цепочки кончился: `&&` и `||` остаются в конце строки, `;` уходит в перевод строки. */
const STEP_JOINERS = ['&&', '||'] as const

/** Начало слова - тут `#` открывает комментарий, а не стоит внутри слова (`a#b`, `$#`). */
const isWordStart = (text: string, index: number) => index === 0 || /\s/.test(text[index - 1] ?? '')

/**
 * Команда по шагам - строкой на шаг: цепочка через `&&`, `||` и `;` в одну строку читается с
 * трудом. Режется только вне кавычек, скобок и подстановок; `&&` и `||` остаются в конце
 * строки (так оболочка и продолжает команду), `;` становится переводом строки - для оболочки
 * то же самое, поэтому скопированное работает как исходное. Хвост-комментарий не режется: его
 * `;` - часть комментария. Свои переводы строк, heredoc и непарные кавычки - как есть.
 */
export const commandSteps = (command: string): string => {
  const text = command.trim()

  if (text.includes('\n') || text.includes('<<')) return text

  const steps: string[] = []
  let current = ''
  let quote: string | null = null
  let depth = 0

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] ?? ''
    const pair = text.slice(index, index + 2)

    if (quote) {
      // В одинарных кавычках обратная косая - просто буква.
      if (char === '\\' && quote !== "'") {
        current += pair
        index += 1
      } else {
        current += char
        if (char === quote) quote = null
      }
    } else if (char === '\\') {
      current += pair
      index += 1
    } else if (char === '"' || char === "'" || char === '`') {
      quote = char
      current += char
    } else if (char === '#' && isWordStart(text, index)) {
      current += text.slice(index)
      break
    } else if (char === '(' || char === '{') {
      depth += 1
      current += char
    } else if ((char === ')' || char === '}') && depth > 0) {
      depth -= 1
      current += char
    } else if (depth > 0) {
      current += char
    } else if (pair === ';;') {
      // Конец ветки case - не шаг цепочки.
      current += pair
      index += 1
    } else if (STEP_JOINERS.some((joiner) => joiner === pair)) {
      steps.push(`${current.trim()} ${pair}`)
      current = ''
      index += 1
    } else if (char === ';') {
      steps.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }

  if (quote || depth !== 0) return text

  return [...steps, current.trim()].filter(Boolean).join('\n')
}
