import type { AxTreeResult } from '@agentic-workstation/browser-protocol/protocol'

/**
 * Дерево доступности для IDE (ADR 0040). Accessibility.getFullAXTree длинной страницы - десятки
 * мегабайт: каждый кусок строки текста - свой узел InlineTextBox, у каждого имени - список
 * источников, у каждого узла - роль Chrome и причины, почему он скрыт. IDE из этого нужна
 * роль, имя, значение, состояния и связь с DOM, а снимок для модели всё равно режется на
 * 40 тысячах знаков. Поэтому дерево прореживается здесь, до native messaging (предел Chrome -
 * 64 МБ на сообщение), и обрезается по объёму, а не падает.
 */

/** Сколько знаков JSON узлов отдавать: снимку для модели хватает с большим запасом. */
export const AX_TREE_MAX_CHARS = 8 * 1024 * 1024

type AxValue = { type?: string; value?: unknown }

type RawNode = {
  nodeId: string
  ignored?: boolean
  role?: AxValue
  name?: AxValue
  value?: AxValue
  properties?: { name: string; value: AxValue }[]
  parentId?: string
  childIds?: string[]
  backendDOMNodeId?: number
}

/** Куски строки текста: IDE их не печатает, а на длинной странице это большая часть узлов. */
const DROPPED_ROLES = new Set(['InlineTextBox'])

const slimValue = (value: AxValue): AxValue => ({
  ...(value.type ? { type: value.type } : {}),
  value: value.value,
})

/** Узел без источников имени, роли Chrome и причин скрытости; скрытый - только связи. */
const slimNode = (node: RawNode, childIds: string[]): RawNode => {
  const links = {
    nodeId: node.nodeId,
    ...(node.parentId ? { parentId: node.parentId } : {}),
    ...(childIds.length ? { childIds } : {}),
    ...(node.backendDOMNodeId !== undefined ? { backendDOMNodeId: node.backendDOMNodeId } : {}),
  }

  if (node.ignored) return { ...links, ignored: true }

  return {
    ...links,
    ...(node.role ? { role: slimValue(node.role) } : {}),
    ...(node.name ? { name: slimValue(node.name) } : {}),
    ...(node.value ? { value: slimValue(node.value) } : {}),
    ...(node.properties?.length
      ? {
          properties: node.properties.map((property) => ({
            name: property.name,
            value: slimValue(property.value),
          })),
        }
      : {}),
  }
}

const roleOf = (node: RawNode | undefined): string =>
  typeof node?.role?.value === 'string' ? node.role.value : ''

/**
 * Прореженное дерево в порядке обхода сверху вниз (как его читает снимок IDE) - до предела
 * объёма; не влезло - truncated. Без рекурсии: вложенность страницы может быть любой.
 */
export const pruneAxTree = (
  nodes: readonly unknown[],
  maxChars = AX_TREE_MAX_CHARS,
): AxTreeResult => {
  const raw = nodes.filter(
    (node): node is RawNode =>
      typeof node === 'object' && node !== null && typeof (node as RawNode).nodeId === 'string',
  )
  const byId = new Map(raw.map((node) => [node.nodeId, node]))
  const roots = raw.filter((node) => !node.parentId || !byId.has(node.parentId))
  const kept: RawNode[] = []
  const seen = new Set<string>()
  const stack = [...roots].reverse()
  let chars = 0

  for (let node = stack.pop(); node; node = stack.pop()) {
    if (seen.has(node.nodeId)) continue

    seen.add(node.nodeId)

    const children = (node.childIds ?? []).filter(
      (id) => byId.has(id) && !DROPPED_ROLES.has(roleOf(byId.get(id))),
    )
    const slim = slimNode(node, children)
    const size = JSON.stringify(slim).length + 1

    if (chars + size > maxChars) return { nodes: kept, truncated: true }

    kept.push(slim)
    chars += size

    for (const id of [...children].reverse()) {
      const child = byId.get(id)

      if (child) stack.push(child)
    }
  }

  return { nodes: kept, truncated: false }
}
