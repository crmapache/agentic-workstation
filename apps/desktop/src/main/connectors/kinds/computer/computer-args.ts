import { basename } from 'node:path'

import type { ComputerActionKind } from '@shared/computer'
import type { Tool } from '@modelcontextprotocol/sdk/types.js'

import { numberArg, ArgumentError } from '../native-tools'
import type { NativeCall } from '../native-tools'
import type { DeskCall, DeskStep } from '../../../computer/computer-desk'
import { parseChord, KeyNameError } from '../../../computer/computer-keys'
import type { KeyChord } from '../../../computer/computer-keys'

/**
 * Вызов инструмента → вызов стола: ключ - разговор (без него - процесс), подпись для отказа
 * «занято» - проект разговора, шаг - строке капсулы.
 */
export const deskCall = (call: NativeCall, step: DeskStep): DeskCall => ({
  key: call.launch?.conversationId ?? call.launch?.id ?? 'no-launch',
  label: call.launch?.projectPath ? basename(call.launch.projectPath) : 'Agentic Workstation',
  step,
  signal: call.signal,
})

/** Слова модели о шаге не длиннее этого: строка капсулы одна. */
const INTENT_MAX = 120

/**
 * Шаг для строки капсулы: слова модели о нём (intent), а без них - само действие, которое окно
 * назовёт своими словами; detail - клавиши, приложение, направление. Набираемый текст в detail
 * не идёт: им бывает пароль, а капсулу видно на экране.
 */
export const stepOf = (
  args: Record<string, unknown>,
  action: ComputerActionKind,
  detail = '',
): DeskStep => {
  const intent =
    typeof args['intent'] === 'string' ? args['intent'].replace(/\s+/g, ' ').trim() : ''

  return intent
    ? { kind: 'intent', text: intent.slice(0, INTENT_MAX) }
    : { kind: 'action', action, detail }
}

/** Пиксель снимка - точка в его пределах (шире не бывает: снимок не больше 1568). */
const COORDINATE = { min: 0, max: 10_000, fallback: Number.NaN }

/** Точка снимка из аргументов: обе координаты обязательны. */
export const pointArg = (args: Record<string, unknown>, x = 'x', y = 'y') => {
  const point = { x: numberArg(args, x, COORDINATE), y: numberArg(args, y, COORDINATE) }

  if (Number.isNaN(point.x) || Number.isNaN(point.y)) {
    throw new ArgumentError(`"${x}" and "${y}" are required: pixels of your latest screenshot`)
  }

  return point
}

/**
 * Текст для набора как есть: пробел, перевод строки и табуляция - тоже текст (stringArg их
 * отбросил бы как пустоту). Пустой - ошибка.
 */
export const textArg = (args: Record<string, unknown>): string => {
  const value = args['text']

  if (typeof value !== 'string' || value === '') {
    throw new ArgumentError('"text" is required: the characters to type')
  }

  return value
}

/** Сочетание клавиш: пусто - null, неизвестное имя - понятная модели ошибка. */
export const chordArg = (value: string | undefined): KeyChord | null => {
  if (!value?.trim()) return null

  try {
    return parseChord(value)
  } catch (error) {
    if (error instanceof KeyNameError) throw new ArgumentError(error.message)

    throw error
  }
}

/** Один из вариантов; нет - значение по умолчанию. */
export const oneOfArg = <T extends string>(
  args: Record<string, unknown>,
  key: string,
  options: readonly T[],
  fallback: T,
): T => {
  const value = args[key]

  if (value === undefined || value === null || value === '') return fallback

  if (typeof value === 'string' && (options as readonly string[]).includes(value)) return value as T

  throw new ArgumentError(`"${key}" must be one of: ${options.join(', ')}`)
}

export const POINT_PROPERTIES = {
  x: { type: 'number', description: 'X in pixels of your latest screenshot.' },
  y: { type: 'number', description: 'Y in pixels of your latest screenshot.' },
} as const

/**
 * Поле каждого инструмента: зачем шаг, словами для человека. Он видит их в капсуле внизу экрана,
 * пока рука действует, - иначе там только «Clicking», а что и зачем, неясно.
 */
const INTENT_PROPERTY = {
  type: 'string',
  description:
    'What this step is for, a few words in the language of the conversation, like "Opening the File menu". The user sees it on screen while you work.',
}

/** Схема входа инструмента; у каждого есть необязательное intent - строка капсулы. */
export const schema = (
  properties: Record<string, object>,
  required: string[] = [],
): Tool['inputSchema'] => ({
  type: 'object',
  properties: { ...properties, intent: INTENT_PROPERTY },
  ...(required.length ? { required } : {}),
})
