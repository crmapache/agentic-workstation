import type { MouseEvent } from 'react'
import { useCallback } from 'react'
import { Pin } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { ClosableTab } from '@agentic-workstation/ui/ClosableTab'
import { openWhenReleased } from '@agentic-workstation/ui/Popover.utils'

import { FORK_MARK, PIN_ICON_SIZE } from '../ConversationTabs.constants'
import styles from '../ConversationTabs.module.scss'
import type { Drag, ConversationTabProps } from '../ConversationTabs.types'
import { tabName } from '../ConversationTabs.utils'
import { useConversationActions } from '../../conversation-actions.hooks'
import { keyLine } from '../../panel-keys.utils'
import { usePanelStore } from '../../panel.store'
import { useTabCallsStore } from '../../tab-calls.store'
import { useCloseTab } from '../../tab-close.hooks'
import { isClosableTab } from '../../tab-close.utils'
import { StatusDot } from '../../StatusDot/StatusDot'
import { dotState } from '../../StatusDot/StatusDot.utils'
import { TabNameField } from './TabNameField'

/**
 * Вкладка разговора: точка состояния с подсказкой словами, булавка у головы закреплённой
 * группы, знак ⑂ и отступ у форка, имя (режется посередине), крестик - кроме закреплённой и
 * последней пустой вкладки. Выбранная - тоном вкладок (tinted), свет со звёздочками -
 * если позвала. Двойной клик - поле имени, правый клик - меню (ID разговора, переименовать),
 * нажатие с движением - перетаскивание (голова несёт группу, форк - себя внутри группы).
 */
export const ConversationTab = ({
  conversation,
  isActive,
  startsGroup,
  endsGroup,
  groupSize,
  tabCount,
  call,
  calm,
  dragView,
  register,
  onPress,
  onMenu,
  wasDragged,
}: ConversationTabProps) => {
  const { t } = useTranslation()
  const { activateConversation, rename } = useConversationActions()
  const isNaming = usePanelStore((store) => store.naming === conversation.id)
  const setNaming = usePanelStore((store) => store.setNaming)
  const requestFocus = usePanelStore((store) => store.requestFocus)
  const answerCalls = useTabCallsStore((store) => store.answerCalls)
  const closeTab = useCloseTab()
  const { id, groupId } = conversation
  const name = tabName(conversation, t)
  const state = dotState(conversation, isActive)
  // Форк несёт себя внутри группы; голова и форк в группе из двух - всю группу.
  const pinned = conversation.pinned === true
  const drag: Drag =
    startsGroup || groupSize < 3
      ? { kind: 'group', id: groupId, groupId, pinned }
      : { kind: 'tab', id, groupId, pinned }
  const moving = dragView.drag
  const isCarried =
    moving !== null && (moving.kind === 'tab' ? moving.id === id : moving.id === groupId)
  const offset = isCarried ? dragView.offset : (dragView.shifts[id] ?? null)
  const closeLabel = isActive
    ? t('agentPanel.tabs.closeActive', {
        title: name,
        close: keyLine('closeTab'),
        reopen: keyLine('reopenTab'),
      })
    : t('agentPanel.closeChat', { title: name })

  const handleRef = useCallback((node: HTMLDivElement | null) => register(id, node), [register, id])

  const handleMouseDown = (event: MouseEvent<HTMLDivElement>) => onPress(event, drag, id)

  // Хвост перетаскивания - не выбор. Клик по светящейся открытой - «вижу», свет гаснет.
  const handleActivate = () => {
    if (wasDragged()) return
    if (isActive) answerCalls([id])

    void activateConversation(id)
  }

  // Два быстрых нажатия на крестик - два закрытия, а не переименование.
  const handleDoubleClick = (event: MouseEvent<HTMLDivElement>) => {
    const button = (event.target as HTMLElement).closest('button')

    if (wasDragged() || (button && button.getAttribute('role') !== 'tab')) return

    setNaming(id)
  }

  const handleContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    const anchor = event.currentTarget

    event.preventDefault()
    openWhenReleased(event.nativeEvent, () => onMenu(id, anchor))
  }

  const handleClose = () => void closeTab(conversation)

  // Пустое или прежнее имя - ничего: подтвердить имя модели не значит взять его себе.
  const handleNamed = (title: string | null, byKey: boolean) => {
    const next = title?.trim()

    setNaming(null)

    if (next && next !== conversation.title) void rename(id, next)
    if (byKey) requestFocus()
  }

  return (
    <ClosableTab
      ref={handleRef}
      width="grow"
      label={name}
      hint={name}
      active={isActive}
      closeLabel={closeLabel}
      closable={isClosableTab(conversation, tabCount)}
      tinted
      indent={conversation.depth}
      groupEnd={endsGroup}
      call={call?.tone ?? null}
      callSince={call?.at}
      calm={calm}
      lifted={isCarried}
      offset={offset}
      leading={
        <>
          <StatusDot status={state} hint={t(`agentPanel.tabs.dot.${state}`)} />
          {pinned && startsGroup && (
            <Pin
              className={styles.pinMark}
              size={PIN_ICON_SIZE}
              aria-label={t('agentPanel.tabs.pinned')}
            />
          )}
          {conversation.depth > 0 && (
            <span className={styles.forkMark} aria-hidden>
              {FORK_MARK}
            </span>
          )}
        </>
      }
      editor={
        isNaming && (
          <TabNameField title={name} label={t('agentPanel.tabs.rename')} onDone={handleNamed} />
        )
      }
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      onActivate={handleActivate}
      onClose={handleClose}
    />
  )
}
