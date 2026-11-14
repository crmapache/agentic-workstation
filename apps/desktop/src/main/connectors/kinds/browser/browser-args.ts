import { fileURLToPath } from 'node:url'

import type { Tool } from '@modelcontextprotocol/sdk/types.js'

import {
  parseTabReference,
  formatTabReference,
} from '@agentic-workstation/browser-protocol/tab-reference'

import { ArgumentError } from '../native-tools'
import type { NativeCall } from '../native-tools'
import type { AgentCall, WantedTab } from '../../../browser/browser-agent'
import { REF_PATTERN } from '../../../browser/frame-refs'
import type { Page } from '../../../browser/page'
import type { Target } from '../../../browser/page-nodes'
import { realPathInside } from '../../../browser/project-files'

/** Вызов инструмента → вызов агента браузера: процесс, его разговор, проект и папка работы. */
export const agentCall = (call: NativeCall): AgentCall => ({
  launchId: call.launch?.id ?? null,
  conversationId: call.launch?.conversationId ?? null,
  projectPath: call.launch?.projectPath ?? null,
  workDir: call.launch?.workDir ?? null,
  signal: call.signal,
})

const tabById = (tabId: number): WantedTab => ({
  profileKey: null,
  tabId,
  launch: null,
  title: null,
})

/**
 * Какая вкладка: ссылка `chrome-tab:<профиль>/<id>@<метка>` (с заголовком после неё - тоже),
 * `профиль/id` или просто номер вкладки. Не задана - undefined: текущая вкладка сессии.
 */
export const tabArg = (args: Record<string, unknown>): WantedTab | undefined => {
  const value = args['tab']

  if (value === undefined || value === null || value === '') return undefined

  if (typeof value === 'number' && Number.isInteger(value)) return tabById(value)

  if (typeof value === 'string') {
    if (/^\d+$/.test(value.trim())) return tabById(Number(value.trim()))

    const reference = parseTabReference(value)

    if (reference) return reference
  }

  throw new ArgumentError(
    '"tab" must be a tab reference like chrome-tab:abcd1234/42 (from "tabs", "open" or the user) or a tab id.',
  )
}

/** Ссылка на элемент из снимка: e12, во фрейме - f2e7. */
export function refArg(args: Record<string, unknown>, required: true): string
export function refArg(args: Record<string, unknown>, required?: false): string | undefined
export function refArg(args: Record<string, unknown>, required = false): string | undefined {
  const value = args['ref']

  if (typeof value === 'string' && REF_PATTERN.test(value.trim())) return value.trim()

  if ((value === undefined || value === null || value === '') && !required) return undefined

  throw new ArgumentError(
    '"ref" must be an element ref from the snapshot, like e12 (or f2e7 inside a frame).',
  )
}

/** Точка в CSS-пикселях окна страницы; задана только одна координата - ошибка. */
export const pointArg = (args: Record<string, unknown>): { x: number; y: number } | undefined => {
  const { x, y } = args

  if (x === undefined && y === undefined) return undefined

  if (
    typeof x !== 'number' ||
    typeof y !== 'number' ||
    !Number.isFinite(x) ||
    !Number.isFinite(y)
  ) {
    throw new ArgumentError('"x" and "y" must both be numbers (CSS pixels of the page).')
  }

  return { x: Math.round(x), y: Math.round(y) }
}

/** Куда нажать: элемент (ref) или точка (x, y) - одно из двух обязательно. */
export const targetArg = (args: Record<string, unknown>): Target => {
  const ref = refArg(args)
  const point = pointArg(args)

  if (ref) return { ref }

  if (point) return point

  throw new ArgumentError('Pass "ref" (from the snapshot) or "x" and "y".')
}

/**
 * Адрес для перехода: без схемы - https (модель часто пишет example.com); javascript: и
 * адреса Chrome (chrome://) не открываются - в них агенту нечего делать.
 */
/** Что делать с тем, куда расширение не пускают: Computer Use (ADR 0057), если он есть. */
export const COMPUTER_HINT =
  'To work there, use the computer tools of the Computer Use connector if you have them.'

export const urlArg = (value: unknown): string => {
  if (value === undefined || value === null || value === '') return ''

  if (typeof value !== 'string') throw new ArgumentError('"url" must be a string.')

  const trimmed = value.trim()
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`

  try {
    const url = new URL(withScheme)

    if (!['http:', 'https:', 'about:', 'file:', 'data:'].includes(url.protocol)) {
      throw new ArgumentError(
        `Can't open ${url.protocol} addresses: Chrome keeps extensions out of them. ${COMPUTER_HINT}`,
      )
    }

    return url.href
  } catch (error) {
    if (error instanceof ArgumentError) throw error

    throw new ArgumentError(`"${trimmed}" is not a web address.`)
  }
}

/**
 * Адрес file: - только внутри папки разговора (проект, у сценария - его worktree), по
 * настоящему пути. Распакованное расширение по умолчанию читает file:, и без этой проверки
 * страница уговорила бы модель открыть ~/.ssh или ключи в соседней папке.
 */
export const allowedUrl = async (url: string, workDir: string | null): Promise<string> => {
  if (!url.startsWith('file:')) return url

  const path = fileURLToPath(url)
  const inside = workDir ? await realPathInside(workDir, path) : null

  if (!inside) {
    throw new ArgumentError(
      workDir
        ? `file: addresses open only existing files inside this conversation's project folder (${workDir}); ${path} is not one. Ask the user if they want it opened.`
        : "file: addresses open only inside a conversation's project folder, and this call has none.",
    )
  }

  return url
}

/** Ссылка на вкладку страницы - её модель передаёт дальше в аргументе tab. */
export const referenceOf = (page: Page): string =>
  formatTabReference({
    profileKey: page.tab.profileKey,
    tabId: page.tab.tabId,
    launch: page.tab.launch || null,
  })

/** Аргумент tab в схемах инструментов. */
export const TAB_PROPERTY = {
  tab: {
    type: 'string',
    description:
      'Tab reference (chrome-tab:<profile>/<id>@<launch>) from "tabs", "open" or the user. Default: the tab you used last.',
  },
} as const

export const REF_PROPERTY = {
  ref: {
    type: 'string',
    description: 'Element ref from the latest snapshot, like e12 (f2e7 - inside frame f2).',
  },
} as const

export const POINT_PROPERTIES = {
  x: { type: 'number', description: 'X in CSS pixels of the visible page (instead of ref).' },
  y: { type: 'number', description: 'Y in CSS pixels of the visible page (instead of ref).' },
} as const

export const schema = (
  properties: Record<string, object>,
  required: string[] = [],
): Tool['inputSchema'] => ({ type: 'object', properties, ...(required.length ? { required } : {}) })
