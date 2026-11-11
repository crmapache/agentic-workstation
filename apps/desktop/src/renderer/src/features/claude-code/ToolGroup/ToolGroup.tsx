import { memo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@agentic-workstation/ui/Badge'
import { Disclosure } from '@agentic-workstation/ui/Disclosure'

import { useFeedScope, useAwaitingTool } from '../feed-scope.context'
import { chipTone, toolChip } from '../tool-icons'
import { toolTarget } from '../tool-summary.utils'
import { ElapsedTime } from '../ElapsedTime/ElapsedTime'
import { CHIP_KEYS } from '../ToolHead/ToolHead.constants'
import { ToolRow } from '../ToolRow/ToolRow'
import { ToolStatus } from '../ToolStatus/ToolStatus'
import { useGroupCollapsed } from './ToolGroup.hooks'
import styles from './ToolGroup.module.scss'
import type { ToolGroupProps } from './ToolGroup.types'

/**
 * Подряд идущие вызовы одной строкой, как в ACC: пока пачка идёт - в шапке текущий
 * вызов и «· running», справа «N tools» и время; кончилась - «N tools». Раскрытая -
 * карточки вызовов. Из одного вызова - просто его карточка, без рамки группы.
 */
export const ToolGroup = memo(({ items }: ToolGroupProps) => {
  const { t } = useTranslation()
  const { projectPath } = useFeedScope()
  const awaitingId = useAwaitingTool()
  const [isOpen, setIsOpen] = useState(false)
  const isRunning = items.some((tool) => tool.status === 'running')
  const isCollapsed = useGroupCollapsed(isRunning)
  const current = items.at(-1)
  const startedAt = Math.min(...items.map((tool) => tool.startedAt || Number.MAX_SAFE_INTEGER))
  const endedAt = isRunning ? 0 : Math.max(...items.map((tool) => tool.endedAt))
  const count = t('claudeCode.feed.tool.count', { count: items.length })

  const handleToggle = () => setIsOpen((value) => !value)

  if (items.length === 1 && current) return <ToolRow tool={current} />
  if (!current) return null

  const chip = toolChip(current.name)

  return (
    <div className={styles.toolGroup}>
      <Disclosure expanded={isOpen} onClick={handleToggle}>
        {isCollapsed ? (
          <span className={styles.target}>{count}</span>
        ) : (
          <>
            <Badge tone={chipTone(chip)} variant="soft">
              {t(CHIP_KEYS[chip])}
            </Badge>
            <span className={styles.target}>{toolTarget(current, projectPath)}</span>
            {isRunning && (
              <ToolStatus meta={{ kind: 'none' }} running awaiting={current.id === awaitingId} />
            )}
          </>
        )}
        <span className={styles.spacer} />
        {!isCollapsed && <span className={styles.count}>{count}</span>}
        <ElapsedTime
          startedAt={startedAt === Number.MAX_SAFE_INTEGER ? 0 : startedAt}
          endedAt={endedAt}
        />
      </Disclosure>
      {isOpen && (
        <div className={styles.body}>
          {items.map((tool) => (
            <ToolRow key={tool.id} tool={tool} />
          ))}
        </div>
      )}
    </div>
  )
})

ToolGroup.displayName = 'ToolGroup'
