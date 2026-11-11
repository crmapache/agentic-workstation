import type { TFunction } from 'i18next'

import type { ClaudeState } from '@shared/claude'
import type { FeedItem, FeedPatch, ToolInput, ConversationFeed } from '@shared/claude-feed'
import type { ToolsFailure } from '@shared/claude-tools'
import { MINUTE_MS, SECOND_MS } from '@shared/time-units'

import { splitPath } from '../../lib/path.utils'
import {
  CONTEXT_CALM_SHARE,
  TOOLS_FAILURE_KEYS,
  CONTEXT_DANGER_SHARE,
  CONTEXT_WARNING_SHARE,
} from './claude.constants'

/**
 * Патч главного процесса поверх ленты из кэша: убранные откатом уходят, новые элементы
 * встают в конец, тронутые - на своё место. Список задач приходит целиком, когда
 * поменялся.
 */
export const applyFeedPatch = (feed: ConversationFeed, patch: FeedPatch): ConversationFeed => {
  const removed = new Set(patch.removes ?? [])
  const items: FeedItem[] = feed.items.filter((item) => !removed.has(item.id))
  const positions = new Map(items.map((item, index) => [item.id, index]))

  for (const item of patch.upserts) {
    const position = positions.get(item.id)

    if (position === undefined) {
      positions.set(item.id, items.length)
      items.push(item)
    } else {
      items[position] = item
    }
  }

  return {
    ...feed,
    items,
    tasks: patch.tasks ?? feed.tasks,
    hasEarlier: patch.hasEarlier ?? feed.hasEarlier,
  }
}

/**
 * Длительность для людей, как в ACC: «0.4s», «12s», «3m 05s», «1h 02m 05s». Секунды
 * остаются и после часа: по ним видно, что время идёт, а не стоит. Отрицательное
 * (концы с разных часов) - ноль, а не минус.
 */
export const formatDuration = (ms: number): string => {
  const value = Math.max(0, ms)

  if (value < 10 * SECOND_MS) return `${(value / SECOND_MS).toFixed(1)}s`
  // 59.6 s - уже минута: «60s» читается как недосчитанная минута.
  if (Math.round(value / SECOND_MS) < MINUTE_MS / SECOND_MS)
    return `${Math.round(value / SECOND_MS)}s`

  const pad = (part: number) => String(part).padStart(2, '0')
  // Округление секунд переносится в минуты само: иначе 59.6 s дали бы «5m 60s».
  const total = Math.round(value / SECOND_MS)
  const minutes = Math.floor(total / 60)

  if (minutes < 60) return `${minutes}m ${pad(total % 60)}s`

  return `${Math.floor(minutes / 60)}h ${pad(minutes % 60)}m ${pad(total % 60)}s`
}

/** Число токенов коротко: «950», «12.4k», «1.2M». */
export const formatTokens = (tokens: number): string => {
  if (tokens < 1000) return String(tokens)
  if (tokens < 1_000_000) return `${(tokens / 1000).toFixed(tokens < 10_000 ? 1 : 0)}k`

  return `${(tokens / 1_000_000).toFixed(1)}M`
}

/**
 * Ступень шкалы контекста: зелёная, жёлтая, оранжевая, красная. Ступень, а не цвет:
 * красит её роль --color-gauge-*, которую приглушает режим спокойных цветов.
 */
export const contextTone = (share: number): 'success' | 'warning' | 'high' | 'danger' => {
  if (share >= CONTEXT_DANGER_SHARE) return 'danger'
  if (share >= CONTEXT_WARNING_SHARE) return 'high'
  if (share >= CONTEXT_CALM_SHARE) return 'warning'

  return 'success'
}

/** Путь от корня проекта, если файл внутри него; иначе как есть. */
export const relativePath = (path: string, rootPath: string | undefined): string => {
  if (!rootPath) return path

  const root = rootPath.endsWith('/') ? rootPath : `${rootPath}/`

  return path.startsWith(root) ? path.slice(root.length) : path
}

/** Последняя часть пути - имя файла. */
export const baseName = (path: string): string => splitPath(path).name

/** Строковое поле входа вызова; нет или не строка - пустая строка. */
export const inputText = (input: ToolInput, key: string): string => {
  const value = input[key]

  return typeof value === 'string' ? value : ''
}

const relativeTime = new Intl.RelativeTimeFormat('en', { numeric: 'auto', style: 'short' })

/** Когда это было, по-человечески: «5 min. ago», «yesterday», «3 days ago». */
export const formatAgo = (timestamp: number, now: number): string => {
  const seconds = Math.round((timestamp - now) / SECOND_MS)
  const minutes = Math.round(seconds / 60)
  const hours = Math.round(minutes / 60)
  const days = Math.round(hours / 24)

  if (Math.abs(seconds) < 60) return relativeTime.format(seconds, 'second')
  if (Math.abs(minutes) < 60) return relativeTime.format(minutes, 'minute')
  if (Math.abs(hours) < 24) return relativeTime.format(hours, 'hour')
  if (Math.abs(days) < 30) return relativeTime.format(days, 'day')

  return new Date(timestamp).toLocaleDateString('en', { month: 'short', day: 'numeric' })
}

/** Было ли это сегодня - для деления истории на «сегодня» и «раньше». */
export const isToday = (timestamp: number, now: number): boolean =>
  new Date(timestamp).toDateString() === new Date(now).toDateString()

/** Папки проектов, где разговор только что закончил ход: был занят, стал свободен. */
export const finishedTurnProjects = (
  previous: ClaudeState | undefined,
  next: ClaudeState,
): string[] => {
  const wasBusy = new Set(
    previous?.conversations.filter((item) => item.status !== 'idle').map((item) => item.id),
  )

  return [
    ...new Set(
      next.conversations
        .filter((item) => item.status === 'idle' && wasBusy.has(item.id))
        .map((item) => item.projectPath),
    ),
  ]
}

/**
 * Патч, после которого файлы на диске могли поменяться: строки файлов в итоге хода
 * (откат и возврат), отрезанное откатом разговора, отработавшая команда «!».
 */
export const touchesFiles = (patch: FeedPatch): boolean =>
  (patch.removes?.length ?? 0) > 0 ||
  patch.upserts.some(
    (item) => item.kind === 'turn' || (item.kind === 'shell' && item.status !== 'running'),
  )

/** Отказ экрана инструментов: причина словами, ниже - что сказал CLI. */
export const toolsFailureText = (t: TFunction, failure: ToolsFailure, detail: string): string =>
  detail ? `${t(TOOLS_FAILURE_KEYS[failure])}\n${detail}` : t(TOOLS_FAILURE_KEYS[failure])
