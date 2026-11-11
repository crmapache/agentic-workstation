import type { MouseEvent, KeyboardEvent } from 'react'
import clsx from 'clsx'
import { ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@agentic-workstation/ui/Badge'

import { ROW_ICON_SIZE, ROW_ICON_STROKE } from '../claude.constants'
import { useFeedScope, useAwaitingTool } from '../feed-scope.context'
import { chipTone, toolChip } from '../tool-icons'
import { fileTarget, toolTarget } from '../tool-summary.utils'
import { ElapsedTime } from '../ElapsedTime/ElapsedTime'
import { PathLink } from '../PathLink/PathLink'
import { ToolStatus } from '../ToolStatus/ToolStatus'
import { CHIP_KEYS } from './ToolHead.constants'
import styles from './ToolHead.module.scss'
import type { ToolHeadProps } from './ToolHead.types'

/**
 * Шапка вызова, как в ACC: стрелка (только если есть что раскрыть), чип вида, цель (путь
 * файла - ссылка), итог, справа длительность. Строка - кнопка раскрытия, а путь внутри -
 * своя кнопка; одна в другой не стоит, поэтому строка - div с ролью кнопки.
 */
export const ToolHead = ({ tool, meta, canOpen, expanded, onToggle }: ToolHeadProps) => {
  const { t } = useTranslation()
  const { projectPath } = useFeedScope()
  const awaitingId = useAwaitingTool()
  const chip = toolChip(tool.name)
  const target = toolTarget(tool, projectPath)
  const file = fileTarget(tool)
  const isFailed = tool.status === 'error' || tool.status === 'denied'

  // Клавиша на пути принадлежит пути: строка не сворачивается вместо открытия файла.
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!canOpen || event.target !== event.currentTarget) return
    if (event.key !== 'Enter' && event.key !== ' ') return

    event.preventDefault()
    onToggle()
  }

  // Нажатие на путь открывает файл, а не сворачивает карточку.
  const handleTargetEvent = (event: MouseEvent | KeyboardEvent) => event.stopPropagation()

  return (
    <div
      className={clsx(styles.toolHead, canOpen && styles.openable)}
      role={canOpen ? 'button' : undefined}
      tabIndex={canOpen ? 0 : undefined}
      aria-expanded={canOpen ? expanded : undefined}
      onClick={canOpen ? onToggle : undefined}
      onKeyDown={handleKeyDown}>
      {canOpen && (
        <ChevronRight
          className={clsx(styles.caret, expanded && styles.caretOpen)}
          size={ROW_ICON_SIZE}
          strokeWidth={ROW_ICON_STROKE}
          aria-hidden
        />
      )}
      <Badge tone={chipTone(chip)} variant="soft">
        {t(CHIP_KEYS[chip])}
      </Badge>
      <span className={clsx(styles.target, isFailed && styles.failed)}>
        {file ? (
          <span onClick={handleTargetEvent} onKeyDown={handleTargetEvent}>
            <PathLink request={file} tone="inherit" className={styles.link}>
              {target}
            </PathLink>
          </span>
        ) : (
          target
        )}
      </span>
      <ToolStatus
        meta={meta}
        running={tool.status === 'running'}
        awaiting={tool.id === awaitingId}
      />
      <span className={styles.spacer} />
      <ElapsedTime startedAt={tool.startedAt} endedAt={tool.endedAt} />
    </div>
  )
}
