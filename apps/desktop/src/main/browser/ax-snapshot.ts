/**
 * Снимок страницы для модели (ADR 0040): дерево доступности Chrome
 * (`Accessibility.getFullAXTree`) текстом, как у Playwright MCP, - роль, имя, состояние и
 * короткая ссылка на элемент `[ref=e12]`. По ссылке инструменты кликают и печатают: она
 * указывает на узел DOM (backendDOMNodeId) этого снимка. Чистая функция - держит тест.
 */

export type AxValue = { type?: string; value?: unknown }

export type AxNode = {
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

export type AxSnapshot = {
  text: string
  /** Ссылка `e12` → backendDOMNodeId. */
  refs: Map<string, number>
  truncated: boolean
}

/** Обёртки без смысла: их дети встают на их место. */
const WRAPPERS = new Set(['generic', 'none', 'presentation', 'Section', 'group', 'LayoutTable'])

/** Не печатаются вовсе: куски текста внутри строки и переносы. */
const SKIPPED = new Set(['InlineTextBox', 'LineBreak'])

const TEXT = 'StaticText'

/** У этих ролей значение - то, что набрано: его модель должна видеть. */
const VALUE_ROLES = new Set(['textbox', 'searchbox', 'combobox', 'spinbutton', 'slider'])

/** Состояния, которые показываются в квадратных скобках. */
const FLAGS = ['disabled', 'required', 'focused', 'selected', 'modal'] as const

const NAME_MAX = 160
const VALUE_MAX = 200
const URL_MAX = 120
/** Текст детей короче - встаёт в строку родителя: `- paragraph: текст`. */
const INLINE_MAX = 200

export const SNAPSHOT_MAX_CHARS = 40_000

/**
 * Глубже отступ не растёт - узлы ниже не печатаются, снимок помечается обрезанным. Обход
 * рекурсивный, а дерево страницы может быть вложено на тысячи уровней (сгенерированная
 * разметка): без предела стек кончился бы раньше, чем текст.
 */
export const SNAPSHOT_MAX_DEPTH = 60

const clip = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text

const stringOf = (value: AxValue | undefined): string =>
  typeof value?.value === 'string' || typeof value?.value === 'number'
    ? String(value.value).replace(/\s+/g, ' ').trim()
    : ''

const propertyOf = (node: AxNode, name: string): unknown =>
  node.properties?.find((property) => property.name === name)?.value.value

/** Состояния узла: [checked], [expanded], [level=2]… */
const attributesOf = (node: AxNode, role: string): string[] => {
  const attributes: string[] = []
  const checked = propertyOf(node, 'checked')
  const pressed = propertyOf(node, 'pressed')
  const expanded = propertyOf(node, 'expanded')
  const level = propertyOf(node, 'level')
  const url = propertyOf(node, 'url')

  if (checked === 'true' || checked === true) attributes.push('checked')

  if (checked === 'mixed') attributes.push('checked=mixed')

  if (pressed === 'true' || pressed === true) attributes.push('pressed')

  if (expanded === true) attributes.push('expanded')

  if (expanded === false) attributes.push('collapsed')

  if (typeof level === 'number' && role === 'heading') attributes.push(`level=${level}`)

  for (const flag of FLAGS) if (propertyOf(node, flag) === true) attributes.push(flag)

  if (typeof url === 'string' && role === 'link' && url)
    attributes.push(`url=${clip(url, URL_MAX)}`)

  return attributes
}

type Walk = {
  byId: Map<string, AxNode>
  /** Уже разобранные узлы: битое дерево с циклом не уводит обход по кругу. */
  visited: Set<string>
  lines: string[]
  refs: Map<string, number>
  chars: number
  truncated: boolean
  maxChars: number
}

/**
 * Узлы, которые показываются вместо детей узла: сам ребёнок или дети пустой обёртки - по
 * порядку. Без рекурсии: цепочка из тысяч вложенных обёрток не должна съесть стек.
 */
const visibleChildren = (walk: Walk, node: AxNode): AxNode[] => {
  const shown: AxNode[] = []
  const stack = [...(node.childIds ?? [])].reverse()

  for (let id = stack.pop(); id !== undefined; id = stack.pop()) {
    const child = walk.byId.get(id)

    if (!child || walk.visited.has(child.nodeId)) continue

    walk.visited.add(child.nodeId)

    const role = stringOf(child.role)

    if (SKIPPED.has(role)) continue

    if (child.ignored || (WRAPPERS.has(role) && !stringOf(child.name))) {
      stack.push(...[...(child.childIds ?? [])].reverse())
      continue
    }

    shown.push(child)
  }

  return shown
}

/** Подряд идущий текст - одной строкой; текст, повторяющий имя родителя, - не нужен. */
const textRuns = (children: AxNode[], parentName: string): (AxNode | string)[] => {
  const runs: (AxNode | string)[] = []

  for (const child of children) {
    if (stringOf(child.role) !== TEXT) {
      runs.push(child)
      continue
    }

    const text = stringOf(child.name)
    const last = runs.at(-1)

    if (!text) continue

    if (typeof last === 'string') runs[runs.length - 1] = `${last} ${text}`
    else runs.push(text)
  }

  return runs.filter((run) => typeof run !== 'string' || run !== parentName)
}

const push = (walk: Walk, line: string): boolean => {
  if (walk.chars + line.length + 1 > walk.maxChars) {
    walk.truncated = true

    return false
  }

  walk.lines.push(line)
  walk.chars += line.length + 1

  return true
}

const printNode = (walk: Walk, node: AxNode, depth: number): void => {
  if (walk.truncated) return

  if (depth > SNAPSHOT_MAX_DEPTH) {
    walk.truncated = true

    return
  }

  const role = stringOf(node.role) || 'generic'
  const name = stringOf(node.name)
  const runs = textRuns(visibleChildren(walk, node), name)
  const indent = '  '.repeat(depth)
  let line = `${indent}- ${role}`

  if (name) line += ` "${clip(name, NAME_MAX)}"`

  for (const attribute of attributesOf(node, role)) line += ` [${attribute}]`

  if (node.backendDOMNodeId !== undefined) {
    const ref = `e${walk.refs.size + 1}`

    walk.refs.set(ref, node.backendDOMNodeId)
    line += ` [ref=${ref}]`
  }

  const value = VALUE_ROLES.has(role) ? stringOf(node.value) : ''
  const [onlyText] = runs

  if (value) {
    line += `: "${clip(value, VALUE_MAX)}"`
  } else if (runs.length === 1 && typeof onlyText === 'string' && onlyText.length <= INLINE_MAX) {
    push(walk, `${line}: ${onlyText}`)

    return
  }

  if (!push(walk, line)) return

  for (const run of runs) {
    if (walk.truncated) return

    if (typeof run === 'string') {
      if (!push(walk, `${indent}  - text: ${clip(run, VALUE_MAX * 2)}`)) return
    } else {
      printNode(walk, run, depth + 1)
    }
  }
}

/**
 * Дерево доступности - текстом. Корень (документ) не печатается: его имя - заголовок
 * страницы, он и так в шапке ответа. Длиннее предела - обрезается с пометкой.
 */
export const formatAxSnapshot = (
  nodes: readonly AxNode[],
  maxChars = SNAPSHOT_MAX_CHARS,
): AxSnapshot => {
  const byId = new Map(nodes.map((node) => [node.nodeId, node]))
  const root = nodes.find((node) => !node.parentId || !byId.has(node.parentId))
  const walk: Walk = {
    byId,
    visited: new Set(root ? [root.nodeId] : []),
    lines: [],
    refs: new Map(),
    chars: 0,
    truncated: false,
    maxChars,
  }

  if (root) {
    for (const run of textRuns(visibleChildren(walk, root), stringOf(root.name))) {
      if (walk.truncated) break

      if (typeof run === 'string') push(walk, `- text: ${clip(run, VALUE_MAX * 2)}`)
      else printNode(walk, run, 0)
    }
  }

  return { text: walk.lines.join('\n'), refs: walk.refs, truncated: walk.truncated }
}
