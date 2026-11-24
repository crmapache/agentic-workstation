import { BrowserError } from './browser-error'
import { describeAxChain, labelledControl } from './click-check'
import type { Hit, HitAxNode } from './click-check'
import type { Page } from './page'
import type { Point } from './page-nodes'

/**
 * Что под точкой мыши во вкладке (ADR 0119): узел, в который Chrome отдаст нажатие, и его роль и
 * имя словами дерева доступности. Спрашивается прямо перед нажатием, а не при прицеливании: между
 * ними мышь едет сотни миллисекунд, и страница успевает перерисоваться.
 */

/** Глубже фреймов не спускаемся и не поднимаемся - как и снимок (page-frames.ts). */
const MAX_DEPTH = 5

type Located = { backendNodeId?: number; frameId?: string }

type Described = { node?: { frameId?: string } }

type BoxModel = { model: { content: number[] } }

type Metrics = { cssLayoutViewport?: { pageX?: number; pageY?: number } }

type FrameTree = { frame: { id: string }; childFrames?: FrameTree[] }

type Owner = Hit['owners'][number]

/**
 * «Под точкой ничего»: точка за краем окна или документ пуст. Остальные отказы - не про точку,
 * их пропускаем дальше.
 */
const isNothingThere = (error: unknown): boolean =>
  error instanceof BrowserError && error.code === 'cdp' && /no node found/i.test(error.message)

/**
 * Узел под точкой окна документа сессии target (undefined - вкладка) и фрейм его документа;
 * ничего - null. getNodeForLocation ждёт координаты документа, а не окна: к точке - прокрутка
 * документа (проверено в Chrome for Testing: точка окна на прокрученной странице - «No node
 * found»).
 */
const nodeAt = async (page: Page, at: Point, target: string | undefined) => {
  const { cssLayoutViewport: scrolled } = await page.cdp<Metrics>(
    'Page.getLayoutMetrics',
    {},
    { frame: target },
  )

  try {
    const found = await page.cdp<Located>(
      'DOM.getNodeForLocation',
      // Без ignorePointerEventsNone: с ним Chrome бьёт и по слоям с pointer-events: none -
      // по курсору агента поверх страницы, а настоящая мышь сквозь них проходит.
      {
        x: Math.round(at.x + (scrolled?.pageX ?? 0)),
        y: Math.round(at.y + (scrolled?.pageY ?? 0)),
        includeUserAgentShadowDOM: false,
      },
      { frame: target },
    )

    return typeof found.backendNodeId === 'number'
      ? { node: found.backendNodeId, frameId: found.frameId }
      : null
  } catch (error) {
    if (isNothingThere(error)) return null

    throw error
  }
}

/**
 * Узлы доступности от узла вверх. getPartialAXTree отдаёт сам узел, его детей и всех предков;
 * порядок в ответе - не цепочка, поэтому идём по parentId (у первого предка проигнорированного
 * узла его может не быть - тогда по childIds).
 */
const axChainOf = async (page: Page, node: number, target: string | undefined) => {
  const { nodes = [] } = await page.cdp<{ nodes?: HitAxNode[] }>(
    'Accessibility.getPartialAXTree',
    { backendNodeId: node, fetchRelatives: true },
    { frame: target },
  )
  const byId = new Map(nodes.map((item) => [item.nodeId, item]))
  const parentOf = (item: HitAxNode) =>
    (item.parentId ? byId.get(item.parentId) : undefined) ??
    nodes.find((other) => other.childIds?.includes(item.nodeId))
  const chain: HitAxNode[] = []
  let at: HitAxNode | undefined = nodes.find((item) => item.backendDOMNodeId === node) ?? nodes[0]

  while (at && !chain.includes(at)) {
    chain.push(at)
    at = parentOf(at)
  }

  return chain
}

/**
 * Сам узел и его предки в дереве доступности его документа - backendNodeId по порядку. Дерево не
 * ответило - только сам узел: ссылка на сам iframe всё равно узнается.
 */
const pathOf = async (page: Page, node: number, target: string | undefined) => {
  const chain = await axChainOf(page, node, target).catch((error: unknown) => {
    if (error instanceof BrowserError && error.code === 'aborted') throw error

    return []
  })

  return [
    node,
    ...chain.flatMap((item) =>
      typeof item.backendDOMNodeId === 'number' ? [item.backendDOMNodeId] : [],
    ),
  ]
}

/**
 * iframe фреймов своего процесса, в документе которых лежит попадание, - от внутреннего:
 * getNodeForLocation сам заходит в такие фреймы, а дерево доступности документа фрейма до его
 * iframe в документе родителя не поднимается.
 */
const sameProcessOwners = async (page: Page, frameId: string, target: string | undefined) => {
  const { frameTree } = await page.cdp<{ frameTree?: FrameTree }>(
    'Page.getFrameTree',
    {},
    { frame: target },
  )

  if (!frameTree) return []

  const parents = new Map<string, string>()
  const walk = (tree: FrameTree) => {
    for (const child of tree.childFrames ?? []) {
      parents.set(child.frame.id, tree.frame.id)
      walk(child)
    }
  }
  const owners: Owner[] = []

  walk(frameTree)

  for (let id = frameId, depth = 0; parents.has(id) && depth < MAX_DEPTH; depth += 1) {
    const { backendNodeId } = await page.cdp<{ backendNodeId: number }>(
      'DOM.getFrameOwner',
      { frameId: id },
      { frame: target },
    )

    owners.push({ target, path: await pathOf(page, backendNodeId, target) })
    id = parents.get(id) ?? ''
  }

  return owners
}

/**
 * Узел под точкой страницы, со спуском во фреймы других процессов: в документе страницы под
 * точкой тогда их iframe, а сам документ фрейма - в своей сессии, в координатах своего окна.
 * owners - iframe, внутри которых попадание: клик по ссылке на сам iframe или его обёртку
 * попадает внутрь него.
 */
const locate = async (page: Page, point: Point) => {
  const owners: Owner[] = []
  let target: string | undefined
  let at = point
  let frames: Promise<Set<string>> | null = null

  for (let depth = 0; ; depth += 1) {
    const found = await nodeAt(page, at, target)

    if (found === null) return null

    const { node: described } = await page.cdp<Described>(
      'DOM.describeNode',
      { backendNodeId: found.node },
      { frame: target },
    )
    const frameId = described?.frameId

    frames ??= frameId
      ? page.frameTargets().then((list) => new Set(list.map((frame) => frame.frameId)))
      : null

    // Документ попадания - фрейм своего процесса внутри документа сессии: его iframe - тоже владелец.
    if (found.frameId && found.frameId !== target) {
      owners.unshift(...(await sameProcessOwners(page, found.frameId, target)))
    }

    if (depth >= MAX_DEPTH || !frameId || !(await frames)?.has(frameId)) {
      return { node: found.node, target, owners }
    }

    const { model } = await page.cdp<BoxModel>(
      'DOM.getBoxModel',
      { backendNodeId: found.node },
      { frame: target },
    )

    owners.unshift({ target, path: await pathOf(page, found.node, target) })
    at = { x: at.x - (model.content[0] ?? 0), y: at.y - (model.content[1] ?? 0) }
    target = frameId
  }
}

/** Узел доступности поля, чья подпись под точкой; не прочесть - null. */
const controlNode = async (page: Page, control: number, target: string | undefined) => {
  const { nodes = [] } = await page.cdp<{ nodes?: HitAxNode[] }>(
    'Accessibility.getPartialAXTree',
    { backendNodeId: control, fetchRelatives: false },
    { frame: target },
  )

  return nodes.find((item) => item.backendDOMNodeId === control) ?? null
}

/**
 * Что под точкой: узел, его сессия и как его назвать. Ничего под точкой - null. Под точкой
 * подпись поля - попадание в само поле: нажатие по подписи жмёт его флажок. Дерево доступности
 * не ответило - попадание без имени: узел известен, назвать его нечем.
 */
export const hitAt = async (page: Page, point: Point): Promise<Hit | null> => {
  const located = await locate(page, point)

  if (!located) return null

  const chain = await axChainOf(page, located.node, located.target).catch((error: unknown) => {
    if (error instanceof BrowserError && error.code === 'aborted') throw error

    return []
  })
  const control = labelledControl(chain)
  const labelled =
    control === null
      ? null
      : await controlNode(page, control, located.target).catch((error: unknown) => {
          if (error instanceof BrowserError && error.code === 'aborted') throw error

          return null
        })

  return { ...located, ...describeAxChain(located.node, chain, labelled) }
}
