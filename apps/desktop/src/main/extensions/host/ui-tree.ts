import { z } from 'zod'

import type { UiNode } from '@shared/extension-ui'
import { UI_LIMITS } from '@shared/extension-ui'

import { HostArgError } from './host-args'

const words = z.string().max(UI_LIMITS.text)
const label = z.string().min(1).max(200)
const name = z.string().regex(/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/)
const icon = z.string().regex(/^[A-Z][A-Za-z0-9]{0,40}$/)
const tone = z.enum(['default', 'muted', 'accent', 'success', 'warning', 'danger', 'info'])
const gap = z.enum(['sm', 'md', 'lg'])
const option = z.object({ value: z.string().max(200), label, description: words.optional() })

const node: z.ZodType<UiNode> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.object({ type: z.literal('stack'), gap: gap.optional(), children: z.array(node) }),
    z.object({
      type: z.literal('row'),
      gap: gap.optional(),
      align: z.enum(['start', 'center', 'end', 'between']).optional(),
      wrap: z.boolean().optional(),
      children: z.array(node),
    }),
    z.object({
      type: z.literal('section'),
      title: label,
      description: words.optional(),
      actions: z.array(node).optional(),
      children: z.array(node),
    }),
    z.object({
      type: z.literal('card'),
      title: label.optional(),
      description: words.optional(),
      tone: z.enum(['neutral', 'accent']).optional(),
      actions: z.array(node).optional(),
      children: z.array(node),
    }),
    z.object({
      type: z.literal('text'),
      text: words,
      tone: tone.optional(),
      size: z.enum(['sm', 'md']).optional(),
      mono: z.boolean().optional(),
      strong: z.boolean().optional(),
    }),
    z.object({ type: z.literal('markdown'), text: words }),
    z.object({ type: z.literal('code'), text: words }),
    z.object({ type: z.literal('badge'), text: label, tone: tone.optional() }),
    z.object({
      type: z.literal('button'),
      label,
      action: name,
      variant: z.enum(['primary', 'secondary', 'ghost', 'danger']).optional(),
      icon: icon.optional(),
      disabled: z.boolean().optional(),
    }),
    z.object({
      type: z.literal('textField'),
      name,
      label,
      value: words.optional(),
      placeholder: label.optional(),
    }),
    z.object({
      type: z.literal('textArea'),
      name,
      label,
      value: words.optional(),
      placeholder: label.optional(),
    }),
    z.object({
      type: z.literal('select'),
      name,
      label,
      value: z.string().max(200).optional(),
      options: z.array(option).max(200),
    }),
    z.object({
      type: z.literal('switch'),
      name,
      label,
      description: words.optional(),
      checked: z.boolean().optional(),
    }),
    z.object({
      type: z.literal('list'),
      items: z
        .array(
          z.object({
            id: z.string().min(1).max(200),
            title: label,
            description: words.optional(),
            icon: icon.optional(),
            badge: z.object({ text: label, tone: tone.optional() }).optional(),
            action: name.optional(),
          }),
        )
        .max(500),
    }),
    z.object({
      type: z.literal('keyValue'),
      items: z.array(z.object({ label, value: words })).max(200),
    }),
    z.object({
      type: z.literal('progress'),
      value: z.number().min(0).max(1).optional(),
      label: label.optional(),
    }),
    z.object({
      type: z.literal('empty'),
      title: label,
      description: words.optional(),
      icon: icon.optional(),
    }),
    z.object({
      type: z.literal('chart'),
      title: label,
      layout: z.enum(['grouped', 'stacked']).optional(),
      series: z
        .array(z.object({ key: name, label }))
        .min(1)
        .max(4),
      points: z
        .array(
          z.object({
            key: z.string().min(1).max(100),
            label,
            values: z.array(z.number().finite()),
          }),
        )
        .max(400),
    }),
    z.object({ type: z.literal('divider') }),
  ]),
)

/** Сколько узлов и какой глубины дерево: потолок - UI_LIMITS. */
const measure = (tree: UiNode, depth = 1): number => {
  if (depth > UI_LIMITS.depth)
    throw new HostArgError(`The view is deeper than ${UI_LIMITS.depth} levels.`)

  const nested = [
    ...('children' in tree ? tree.children : []),
    ...('actions' in tree && tree.actions ? tree.actions : []),
  ]

  return nested.reduce((sum, child) => sum + measure(child, depth + 1), 1)
}

/**
 * Дерево вида от расширения - проверенное: только известные узлы и поля, с пределами длины,
 * глубины и числа узлов. Ошибка - текстом для автора расширения.
 */
export const parseUiTree = (value: unknown): UiNode | null => {
  if (value === null) return null

  const parsed = node.safeParse(value)

  if (!parsed.success) {
    const issue = parsed.error.issues[0]

    throw new HostArgError(
      `View tree: ${issue?.path.join('.') || 'root'} - ${issue?.message ?? 'invalid'}`,
    )
  }

  if (measure(parsed.data) > UI_LIMITS.nodes) {
    throw new HostArgError(`The view has more than ${UI_LIMITS.nodes} nodes.`)
  }

  return parsed.data
}

/** Какие токены тема расширения может переопределить: цвета, палитру и шрифты. */
const THEME_TOKEN = /^--(?:color|palette|font-family)-[a-z0-9-]{1,60}$/

/** Значение токена: без выхода из объявления и без загрузки извне. */
const isSafeValue = (value: string) =>
  value.length > 0 &&
  value.length <= 200 &&
  !/[;{}<>\\]/.test(value) &&
  !/url\s*\(|@import|expression\s*\(/i.test(value)

/** Тема от расширения: проверенные пары токен - значение, не больше 300. */
export const parseTheme = (value: unknown): Record<string, string> | null => {
  if (value === null || value === undefined) return null
  if (typeof value !== 'object' || Array.isArray(value))
    throw new HostArgError('Theme must be an object of tokens.')

  const entries = Object.entries(value as Record<string, unknown>)

  if (entries.length > 300) throw new HostArgError('A theme may set up to 300 tokens.')

  for (const [token, tokenValue] of entries) {
    if (!THEME_TOKEN.test(token)) {
      throw new HostArgError(
        `Theme token "${token}" is not allowed: use --color-*, --palette-* or --font-family-*.`,
      )
    }

    if (typeof tokenValue !== 'string' || !isSafeValue(tokenValue)) {
      throw new HostArgError(`Theme value for "${token}" is not allowed.`)
    }
  }

  return Object.fromEntries(entries as [string, string][])
}
