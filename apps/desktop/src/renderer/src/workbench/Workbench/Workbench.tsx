import { Suspense } from 'react'
import clsx from 'clsx'
import { SquareTerminal } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconButton } from '@agentic-workstation/ui/IconButton'

import { useClaudePanelKey, useClaudePanelToggle } from '../actions/claude-panel'
import { useFileViewOnSelect } from '../actions/file-view'
import { useOpenFile } from '../actions/open-file'
import { usePresence } from '../actions/presence'
import { useTerminalKey, useTerminalToggle } from '../actions/terminal-dock'
import { useWindowCommands } from '../actions/window-commands'
import { ActivityBar } from '../ActivityBar/ActivityBar'
import { Overlays } from '../Overlays/Overlays'
import { SideFooter } from '../SideFooter/SideFooter'
import { SidePanel } from '../SidePanel/SidePanel'
import { TerminalDock } from '../TerminalDock/TerminalDock'
import { TitleBar } from '../TitleBar/TitleBar'
import { CONVERSATION_LOG } from '../views/conversation-log'
import { useViewLists, useGoneViewFallback } from '../views/extension-views'
import { useMainViewBadges } from '../views/main-view-badges'
import { useProjectCalls } from '../views/project-calls'
import { useProjectWork } from '../views/project-work'
import { useProviderCalls } from '../views/provider-calls'
import { PROVIDER_VIEWS } from '../views/provider-views'
import { ShowcaseLayer } from '../views/showcase-view'
import { useSideViewMarks } from '../views/side-view-marks'
import { ViewStack } from '../ViewStack/ViewStack'
import { ConversationLogContext } from '../../state/conversation-log.context'
import { InboxCardContext } from '../../state/inbox-card.context'
import { useArrangement, useLayoutStore } from '../../state/layout.store'
import { OpenFileContext } from '../../state/open-file.context'
import { useVoice } from '../../state/voice.queries'
import { InboxCard } from '../../features/inbox/InboxCard/InboxCard'
import { ProjectTabs } from '../../features/projects/ProjectTabs/ProjectTabs'
import { RemoteButton } from '../../features/remote/RemoteButton/RemoteButton'
import { MemorySaverButton } from '../../features/settings/MemorySaverButton/MemorySaverButton'
import { MuteSoundsButton } from '../../features/settings/MuteSoundsButton/MuteSoundsButton'
import { StatusBar } from '../../features/status-bar/StatusBar/StatusBar'
import { VoiceCallStatus } from '../../features/voice/VoiceCallStatus/VoiceCallStatus'
import { useRoomMeasure } from './Workbench.hooks'
import styles from './Workbench.module.scss'

/**
 * Раскладка окна IDE (docs/architecture.md): 1 шапка (проект, ветка) и под ней вкладки
 * проектов, 2, 3 и 8 полосы переключения видов, 4 строка состояния, 5 левая панель,
 * 6 середина (файл, сценарии, задания, статистика, коннекторы, уведомления), 7 GUI провайдера
 * LLM и терминал под ним;
 * поверх - поиск везде, вопросы и карточки (Overlays) и витрина. Workbench только расставляет зоны, мерит под
 * них место и связывает их с раскладкой; что внутри каждой - решают фичи.
 */
export const Workbench = () => {
  const { t } = useTranslation()
  const side = useLayoutStore((state) => state.side)
  const main = useLayoutStore((state) => state.main)
  const provider = useLayoutStore((state) => state.provider)
  const isTerminalOpen = useLayoutStore((state) => state.terminal.isOpen)
  const selectSideView = useLayoutStore((state) => state.selectSideView)
  const selectMainView = useLayoutStore((state) => state.selectMainView)
  const selectProviderView = useLayoutStore((state) => state.selectProviderView)
  const resizePanel = useLayoutStore((state) => state.resizePanel)
  const arrangement = useArrangement()
  const { rowRef, sideRef, mainRef, providerRef } = useRoomMeasure()
  const openFile = useOpenFile()
  const toggleClaudePanel = useClaudePanelToggle()
  const terminal = useTerminalToggle()
  const views = useViewLists()
  const mainBadges = { ...useMainViewBadges(), ...views.badges }
  const sideMarks = useSideViewMarks()
  const projectCallsOf = useProjectCalls()
  const projectWorkOf = useProjectWork()
  const providerCalls = useProviderCalls()
  const hasVoiceCall = Boolean(useVoice()?.call)

  // ⌘Esc из любой зоны: правая панель с Claude Code и клавиатура в её поле (или спрятать).
  useClaudePanelKey(toggleClaudePanel)
  // ⌥F12, как в WebStorm: терминал под правой панелью и клавиатура в нём (или спрятать).
  useTerminalKey(terminal.toggleFromKeyboard)
  useFileViewOnSelect()
  // Settings… (⌘,) и размер текста (⌘+, ⌘-, ⌘0) из меню приложения.
  useWindowCommands()
  usePresence()
  useGoneViewFallback(views.main, views.side)

  return (
    <OpenFileContext value={openFile}>
      <div className={styles.workbench}>
        <TitleBar />
        <div className={styles.sheets}>
          <ProjectTabs callsOf={projectCallsOf} workOf={projectWorkOf} />

          <div ref={rowRef} className={styles.body}>
            <ActivityBar
              edge="start"
              label={t('sideViews.label')}
              views={views.side}
              marks={sideMarks}
              activeViewId={side.activeViewId}
              isPanelOpen={arrangement.isSideShown}
              footer={<SideFooter />}
              onSelect={selectSideView}
            />
            <SidePanel
              ref={sideRef}
              placement="start"
              views={views.side}
              activeViewId={side.activeViewId}
              isOpen={arrangement.isSideShown}
              width={arrangement.side}
              resizeLabel={t('sideViews.resize')}
              onResize={(delta) => resizePanel('side', delta)}
            />

            <ActivityBar
              edge="start"
              label={t('mainViews.label')}
              views={views.mainBar}
              badges={mainBadges}
              activeViewId={main.activeViewId}
              isPanelOpen={arrangement.isMainShown}
              onSelect={selectMainView}
            />
            <main ref={mainRef} className={styles.main}>
              <div className={clsx(styles.mainSheet, arrangement.isMainShown && styles.mainOpen)}>
                {/* Виды середины показывают разговор провайдера его лентой, а прогон задания - свой вопрос карточкой уведомления. */}
                <ConversationLogContext value={CONVERSATION_LOG}>
                  <InboxCardContext value={InboxCard}>
                    <ViewStack
                      views={views.main}
                      activeViewId={main.activeViewId}
                      isOpen={arrangement.isMainShown}
                    />
                  </InboxCardContext>
                </ConversationLogContext>
              </div>
            </main>

            <SidePanel
              ref={providerRef}
              placement="end"
              views={PROVIDER_VIEWS}
              activeViewId={provider.activeViewId}
              isOpen={provider.isOpen}
              width={arrangement.provider}
              resizeLabel={t('providerViews.resize')}
              dock={<TerminalDock isOpen={isTerminalOpen} fills={!provider.isOpen} />}
              isDockOpen={isTerminalOpen}
              onResize={(delta) => resizePanel('provider', delta)}
            />
            <ActivityBar
              edge="end"
              label={t('providerViews.label')}
              views={PROVIDER_VIEWS}
              calls={providerCalls}
              activeViewId={provider.activeViewId}
              isPanelOpen={provider.isOpen}
              footer={
                <IconButton
                  icon={SquareTerminal}
                  label={t('terminal.toggle')}
                  active={isTerminalOpen}
                  tooltipPlacement="start"
                  onClick={terminal.toggle}
                />
              }
              onSelect={selectProviderView}
            />

            {ShowcaseLayer && (
              <Suspense fallback={null}>
                <ShowcaseLayer />
              </Suspense>
            )}
          </div>

          <StatusBar
            items={[
              <RemoteButton />,
              <MuteSoundsButton />,
              <MemorySaverButton />,
              // Звонок - последним и только пока идёт: место соседей (их ключ) не сдвигается.
              ...(hasVoiceCall ? [<VoiceCallStatus />] : []),
            ]}
          />
        </div>

        <Overlays />
      </div>
    </OpenFileContext>
  )
}
