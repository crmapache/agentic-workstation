import { useRef } from 'react'

import { isAnythingRunning } from '../agents.utils'
import { projectDraftKey } from '../draft.utils'
import { PaneKeysContext } from '../pane-keys.context'
import { usePaneKeys } from '../pane-keys.hooks'
import { useConversationFeed } from '../panel.queries'
import { usePanelStore } from '../panel.store'
import { Composer } from '../Composer/Composer'
import { ComposerStatus } from '../ComposerStatus/ComposerStatus'
import { ConversationDock } from '../ConversationDock/ConversationDock'
import { Feed } from '../Feed/Feed'
import { RewindDialog } from '../RewindDialog/RewindDialog'
import { SelectionMenu } from '../SelectionMenu/SelectionMenu'
import { Welcome } from '../Welcome/Welcome'
import { usePanelProvider } from '../../../state/panel-provider.context'
import styles from './ConversationPane.module.scss'
import type { ConversationPaneProps } from './ConversationPane.types'

/**
 * Один разговор: лента (или приветствие, пока в ней пусто), над полем - то, что ждёт
 * человека, внизу - поле ввода и строка под ним (модель, усилие, режим, лимиты). Лента
 * грузится запросом и дальше живёт событиями.
 * Клавиши панели (Esc, Shift+Tab, цифры карточек) слушает вся панель, меню у
 * выделенного - поверх ленты.
 */
export const ConversationPane = ({ project, conversation }: ConversationPaneProps) => {
  const { data: feed, isPending } = useConversationFeed(conversation?.id)
  const provider = usePanelProvider()
  const draftKey = conversation?.id ?? projectDraftKey(provider, project.rootPath)
  const rewindTarget = usePanelStore((store) => store.rewindTarget)
  const items = feed?.items ?? []
  const isEmpty = !conversation || (!isPending && items.length === 0)
  // Ничего не идёт - идущая задача стоит, и крутилка у неё врала бы.
  const isWorking = conversation !== null && isAnythingRunning(conversation, items)
  const feedRef = useRef<HTMLDivElement>(null)
  const { keys, handleKeyDown } = usePaneKeys(project, conversation, draftKey)

  return (
    <PaneKeysContext value={keys}>
      {/* Нажатие в ленте отдаёт фокус панели - и клавиши панели работают и оттуда. */}
      <div className={styles.conversationPane} tabIndex={-1} onKeyDown={handleKeyDown}>
        {isEmpty ? (
          <Welcome />
        ) : conversation ? (
          <div ref={feedRef} className={styles.feedArea}>
            <Feed conversation={conversation} items={items} />
            <SelectionMenu areaRef={feedRef} conversation={conversation} items={items} />
          </div>
        ) : null}
        {conversation && (
          <ConversationDock
            project={project}
            conversation={conversation}
            tasks={feed?.tasks ?? []}
            isWorking={isWorking}
          />
        )}
        <Composer project={project} conversation={conversation} draftKey={draftKey} />
        {conversation && <ComposerStatus conversation={conversation} />}
        {conversation && rewindTarget?.conversationId === conversation.id && (
          <RewindDialog
            key={rewindTarget.messageId}
            target={rewindTarget}
            conversation={conversation}
          />
        )}
      </div>
    </PaneKeysContext>
  )
}
