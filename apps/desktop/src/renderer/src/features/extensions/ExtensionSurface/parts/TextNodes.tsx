import { Suspense } from 'react'
import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

import { Badge } from '@agentic-workstation/ui/Badge'
import { EmptyState } from '@agentic-workstation/ui/EmptyState'
import { ProgressBar } from '@agentic-workstation/ui/ProgressBar'
import { Spinner } from '@agentic-workstation/ui/Spinner'

import { BADGE_TONES } from '../ExtensionSurface.constants'
import styles from '../ExtensionSurface.module.scss'
import type { NodeProps } from '../ExtensionSurface.types'
import { classFor } from '../ExtensionSurface.utils'
import { extensionIcon } from '../../../../lib/extension-icons'
import { useConversationLog } from '../../../../state/conversation-log.context'

/** Строка текста: тон, кегль, моноширинный и жирный - из словаря дизайн-системы. */
export const TextNode = ({ node }: NodeProps<'text'>) => (
  <p
    className={clsx(
      styles.text,
      styles[classFor('tone', node.tone ?? 'default')],
      node.size === 'sm' && styles.small,
      node.mono && styles.mono,
      node.strong && styles.strong,
    )}>
    {node.text}
  </p>
)

/**
 * Markdown - тем же разбором, что ответы в ленте разговора, когда вид стоит в середине окна; в
 * левой панели разбора нет - текст как есть.
 */
export const MarkdownNode = ({ node }: NodeProps<'markdown'>) => {
  const log = useConversationLog()
  const plain = <p className={clsx(styles.text, styles.prewrap)}>{node.text}</p>

  if (!log) return plain

  return (
    <div className={styles.markdown}>
      <Suspense fallback={plain}>
        <log.Text text={node.text} />
      </Suspense>
    </div>
  )
}

/** Код, вывод, путь - моноширинным блоком с переносом. */
export const CodeNode = ({ node }: NodeProps<'code'>) => (
  <pre className={styles.code}>{node.text}</pre>
)

export const BadgeNode = ({ node }: NodeProps<'badge'>) => (
  <Badge tone={BADGE_TONES[node.tone ?? 'default']}>{node.text}</Badge>
)

/** Сведения парами «подпись - значение». */
export const KeyValueNode = ({ node }: NodeProps<'keyValue'>) => (
  <dl className={styles.facts}>
    {node.items.map((item, index) => (
      <div key={index} className={styles.fact}>
        <dt className={styles.factLabel}>{item.label}</dt>
        <dd className={styles.factValue}>{item.value}</dd>
      </div>
    ))}
  </dl>
)

/** Доля готового - полосой, без доли - Spinner: своей крутилки у расширения нет. */
export const ProgressNode = ({ node }: NodeProps<'progress'>) => {
  const { t } = useTranslation()
  const label = node.label ?? t('extensions.view.working')

  return node.value === undefined ? (
    <span className={styles.working}>
      <Spinner size="sm" label={label} />
      {node.label && <span className={styles.workingLabel}>{node.label}</span>}
    </span>
  ) : (
    <ProgressBar value={node.value} label={label} />
  )
}

export const EmptyNode = ({ node }: NodeProps<'empty'>) => (
  <EmptyState title={node.title} description={node.description} icon={extensionIcon(node.icon)} />
)
