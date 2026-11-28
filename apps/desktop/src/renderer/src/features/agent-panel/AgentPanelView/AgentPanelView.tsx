import { useTranslation } from 'react-i18next'

import { EmptyState } from '@agentic-workstation/ui/EmptyState'

import { useChatHandoff } from '../chat-handoff.hooks'
import { useGaugeCalm } from '../panel-look.hooks'
import { usePanelCapabilities, useProjectConversations } from '../panel.queries'
import { usePanelStore } from '../panel.store'
import { useDropSpareTabs } from '../spare-tabs.hooks'
import { CliMissing } from '../CliMissing/CliMissing'
import { ConversationPane } from '../ConversationPane/ConversationPane'
import { ConversationTabs } from '../ConversationTabs/ConversationTabs'
import { LoginGate } from '../LoginGate/LoginGate'
import { needsSignIn } from '../LoginGate/LoginGate.utils'
import { SearchWindow } from '../SearchWindow/SearchWindow'
import { SideMenu } from '../SideMenu/SideMenu'
import { AI_ICON } from '../../../lib/ai-icon.constants'
import {
  usePanelKeys,
  usePanelFocus,
  useAnswerOnAction,
  useEnsureConversation,
} from './AgentPanelView.hooks'
import styles from './AgentPanelView.module.scss'
import { CloseWorkingDialog } from './parts/CloseWorkingDialog'
import { NoChats } from './parts/NoChats'

/**
 * GUI Claude Code в правой панели (зона 7, ADR 0009): вкладки разговоров активного
 * проекта, выбранный разговор и боковое меню поверх них. Без проекта говорить не о чем,
 * без CLI - не с кем. Пока фокус здесь - клавиши панели (вкладки, ⌘W закрывает
 * вкладку, а не окно); закрыли последнюю вкладку - экран «Let's start».
 */
export const AgentPanelView = () => {
  const { t } = useTranslation()
  const { project, state, conversations, active } = useProjectConversations()
  const emptied = usePanelStore((store) => Boolean(project && store.emptied[project.rootPath]))
  const closedCount = (project && state?.closedByProject[project.rootPath]?.length) ?? 0
  const keys = usePanelKeys(project, conversations, active, closedCount)
  const focus = usePanelFocus()
  const handleAction = useAnswerOnAction(active)
  const capabilities = usePanelCapabilities()

  useEnsureConversation(project, state, conversations.length)
  useDropSpareTabs(state)
  useChatHandoff(project, active)
  useGaugeCalm()

  if (!project) {
    return (
      <EmptyState
        icon={AI_ICON}
        title={t('agentPanel.noProjectTitle')}
        description={t('agentPanel.noProjectText')}
      />
    )
  }

  if (state?.cli === 'missing') return <CliMissing />
  // Аккаунт в работе не вошёл - экран входа вместо панели (как в ACC).
  if (state && capabilities.accounts !== 'none' && needsSignIn(state)) {
    return <LoginGate accounts={state.accounts} />
  }

  return (
    <div
      className={styles.agentPanelView}
      onFocus={focus.handleFocus}
      onBlur={focus.handleBlur}
      onKeyDown={keys.handleKeyDown}
      onKeyDownCapture={handleAction}
      onPointerDownCapture={handleAction}
      onWheelCapture={handleAction}>
      <ConversationTabs
        project={project}
        conversations={conversations}
        activeId={active?.id ?? null}
      />
      {emptied && conversations.length === 0 ? (
        <NoChats project={project} />
      ) : (
        <ConversationPane key={active?.id ?? project.id} project={project} conversation={active} />
      )}
      <SideMenu project={project} conversation={active} />
      {capabilities.search && <SearchWindow project={project} conversation={active} />}
      <CloseWorkingDialog
        conversation={keys.confirming}
        onConfirm={keys.handleConfirm}
        onCancel={keys.handleCancel}
      />
    </div>
  )
}
