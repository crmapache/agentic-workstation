/**
 * Снимок страницы для модели (ADR 0040): дерево доступности Chrome
 * (`Accessibility.getFullAXTree`) текстом, как у Playwright MCP, - роль, имя, состояние и
 * короткая ссылка на элемент `[ref=e12]`. По ссылке инструменты кликают и печатают: она
 * указывает на узел DOM (backendDOMNodeId) этого снимка. Дерево доступности у каждого фрейма
 * своё: содержимое iframe встаёт под его строкой `- iframe "…" [frame=f2]`, а ссылки его
 * элементов несут фрейм - `f2e7`. Чистая функция - держит тест.
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

/**
 * Дерево доступности одного документа. frames - деревья его iframe по backendDOMNodeId
 * элемента iframe: null - фрейм не прочесть (ушёл, недоступен), записи нет - ещё не читали.
 */
export type AxTree = {
  /** f1, f2… - приставка ссылок фрейма; у главного - пусто. */
  id: string
  nodes: readonly AxNode[]
  frames: Map<number, AxTree | null>
}

/** Элемент снимка: фрейм (его id, у главного - пусто) и узел DOM. */
export type AxRef = { frame: string; node: number }

/** iframe, который встал в снимок, а его дерево ещё не прочитано: tree - где стоит элемент. */
export type PendingFrame = { tree: AxTree; owner: number }

export type AxSnapshot = {
  text: string
  /** Ссылка `e12` или `f2e12` → фрейм и backendDOMNodeId. */
  refs: Map<string, AxRef>
  truncated: boolean
  /**
   * Фреймы, которые попали в снимок без содержимого, по порядку: их стоит прочесть и собрать
   * снимок заново. Не попавшие в предел объёма сюда не идут - читать их незачем.
   */
  pending: PendingFrame[]
}

/** Обёртки без смысла: их дети встают на их место. */
const WRAPPERS = new Set(['generic', 'none', 'presentation', 'Section', 'group', 'LayoutTable'])

/** Не печатаются вовсе: куски текста внутри строки и переносы. */
const SKIPPED = new Set(['InlineTextBox', 'LineBreak'])

const TEXT = 'StaticText'

/** Роли элемента iframe в дереве Chrome: в снимке он - `iframe`, под ним - его документ. */
const FRAME_ROLES = new Set(['Iframe', 'IframePresentational'])

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

/** Общее на весь снимок: строки, ссылки, объём - один предел на все фреймы. */
type Output = {
  lines: string[]
  refs: Map<string, AxRef>
  pending: PendingFrame[]
  chars: number
  truncated: boolean
  maxChars: number
}

/** Обход одного документа: его узлы и счёт его ссылок. */
type Walk = {
  tree: AxTree
  byId: Map<string, AxNode>
  /** Уже разобранные узлы: битое дерево с циклом не уводит обход по кругу. */
  visited: Set<string>
  count: number
}

const walkOf = (tree: AxTree): Walk => ({
  tree,
  byId: new Map(tree.nodes.map((node) => [node.nodeId, node])),
  visited: new Set(),
  count: 0,
})

/** Корень документа - узел без родителя в этом дереве. */
const rootOf = (walk: Walk): AxNode | undefined =>
  walk.tree.nodes.find((node) => !node.parentId || !walk.byId.has(node.parentId))

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

const push = (out: Output, line: string): boolean => {
  if (out.chars + line.length + 1 > out.maxChars) {
    out.truncated = true

    return false
  }

  out.lines.push(line)
  out.chars += line.length + 1

  return true
}

/** Новая ссылка элемента документа: e12 в главном, f2e12 во фрейме f2. */
const refFor = (out: Output, walk: Walk, node: number): string => {
  walk.count += 1

  const ref = `${walk.tree.id}e${walk.count}`

  out.refs.set(ref, { frame: walk.tree.id, node })

  return ref
}

/** Имя документа фрейма - его заголовок: iframe без title подписывается им. */
const titleOf = (tree: AxTree): string => {
  const walk = walkOf(tree)

  return stringOf(rootOf(walk)?.name)
}

const printNode = (out: Output, walk: Walk, node: AxNode, depth: number): void => {
  if (out.truncated) return

  if (depth > SNAPSHOT_MAX_DEPTH) {
    out.truncated = true

    return
  }

  const backend = node.backendDOMNodeId
  const isFrame = FRAME_ROLES.has(stringOf(node.role))
  // undefined - фрейм ещё не читали, null - прочесть нельзя.
  const frame = isFrame && backend !== undefined ? walk.tree.frames.get(backend) : null
  const role = isFrame ? 'iframe' : stringOf(node.role) || 'generic'
  const name = stringOf(node.name) || (frame ? titleOf(frame) : '')
  const runs = textRuns(visibleChildren(walk, node), name)
  const indent = '  '.repeat(depth)
  let line = `${indent}- ${role}`

  if (name) line += ` "${clip(name, NAME_MAX)}"`

  for (const attribute of attributesOf(node, role)) line += ` [${attribute}]`

  if (backend !== undefined) line += ` [ref=${refFor(out, walk, backend)}]`

  if (frame) line += ` [frame=${frame.id}]`

  const value = VALUE_ROLES.has(role) ? stringOf(node.value) : ''
  const [onlyText] = runs

  if (value) {
    line += `: "${clip(value, VALUE_MAX)}"`
  } else if (
    !isFrame &&
    runs.length === 1 &&
    typeof onlyText === 'string' &&
    onlyText.length <= INLINE_MAX
  ) {
    push(out, `${line}: ${onlyText}`)

    return
  }

  if (!push(out, line)) return

  if (isFrame && frame === undefined && backend !== undefined) {
    out.pending.push({ tree: walk.tree, owner: backend })
  }

  for (const run of runs) {
    if (out.truncated) return

    if (typeof run === 'string') {
      if (!push(out, `${indent}  - text: ${clip(run, VALUE_MAX * 2)}`)) return
    } else {
      printNode(out, walk, run, depth + 1)
    }
  }

  if (frame) printDocument(out, walkOf(frame), depth + 1)
}

/**
 * Документ - его содержимое с отступом depth. Корень (документ) не печатается: у страницы его
 * имя - заголовок, он и так в шапке ответа, у фрейма - имя строки iframe.
 */
const printDocument = (out: Output, walk: Walk, depth: number): void => {
  const root = rootOf(walk)

  if (!root) return

  walk.visited.add(root.nodeId)

  const indent = '  '.repeat(depth)

  for (const run of textRuns(visibleChildren(walk, root), stringOf(root.name))) {
    if (out.truncated) return

    if (typeof run === 'string') push(out, `${indent}- text: ${clip(run, VALUE_MAX * 2)}`)
    else printNode(out, walk, run, depth)
  }
}

/**
 * Дерево доступности - текстом, с прочитанными фреймами на местах их iframe. Длиннее предела
 * (один на все фреймы) - обрезается с пометкой.
 */
export const formatAxSnapshot = (tree: AxTree, maxChars = SNAPSHOT_MAX_CHARS): AxSnapshot => {
  const out: Output = {
    lines: [],
    refs: new Map(),
    pending: [],
    chars: 0,
    truncated: false,
    maxChars,
  }

  printDocument(out, walkOf(tree), 0)

  return {
    text: out.lines.join('\n'),
    refs: out.refs,
    truncated: out.truncated,
    pending: out.pending,
  }
}
