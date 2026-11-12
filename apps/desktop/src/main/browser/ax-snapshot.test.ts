import { it, expect, describe } from 'vitest'

import { formatAxSnapshot, SNAPSHOT_MAX_CHARS, SNAPSHOT_MAX_DEPTH } from './ax-snapshot'
import type { AxNode, AxTree } from './ax-snapshot'

let nextId = 0

/** Дерево одного документа, без фреймов. */
const axTree = (nodes: readonly AxNode[]): AxTree => ({ id: '', nodes, frames: new Map() })

/** Узел дерева доступности в форме ответа Accessibility.getFullAXTree. */
const node = (
  role: string,
  name = '',
  extra: Partial<AxNode> & { children?: AxNode[] } = {},
): AxNode & { children: AxNode[] } => {
  nextId += 1

  const { children = [], ...rest } = extra

  return {
    nodeId: String(nextId),
    role: { type: 'role', value: role },
    name: { type: 'computedString', value: name },
    backendDOMNodeId: 100 + nextId,
    childIds: children.map((child) => child.nodeId),
    ...rest,
    children,
  }
}

/** Плоский список, как его отдаёт CDP: у детей parentId. */
const flatten = (root: AxNode & { children: AxNode[] }): AxNode[] => {
  const out: AxNode[] = []
  const visit = (item: AxNode & { children?: AxNode[] }, parentId?: string) => {
    const { children = [], ...rest } = item

    out.push(parentId ? { ...rest, parentId } : rest)

    for (const child of children) visit(child, item.nodeId)
  }

  visit(root)

  return out
}

describe('снимок страницы из дерева доступности', () => {
  it('роли, имена, состояния и ссылки; обёртки и повтор текста пропадают', () => {
    const tree = node('RootWebArea', 'Test page', {
      children: [
        node('heading', 'Hello', {
          properties: [{ name: 'level', value: { type: 'integer', value: 1 } }],
          children: [node('StaticText', 'Hello')],
        }),
        node('generic', '', {
          children: [
            node('button', 'Click me', { children: [node('StaticText', 'Click me')] }),
            node('textbox', 'Name', {
              value: { type: 'string', value: 'Ann' },
              properties: [{ name: 'focused', value: { type: 'boolean', value: true } }],
            }),
            node('checkbox', 'Agree', {
              properties: [{ name: 'checked', value: { type: 'tristate', value: 'true' } }],
            }),
          ],
        }),
        node('paragraph', '', {
          children: [node('StaticText', 'Some'), node('StaticText', 'text here')],
        }),
        node('link', 'Docs', {
          properties: [{ name: 'url', value: { type: 'string', value: 'https://x.dev/docs' } }],
          children: [node('StaticText', 'Docs')],
        }),
        node('none', '', { ignored: true, children: [node('StaticText', 'loose')] }),
      ],
    })
    const { text, refs, truncated } = formatAxSnapshot(axTree(flatten(tree)))

    expect(text).toBe(
      [
        '- heading "Hello" [level=1] [ref=e1]',
        '- button "Click me" [ref=e2]',
        '- textbox "Name" [focused] [ref=e3]: "Ann"',
        '- checkbox "Agree" [checked] [ref=e4]',
        '- paragraph [ref=e5]: Some text here',
        '- link "Docs" [url=https://x.dev/docs] [ref=e6]',
        '- text: loose',
      ].join('\n'),
    )
    expect(refs.get('e2')).toEqual({ frame: '', node: expect.any(Number) as number })
    expect(refs.size).toBe(6)
    expect(truncated).toBe(false)
  })

  it('вложенность - отступом, длинный текст детей - отдельными строками', () => {
    const long = 'x'.repeat(250)
    const tree = node('RootWebArea', 'P', {
      children: [
        node('list', '', {
          children: [
            node('listitem', '', { children: [node('StaticText', 'One')] }),
            node('listitem', '', { children: [node('StaticText', long)] }),
          ],
        }),
      ],
    })
    const lines = formatAxSnapshot(axTree(flatten(tree))).text.split('\n')

    expect(lines[0]).toBe('- list [ref=e1]')
    expect(lines[1]).toBe('  - listitem [ref=e2]: One')
    expect(lines[2]).toBe('  - listitem [ref=e3]')
    expect(lines[3]?.startsWith('    - text: xxx')).toBe(true)
  })

  it('длиннее предела - обрезан и помечен', () => {
    const tree = node('RootWebArea', 'P', {
      children: Array.from({ length: 50 }, (_, index) => node('button', `Button ${index}`)),
    })
    const snapshot = formatAxSnapshot(axTree(flatten(tree)), 200)

    expect(snapshot.truncated).toBe(true)
    expect(snapshot.text.length).toBeLessThanOrEqual(200)
  })

  it('200 тысяч узлов вширь - снимок обрезан по пределу, а не падает', () => {
    const nodes: AxNode[] = [
      { nodeId: 'root', role: { value: 'RootWebArea' }, childIds: [] },
      ...Array.from({ length: 200_000 }, (_, index) => ({
        nodeId: `n${index}`,
        parentId: 'root',
        role: { value: 'button' },
        name: { value: `Button ${index}` },
        backendDOMNodeId: index + 1,
      })),
    ]

    nodes[0]!.childIds = nodes.slice(1).map((item) => item.nodeId)

    const snapshot = formatAxSnapshot(axTree(nodes))

    expect(snapshot.truncated).toBe(true)
    expect(snapshot.text.length).toBeLessThanOrEqual(SNAPSHOT_MAX_CHARS)
  })

  it('200 тысяч уровней вложенности - без переполнения стека, глубина ограничена', () => {
    const chain = (role: string): AxNode[] =>
      Array.from({ length: 200_000 }, (_, index) => ({
        nodeId: `n${index}`,
        ...(index ? { parentId: `n${index - 1}` } : {}),
        role: { value: index ? role : 'RootWebArea' },
        childIds: index < 199_999 ? [`n${index + 1}`] : [],
        backendDOMNodeId: index + 1,
      }))
    const wrappers = formatAxSnapshot(axTree(chain('generic')))
    const lists = formatAxSnapshot(axTree(chain('list')))

    expect(wrappers.text).toBe('')
    expect(lists.truncated).toBe(true)
    expect(lists.text.split('\n')).toHaveLength(SNAPSHOT_MAX_DEPTH + 1)
  })

  it('пустое дерево - пустой снимок', () => {
    expect(formatAxSnapshot(axTree([]))).toEqual({
      text: '',
      refs: new Map(),
      truncated: false,
      pending: [],
    })
  })
})

/** Фрейм: id и его документ, с фреймами внутри по backendDOMNodeId их iframe. */
const frameTree = (
  id: string,
  root: AxNode & { children: AxNode[] },
  frames: [number, AxTree | null][] = [],
): AxTree => ({ id, nodes: flatten(root), frames: new Map(frames) })

describe('снимок с фреймами', () => {
  it('документ фрейма - под строкой iframe, ссылки несут фрейм; iframe без title - по заголовку', () => {
    const deep = frameTree('f3', node('RootWebArea', '', { children: [node('button', 'Deep')] }))
    const pay = frameTree(
      'f1',
      node('RootWebArea', 'Checkout', {
        children: [node('textbox', 'Card number'), node('button', 'Pay now')],
      }),
    )
    const signIn = frameTree(
      'f2',
      node('RootWebArea', 'Sign in page', {
        children: [node('button', 'Sign in'), node('Iframe', '', { backendDOMNodeId: 700 })],
      }),
      [[700, deep]],
    )
    const main = frameTree(
      '',
      node('RootWebArea', 'Shop', {
        children: [
          node('Iframe', 'Pay', { backendDOMNodeId: 500 }),
          node('Iframe', '', { backendDOMNodeId: 600 }),
          node('button', 'After'),
        ],
      }),
      [
        [500, pay],
        [600, signIn],
      ],
    )
    const { text, refs, pending } = formatAxSnapshot(main)

    expect(text).toBe(
      [
        '- iframe "Pay" [ref=e1] [frame=f1]',
        '  - textbox "Card number" [ref=f1e1]',
        '  - button "Pay now" [ref=f1e2]',
        '- iframe "Sign in page" [ref=e2] [frame=f2]',
        '  - button "Sign in" [ref=f2e1]',
        '  - iframe [ref=f2e2] [frame=f3]',
        '    - button "Deep" [ref=f3e1]',
        '- button "After" [ref=e3]',
      ].join('\n'),
    )
    expect(refs.get('e1')).toEqual({ frame: '', node: 500 })
    expect(refs.get('f2e2')).toEqual({ frame: 'f2', node: 700 })
    expect(refs.get('f1e2')?.frame).toBe('f1')
    expect(pending).toEqual([])
  })

  it('непрочитанный фрейм - в pending, непрочитаемый - просто строка iframe', () => {
    const main = frameTree(
      '',
      node('RootWebArea', 'Shop', {
        children: [
          node('Iframe', 'Later', { backendDOMNodeId: 500 }),
          node('Iframe', 'Gone', { backendDOMNodeId: 600 }),
        ],
      }),
      [[600, null]],
    )
    const { text, pending } = formatAxSnapshot(main)

    expect(text).toBe(['- iframe "Later" [ref=e1]', '- iframe "Gone" [ref=e2]'].join('\n'))
    expect(pending).toEqual([{ tree: main, owner: 500 }])
  })

  it('предел объёма - один на все фреймы; iframe за пределом читать не просят', () => {
    const big = frameTree(
      'f1',
      node('RootWebArea', 'Big', {
        children: Array.from({ length: 50 }, (_, index) => node('button', `Inside ${index}`)),
      }),
    )
    const main = frameTree(
      '',
      node('RootWebArea', 'Shop', {
        children: [
          node('Iframe', 'Big', { backendDOMNodeId: 500 }),
          node('Iframe', 'Far', { backendDOMNodeId: 600 }),
        ],
      }),
      [[500, big]],
    )
    const snapshot = formatAxSnapshot(main, 300)

    expect(snapshot.truncated).toBe(true)
    expect(snapshot.text.length).toBeLessThanOrEqual(300)
    expect(snapshot.text).toContain('[ref=f1e1]')
    expect(snapshot.pending).toEqual([])
  })
})
