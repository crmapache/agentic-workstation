import clsx from 'clsx'

import { Card } from '@agentic-workstation/ui/Card'
import { Section } from '@agentic-workstation/ui/Section'

import styles from '../ExtensionSurface.module.scss'
import type { NodeProps } from '../ExtensionSurface.types'
import { classFor } from '../ExtensionSurface.utils'
import { SurfaceNode } from './SurfaceNode'

/** Дети узла по порядку: ключ - место, у дерева расширения других ключей нет. */
const Children = ({ nodes }: { nodes: NodeProps<'stack'>['node']['children'] }) =>
  nodes.map((child, index) => <SurfaceNode key={index} node={child} />)

/** Узлы друг под другом с зазором. */
export const StackNode = ({ node }: NodeProps<'stack'>) => (
  <div className={clsx(styles.stack, styles[node.gap ?? 'md'])}>
    <Children nodes={node.children} />
  </div>
)

/** Узлы в ряд: выравнивание и перенос - от расширения. */
export const RowNode = ({ node }: NodeProps<'row'>) => (
  <div
    className={clsx(
      styles.row,
      styles[node.gap ?? 'md'],
      styles[classFor('align', node.align ?? 'center')],
      node.wrap && styles.wrap,
    )}>
    <Children nodes={node.children} />
  </div>
)

/** Раздел с заголовком - Section дизайн-системы, действия справа от заголовка. */
export const SectionNode = ({ node }: NodeProps<'section'>) => (
  <Section
    title={node.title}
    description={node.description}
    actions={node.actions?.length ? <Children nodes={node.actions} /> : undefined}>
    <div className={clsx(styles.stack, styles.md)}>
      <Children nodes={node.children} />
    </div>
  </Section>
)

/** Карточка - Card дизайн-системы. */
export const CardNode = ({ node }: NodeProps<'card'>) => (
  <Card
    title={node.title}
    description={node.description}
    tone={node.tone}
    actions={node.actions?.length ? <Children nodes={node.actions} /> : undefined}>
    <div className={clsx(styles.stack, styles.md)}>
      <Children nodes={node.children} />
    </div>
  </Card>
)

/** Линия между частями вида. */
export const DividerNode = () => <hr className={styles.divider} />
