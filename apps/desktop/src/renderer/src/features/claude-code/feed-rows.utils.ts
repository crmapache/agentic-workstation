import type { FeedItem, ToolAction, ToolFeedItem, ThinkingFeedItem } from '@shared/claude-feed'

import type { FeedRow, ToolKind } from './claude.types'

/**
 * Как вызов встаёт в ленту: в группе, своей карточкой или не встаёт вовсе. Служебный
 * (список задач рисуется панелью над полем) - не встаёт. Правка стоит своей карточкой с
 * открытым диффом: неверную правку надо заметить, не собираясь её искать (ACC). Новый файл -
 * не «что изменилось», он идёт в группе с подписью «· N lines». Субагент и workflow - своя
 * карточка со своим журналом.
 */
export const toolKind = (action: ToolAction): ToolKind => {
  switch (action.kind) {
    case 'todo':
      return 'hidden'
    case 'edit':
    case 'agent':
    case 'plan':
    case 'question':
      return action.kind
    default:
      return 'plain'
  }
}

/** Вызов ждёт ответа человека или уже ответил: вопрос, на который ещё не ответили, - над полем. */
const isAnswered = (tool: ToolFeedItem) => tool.status !== 'running'

/**
 * Лента для отрисовки, как в ACC. Подряд идущие вызовы складываются в одну группу, а
 * мысли между ними - в одну карточку THINK, стоящую там, где была первая мысль: «пачка»
 * работы читается двумя строками, а не простынёй. Текст ответа, сообщение, правка,
 * субагент, план разрывают пачку. Скрытые мысли (без текста) не рисуются - о них
 * говорит строка статуса. То, что делал субагент, лежит в его карточке.
 */
export const buildFeedRows = (items: readonly FeedItem[]): FeedRow[] => {
  const ids = new Set(items.map((item) => item.id))
  const children = new Map<string, FeedItem[]>()
  const rows: FeedRow[] = []
  let tools: ToolFeedItem[] | null = null
  let thoughts: ThinkingFeedItem[] | null = null

  const breakBurst = () => {
    tools = null
    thoughts = null
  }

  for (const item of items) {
    if (item.parentToolUseId && ids.has(item.parentToolUseId)) {
      children.set(item.parentToolUseId, [...(children.get(item.parentToolUseId) ?? []), item])
    }
  }

  for (const item of items) {
    if (item.parentToolUseId && ids.has(item.parentToolUseId)) continue

    if (item.kind === 'thinking') {
      if (!item.text.trim()) continue

      if (thoughts) thoughts.push(item)
      else {
        thoughts = [item]
        rows.push({ kind: 'think', id: `think:${item.id}`, items: thoughts })
      }

      continue
    }

    if (item.kind === 'tool') {
      const kind = toolKind(item.action)

      if (kind === 'hidden') continue

      if (kind === 'plain') {
        if (tools) tools.push(item)
        else {
          tools = [item]
          rows.push({ kind: 'tools', id: `group:${item.id}`, items: tools })
        }

        continue
      }

      breakBurst()

      if (kind === 'agent') {
        rows.push({ kind, id: item.id, item, children: children.get(item.id) ?? [] })
      } else if (kind !== 'question' || isAnswered(item)) {
        rows.push({ kind, id: item.id, item })
      }

      continue
    }

    breakBurst()
    rows.push({ kind: item.kind, id: item.id, item } as FeedRow)
  }

  return rows
}

const sameItems = (left: readonly FeedItem[], right: readonly FeedItem[]) =>
  left.length === right.length && left.every((item, index) => item === right[index])

/**
 * Та же ли строка для отрисовки. Строки собираются заново на каждый патч, но элементы
 * ленты, которых патч не тронул, остаются теми же объектами (applyFeedPatch): по ним и
 * видно, что перерисовывать строку незачем.
 */
export const sameRow = (left: FeedRow, right: FeedRow): boolean => {
  if (left.kind !== right.kind || left.id !== right.id) return false
  if (left.kind === 'tools' && right.kind === 'tools') return sameItems(left.items, right.items)
  if (left.kind === 'think' && right.kind === 'think') return sameItems(left.items, right.items)
  if (left.kind === 'agent' && right.kind === 'agent') {
    return left.item === right.item && sameItems(left.children, right.children)
  }

  return 'item' in left && 'item' in right && left.item === right.item
}
