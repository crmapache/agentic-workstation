import { X, History, Palette, Smartphone, ArrowRightLeft, SquareTerminal } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { MAIN_VIEWS } from '../views/main-views'
import { toggleShowcase } from '../views/showcase-view'
import { SIDE_VIEWS } from '../views/side-views'
import { AI_ICON } from '../../lib/ai-icon.constants'
import { useLayoutStore } from '../../state/layout.store'
import { useWorkspace, useActiveProject, useWorkspaceActions } from '../../state/workspace.queries'
import { OPEN_PANEL_KEY } from '../../features/claude-code/panel-keys.constants'
import {
  GIT_BRANCH_ACTIONS,
  GIT_REPOSITORY_ACTIONS,
} from '../../features/git/git-actions.constants'
import { useGitActionRunner } from '../../features/git/git-actions.hooks'
import { availableActions } from '../../features/git/git-actions.utils'
import { useGitHead } from '../../features/git/git.queries'
import { PROJECT_ACTIONS } from '../../features/projects/project-actions.constants'
import { useProjectActionRunner } from '../../features/projects/project-actions.hooks'
import { useRemoteStore } from '../../features/remote/remote.store'
import type { SearchAction } from '../../features/search-everywhere/search-everywhere.types'
import { useClaudePanelToggle } from './claude-panel'
import { useSettingsActions } from './settings-actions'
import { useTerminalToggle } from './terminal-dock'
import { TERMINAL_KEY } from './terminal-dock.constants'

/**
 * Действия IDE для поиска везде. Собраны здесь, а не в поиске: им нужны проекты, git
 * и раскладка сразу, а связывать фичи между собой - дело workbench. Действия проекта
 * и git берутся из тех же описаний, что рисуют их меню: подпись и иконка не разойдутся.
 * Действия git - только у репозитория и не во время pull, переход в проект - только к
 * не активному.
 */
export const useIdeActions = (): SearchAction[] => {
  const { t } = useTranslation()
  const { data: workspace } = useWorkspace()
  const project = useActiveProject()
  const { data: head } = useGitHead(project?.id)
  const { closeProject, activateProject, openRecentProject } = useWorkspaceActions()
  const runProjectAction = useProjectActionRunner()
  const gitRunner = useGitActionRunner(project?.id ?? '')
  const selectSideView = useLayoutStore((state) => state.selectSideView)
  const selectMainView = useLayoutStore((state) => state.selectMainView)
  const toggleClaudePanel = useClaudePanelToggle()
  const terminal = useTerminalToggle()
  const settingsActions = useSettingsActions()
  const openRemote = useRemoteStore((state) => state.open)

  const projectActions: SearchAction[] = PROJECT_ACTIONS.map((entry) => ({
    id: `project.${entry.id}`,
    label: t(entry.labelKey),
    icon: entry.icon,
    shortcut: entry.shortcut,
    keywords: entry.keywords,
    run: () => runProjectAction(entry.id),
  }))

  const workspaceActions: SearchAction[] = [
    ...(project
      ? [
          {
            id: 'project.close',
            label: t('searchEverywhere.actions.closeProject', { name: project.name }),
            icon: X,
            run: () => closeProject(project.id),
          },
        ]
      : []),
    ...(workspace?.projects ?? [])
      .filter((other) => other.id !== project?.id)
      .map((other) => ({
        id: `project.switch:${other.id}`,
        label: t('searchEverywhere.actions.switchProject', { name: other.name }),
        icon: ArrowRightLeft,
        run: () => activateProject(other.id),
      })),
  ]

  // Пока идёт pull, ни переключать ветку, ни пушить нельзя: pull потом перемотал бы
  // уже новый HEAD. Меню ветки в это время заблокировано, поиск ведёт себя так же.
  const gitActions: SearchAction[] =
    head && !gitRunner.isBusy
      ? availableActions([...GIT_REPOSITORY_ACTIONS, ...GIT_BRANCH_ACTIONS]).map((entry) => ({
          id: `git.${entry.id}`,
          label: t(entry.labelKey),
          icon: entry.icon,
          keywords: entry.keywords,
          run: () => gitRunner.run(entry.id),
        }))
      : []

  const viewActions: SearchAction[] = [
    // Виды левой панели и середины берутся из реестров полос: подпись и иконка не разойдутся.
    ...SIDE_VIEWS.map((view) => ({
      id: `view.side.${view.id}`,
      label: t('searchEverywhere.actions.toggleView', { name: t(view.labelKey) }),
      icon: view.icon,
      run: () => selectSideView(view.id),
    })),
    ...MAIN_VIEWS.map((view) => ({
      id: `view.main.${view.id}`,
      label: t('searchEverywhere.actions.toggleView', { name: t(view.labelKey) }),
      icon: view.icon,
      keywords: view.keywords,
      run: () => selectMainView(view.id),
    })),
    {
      id: 'view.claudeCode',
      label: t('searchEverywhere.actions.toggleClaudeCode'),
      icon: AI_ICON,
      // Та же дверь, что у клавиши: показать с клавиатурой в поле или спрятать из панели.
      shortcut: OPEN_PANEL_KEY.join(''),
      run: toggleClaudePanel,
    },
    {
      id: 'ide.remoteControl',
      label: t('searchEverywhere.actions.remoteControl'),
      icon: Smartphone,
      keywords: ['phone', 'mobile', 'relay', 'pair', 'qr'],
      run: openRemote,
    },
    {
      id: 'view.terminal',
      label: t('searchEverywhere.actions.toggleTerminal'),
      icon: SquareTerminal,
      keywords: ['shell', 'console', 'zsh'],
      shortcut: TERMINAL_KEY.join(''),
      run: terminal.toggleFromKeyboard,
    },
    // Витрина есть только в dev и в копии окна агента, в релизе нет и действия.
    ...(toggleShowcase
      ? [
          {
            id: 'view.designSystem',
            label: t('searchEverywhere.actions.toggleDesignSystem'),
            icon: Palette,
            keywords: ['showcase', 'tokens', 'components'],
            run: toggleShowcase,
          },
        ]
      : []),
  ]

  const recentActions: SearchAction[] = (workspace?.recentProjects ?? []).map((recent) => ({
    id: `project.recent:${recent.rootPath}`,
    label: t('searchEverywhere.actions.openRecent', { name: recent.name }),
    icon: History,
    run: () => openRecentProject(recent.rootPath),
  }))

  return [
    ...projectActions,
    ...workspaceActions,
    ...gitActions,
    ...viewActions,
    ...settingsActions,
    ...recentActions,
  ]
}
