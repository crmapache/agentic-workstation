import { Suspense } from 'react'
import clsx from 'clsx'
import { SquareTerminal } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconButton } from '@agentic-workstation/ui/IconButton'

import { ActionNotice } from '../ActionNotice/ActionNotice'
import { useClaudePanelKey, useClaudePanelToggle } from '../actions/claude-panel'
import { useFileViewOnSelect } from '../actions/file-view'
import { useOpenFile } from '../actions/open-file'
import { usePresence } from '../actions/presence'
import { useTerminalKey, useTerminalToggle } from '../actions/terminal-dock'
import { useWindowCommands } from '../actions/window-commands'
import { ActivityBar } from '../ActivityBar/ActivityBar'
import { NotificationArea } from '../NotificationArea/NotificationArea'
import { SearchLayer } from '../SearchLayer/SearchLayer'
import { SidePanel } from '../SidePanel/SidePanel'
import { TerminalDock } from '../TerminalDock/TerminalDock'
import { TitleBar } from '../TitleBar/TitleBar'
import { CONVERSATION_LOG } from '../views/conversation-log'
import { useMainViewBadges } from '../views/main-view-badges'
import { MAIN_VIEWS } from '../views/main-views'
import { PROVIDER_VIEWS } from '../views/provider-views'
import { ShowcaseLayer } from '../views/showcase-view'
import { SIDE_VIEWS } from '../views/side-views'
import { ViewStack } from '../ViewStack/ViewStack'
import { ConversationLogContext } from '../../state/conversation-log.context'
import { PANEL_MIN_WIDTH } from '../../state/layout.constants'
import { useArrangement, useLayoutStore } from '../../state/layout.store'
import { OpenFileContext } from '../../state/open-file.context'
import { DiscardDialog } from '../../features/editor/DiscardDialog/DiscardDialog'
import { ProjectTabs } from '../../features/projects/ProjectTabs/ProjectTabs'
import { RemoteButton } from '../../features/remote/RemoteButton/RemoteButton'
import { RemoteModal } from '../../features/remote/RemoteModal/RemoteModal'
import { ScenarioNotice } from '../../features/scenarios/ScenarioNotice/ScenarioNotice'
import { SettingsDialog } from '../../features/settings/SettingsDialog/SettingsDialog'
import { StatusBar } from '../../features/status-bar/StatusBar/StatusBar'
import { UpdateNotice } from '../../features/updates/UpdateNotice/UpdateNotice'
import { useRoomMeasure } from './Workbench.hooks'
import styles from './Workbench.module.scss'

/**
 * Раскладка окна IDE (docs/architecture.md): 1 шапка (проект, ветка) и под ней вкладки
 * проектов, 2, 3 и 8 полосы переключения видов, 4 строка состояния, 5 левая панель,
 * 6 середина (файл, сценарии, статистика), 7 GUI провайдера LLM и терминал под ним;
 * поверх - поиск везде, настройки, Remote Control и витрина. Workbench только расставляет зоны, мерит под
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
  const mainBadges = useMainViewBadges()

  // ⌘Esc из любой зоны: правая панель с Claude Code и клавиатура в её поле (или спрятать).
  useClaudePanelKey(toggleClaudePanel)
  // ⌥F12, как в WebStorm: терминал под правой панелью и клавиатура в нём (или спрятать).
  useTerminalKey(terminal.toggleFromKeyboard)
  useFileViewOnSelect()
  // Settings… (⌘,) и размер текста (⌘+, ⌘-, ⌘0) из меню приложения.
  useWindowCommands()
  usePresence()

  return (
    <OpenFileContext value={openFile}>
      <div className={styles.workbench}>
        <TitleBar />
        <div className={styles.sheets}>
          <ProjectTabs />

          <div ref={rowRef} className={styles.body}>
            <ActivityBar
              edge="start"
              label={t('sideViews.label')}
              views={SIDE_VIEWS}
              activeViewId={side.activeViewId}
              isPanelOpen={side.isOpen}
              onSelect={selectSideView}
            />
            <SidePanel
              ref={sideRef}
              placement="start"
              views={SIDE_VIEWS}
              activeViewId={side.activeViewId}
              isOpen={side.isOpen}
              width={arrangement.side}
              minWidth={PANEL_MIN_WIDTH.side}
              resizeLabel={t('sideViews.resize')}
              onResize={(delta) => resizePanel('side', delta)}
            />

            <ActivityBar
              edge="start"
              label={t('mainViews.label')}
              views={MAIN_VIEWS}
              badges={mainBadges}
              activeViewId={main.activeViewId}
              isPanelOpen={arrangement.isMainShown}
              onSelect={selectMainView}
            />
            <main ref={mainRef} className={styles.main}>
              <div className={clsx(styles.mainSheet, arrangement.isMainShown && styles.mainOpen)}>
                {/* Виды середины (журнал шага сценария) показывают разговор провайдера его лентой. */}
                <ConversationLogContext value={CONVERSATION_LOG}>
                  <ViewStack
                    views={MAIN_VIEWS}
                    activeViewId={main.activeViewId}
                    isOpen={arrangement.isMainShown}
                  />
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
              minWidth={PANEL_MIN_WIDTH.provider}
              resizeLabel={t('providerViews.resize')}
              dock={<TerminalDock isOpen={isTerminalOpen} fills={!provider.isOpen} />}
              isDockOpen={isTerminalOpen}
              onResize={(delta) => resizePanel('provider', delta)}
            />
            <ActivityBar
              edge="end"
              label={t('providerViews.label')}
              views={PROVIDER_VIEWS}
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

          <StatusBar items={<RemoteButton />} />
        </div>

        <SearchLayer />
        <DiscardDialog />
        <SettingsDialog />
        <RemoteModal />

        <NotificationArea>
          <UpdateNotice />
          <ActionNotice />
          <ScenarioNotice />
        </NotificationArea>
      </div>
    </OpenFileContext>
  )
}
