import { useState } from 'react'
import { Square, Trash2, ArrowUp, Ellipsis, ArrowDown, OctagonPause } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { QueueAction } from '@shared/scenario-queues'

import { IconButton } from '@agentic-workstation/ui/IconButton'
import { Menu } from '@agentic-workstation/ui/Menu'
import { MenuItem } from '@agentic-workstation/ui/MenuItem'
import { MenuSeparator } from '@agentic-workstation/ui/MenuSeparator'
import { Popover } from '@agentic-workstation/ui/Popover'
import { usePopover } from '@agentic-workstation/ui/Popover.hooks'

import type { QueueItemMenuProps } from '../QueueCard.types'
import { useScenarioActions } from '../../scenarios.actions'
import { StopRunDialog } from './StopRunDialog'

/**
 * Дела над сценарием строки. Ждущий: сдвинуть среди ждущих, остановить очередь после него, убрать.
 * Идущий: остановить после него или оборвать сейчас (с вопросом) - те же дела, что у полосы
 * внизу карточки, но под рукой: в длинной очереди полоса уезжает далеко от строки. Идущий не
 * двигается и не убирается - его место уже случилось, как и у прошедших.
 */
export const QueueItemMenu = ({ queue, item, runId, isFirst, isLast }: QueueItemMenuProps) => {
  const { t } = useTranslation()
  const popover = usePopover()
  const actions = useScenarioActions()
  const [isStopping, setIsStopping] = useState(false)
  const isRunning = item.state === 'running'
  const isMarked = queue.stopAfterItemId === item.id
  const label = t('scenarios.queues.itemMenu.label', { name: item.scenarioName })

  const act = (action: QueueAction) => void actions.queue(queue.id, action)

  const handleUp = () => act({ kind: 'move', itemId: item.id, by: -1 })

  const handleDown = () => act({ kind: 'move', itemId: item.id, by: 1 })

  const handleStopAfter = () => act({ kind: 'stopAfter', itemId: isMarked ? null : item.id })

  const handleStop = () => setIsStopping(true)

  const handleStopClosed = () => setIsStopping(false)

  const handleRemove = () => act({ kind: 'remove', itemId: item.id })

  return (
    <>
      <IconButton
        {...popover.triggerProps}
        icon={Ellipsis}
        size="xs"
        label={label}
        aria-haspopup="menu"
      />
      <Popover {...popover.popoverProps}>
        {popover.isOpen && (
          <Menu label={label} autoFocus>
            {!isRunning && (
              <>
                <MenuItem
                  icon={ArrowUp}
                  label={t('scenarios.queues.itemMenu.moveUp')}
                  disabled={isFirst}
                  onSelect={handleUp}
                />
                <MenuItem
                  icon={ArrowDown}
                  label={t('scenarios.queues.itemMenu.moveDown')}
                  disabled={isLast}
                  onSelect={handleDown}
                />
                <MenuSeparator />
              </>
            )}
            {/* Мимо пометки очередь проходит, не останавливаясь: остановку ставят на сценарий. */}
            {!item.placeholder && (
              <MenuItem
                icon={OctagonPause}
                label={
                  isMarked
                    ? t('scenarios.queues.itemMenu.keepGoing')
                    : t('scenarios.queues.itemMenu.stopAfter')
                }
                onSelect={handleStopAfter}
              />
            )}
            {!item.placeholder && <MenuSeparator />}
            {isRunning ? (
              // Сводки прогона ещё нет (только поднимается) - обрывать пока нечего.
              <MenuItem
                icon={Square}
                label={t('scenarios.queues.itemMenu.stop')}
                disabled={!runId}
                onSelect={handleStop}
              />
            ) : (
              <MenuItem
                icon={Trash2}
                label={t('scenarios.queues.itemMenu.remove')}
                onSelect={handleRemove}
              />
            )}
          </Menu>
        )}
      </Popover>
      {isStopping && runId && (
        <StopRunDialog queue={queue} item={item} runId={runId} onClose={handleStopClosed} />
      )}
    </>
  )
}
