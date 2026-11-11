import { useState } from 'react'
import { X, Check, Square, Wrench } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { FeedItemWire } from '@agentic-workstation/remote-protocol/wire-types'
import { Disclosure } from '@agentic-workstation/ui/Disclosure'
import { IconButton } from '@agentic-workstation/ui/IconButton'
import { Spinner } from '@agentic-workstation/ui/Spinner'

import { ROW_ICON_SIZE, ROW_ICON_STROKE } from '../Feed.constants'
import styles from '../Feed.module.scss'
import type { RunningTask } from '../Feed.types'
import {
  text,
  fields,
  inputText,
  toolLabel,
  editCounts,
  runningTask,
  toolSummary,
} from '../Feed.utils'
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
 * шагов внутри. Нажатие раскрывает вход и вывод. За вызовом идёт задача (субагент, фоновая
 * команда) - рядом «остановить» её одну, не трогая ход: как у карточки задачи в панели IDE.
 */
export const ToolItem = ({
  item,
  steps,
  onStopTask,
}: {
  item: FeedItemWire
  steps: number
  onStopTask?: ((task: RunningTask) => void) | undefined
}) => {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const task = onStopTask ? runningTask(item) : null
  const name = text(item, 'name')
  const input = fields(item, 'input') ?? {}
  const result = fields(item, 'result')
  const status = text(item, 'status')
  const counts = editCounts(name, input, result)
  const output = result ? text(result, 'stdout') || text(result, 'text') : ''
  const errors = result ? text(result, 'stderr') : ''

  return (
    <div className={styles.toolItem}>
      <div className={styles.toolRow}>
        <div className={styles.toolRowMain}>
          <Disclosure size="touch" expanded={isOpen} onClick={() => setIsOpen((open) => !open)}>
            <StatusIcon status={status} />
            <span className={styles.toolName}>{toolLabel(name) || t('feed.tool')}</span>
            <span className={styles.toolSummary}>
              <PathText text={toolSummary(name, input)} />
            </span>
            {counts && (
              <span className={styles.counts}>
                <span className={styles.added}>{t('feed.added', { count: counts.added })}</span>
                <span className={styles.removed}>
                  {t('feed.removed', { count: counts.removed })}
                </span>
              </span>
            )}
            {steps > 0 && <span className={styles.steps}>{t('feed.steps', { count: steps })}</span>}
          </Disclosure>
        </div>
        {task && onStopTask && (
          <IconButton
            icon={Square}
            size="touch"
            label={t('feed.stopTask')}
            onClick={() => onStopTask(task)}
          />
        )}
      </div>
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
