import { useState } from 'react'
import { X, Check, Wrench } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { FeedItemWire } from '@agentic-workstation/remote-protocol/wire-types'
import { Disclosure } from '@agentic-workstation/ui/Disclosure'
import { Spinner } from '@agentic-workstation/ui/Spinner'

import { ROW_ICON_SIZE, ROW_ICON_STROKE } from '../Feed.constants'
import styles from '../Feed.module.scss'
import { text, fields, inputText, toolLabel, editCounts, toolSummary } from '../Feed.utils'
import { PathText } from '../../../../shell/PathText/PathText'

const StatusIcon = ({ status }: { status: string }) => {
  if (status === 'running') return <Spinner size="sm" tone="accent" />
  if (status === 'done') {
    return (
      <Check
        className={styles.done}
        size={ROW_ICON_SIZE}
        strokeWidth={ROW_ICON_STROKE}
        aria-hidden
      />
    )
  }

  return (
    <X className={styles.failed} size={ROW_ICON_SIZE} strokeWidth={ROW_ICON_STROKE} aria-hidden />
  )
}

/**
 * Вызов инструмента одной строкой: что и о чём, правка - итогом +N -M, у субагента - сколько
 * шагов внутри. Нажатие раскрывает вход и вывод.
 */
export const ToolItem = ({ item, steps }: { item: FeedItemWire; steps: number }) => {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const name = text(item, 'name')
  const input = fields(item, 'input') ?? {}
  const result = fields(item, 'result')
  const status = text(item, 'status')
  const counts = editCounts(name, input, result)
  const output = result ? text(result, 'stdout') || text(result, 'text') : ''
  const errors = result ? text(result, 'stderr') : ''

  return (
    <div className={styles.toolItem}>
      <Disclosure size="touch" expanded={isOpen} onClick={() => setIsOpen((open) => !open)}>
        <StatusIcon status={status} />
        <span className={styles.toolName}>{toolLabel(name) || t('feed.tool')}</span>
        <span className={styles.toolSummary}>
          <PathText text={toolSummary(name, input)} />
        </span>
        {counts && (
          <span className={styles.counts}>
            <span className={styles.added}>{t('feed.added', { count: counts.added })}</span>
            <span className={styles.removed}>{t('feed.removed', { count: counts.removed })}</span>
          </span>
        )}
        {steps > 0 && <span className={styles.steps}>{t('feed.steps', { count: steps })}</span>}
      </Disclosure>
      {isOpen && (
        <div className={styles.toolBody}>
          <pre className={styles.output}>
            <PathText text={inputText(name, input)} />
          </pre>
          {output && (
            <pre className={styles.output}>
              <PathText text={output} />
            </pre>
          )}
          {errors && (
            <pre className={styles.errorOutput}>
              <PathText text={errors} />
            </pre>
          )}
          {status !== 'running' && status !== 'done' && (
            <p className={styles.toolState}>
              <Wrench size={ROW_ICON_SIZE} strokeWidth={ROW_ICON_STROKE} aria-hidden />
              {t(`feed.toolStatus.${status}`, { defaultValue: status })}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
