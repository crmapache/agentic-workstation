import { it, expect, describe } from 'vitest'

import { pruneAxTree } from './ax-prune'

const text = (index: number) => ({
  nodeId: `t${index}`,
  parentId: `p${index}`,
  role: { type: 'internalRole', value: 'StaticText' },
  name: {
    type: 'computedString',
    value: `Line ${index}`,
    sources: [{ type: 'contents', value: { type: 'computedString', value: `Line ${index}` } }],
  },
  chromeRole: { type: 'internalRole', value: 158 },
  childIds: [`b${index}`],
  backendDOMNodeId: index * 10 + 1,
})

const box = (index: number) => ({
  nodeId: `b${index}`,
  parentId: `t${index}`,
  role: { type: 'internalRole', value: 'InlineTextBox' },
  name: { type: 'computedString', value: `Line ${index}` },
  childIds: [],
})

/** Страница из count абзацев: у каждого текст и кусок строки - как отдаёт Chrome. */
const page = (count: number) => [
  {
    nodeId: 'root',
    role: { type: 'internalRole', value: 'RootWebArea' },
    childIds: Array.from({ length: count }, (_, index) => `p${index}`),
  },
  ...Array.from({ length: count }, (_, index) => [
    {
      nodeId: `p${index}`,
      parentId: 'root',
      role: { type: 'role', value: 'paragraph' },
      ignoredReasons: [{ name: 'uninteresting', value: { type: 'boolean', value: true } }],
      childIds: [`t${index}`],
      backendDOMNodeId: index * 10,
    },
    text(index),
    box(index),
  ]).flat(),
]

describe('дерево доступности для IDE', () => {
  it('без кусков строки, источников имени, роли Chrome и причин скрытости; по порядку обхода', () => {
    const { nodes, truncated } = pruneAxTree(page(2))

    expect(truncated).toBe(false)
    expect(nodes.map((node) => (node as { nodeId: string }).nodeId)).toEqual([
      'root',
      'p0',
      't0',
      'p1',
      't1',
    ])
    expect(nodes[2]).toEqual({
      nodeId: 't0',
      parentId: 'p0',
      backendDOMNodeId: 1,
      role: { type: 'internalRole', value: 'StaticText' },
      name: { type: 'computedString', value: 'Line 0' },
    })
    expect(JSON.stringify(nodes)).not.toMatch(/ignoredReasons|chromeRole|sources|InlineTextBox/)
  })

  it('скрытый узел - только связи', () => {
    const { nodes } = pruneAxTree([
      { nodeId: 'r', role: { value: 'RootWebArea' }, childIds: ['g'] },
      { nodeId: 'g', parentId: 'r', ignored: true, role: { value: 'generic' }, childIds: [] },
    ])

    expect(nodes[1]).toEqual({ nodeId: 'g', parentId: 'r', ignored: true })
  })

  it('200 тысяч узлов - обрезано по объёму с пометкой, а не исключение', () => {
    const huge = page(70_000)
    const { nodes, truncated } = pruneAxTree(huge, 1024 * 1024)

    expect(huge.length).toBeGreaterThan(200_000)
    expect(truncated).toBe(true)
    expect(JSON.stringify(nodes).length).toBeLessThanOrEqual(1024 * 1024 + nodes.length)
    expect((nodes[0] as { nodeId: string }).nodeId).toBe('root')
  })

  it('битые узлы и цикл не ломают обход', () => {
    const { nodes, truncated } = pruneAxTree([
      null,
      { nodeId: 'a', role: { value: 'RootWebArea' }, childIds: ['b'] },
      { nodeId: 'b', parentId: 'a', role: { value: 'group' }, childIds: ['a'] },
    ])

    expect(truncated).toBe(false)
    expect(nodes).toHaveLength(2)
  })
})
