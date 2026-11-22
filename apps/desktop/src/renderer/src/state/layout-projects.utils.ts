import {
  MAIN_VIEW_IDS,
  SIDE_VIEW_IDS,
  PROVIDER_VIEW_IDS,
  DEFAULT_PROJECT_VIEWS,
} from './layout.constants'
import type { Layout, ProjectViews, ProjectLayouts } from './layout.types'
import { asRecord, restoreArea } from './layout.utils'

/** Виды проекта из раскладки на экране: что выбрано и что развёрнуто, без ширин. */
export const viewsOf = ({ side, main, provider, terminal }: Layout): ProjectViews => ({
  side: { activeViewId: side.activeViewId, isOpen: side.isOpen },
  main: { activeViewId: main.activeViewId, isOpen: main.isOpen },
  provider: { activeViewId: provider.activeViewId, isOpen: provider.isOpen },
  terminal: { isOpen: terminal.isOpen },
})

/** Раскладка с видами проекта; ширины панелей и доля терминала остаются те, что были. */
const withViews = (layout: Layout, views: ProjectViews): Layout => ({
  side: { ...layout.side, ...views.side },
  main: { ...views.main },
  provider: { ...layout.provider, ...views.provider },
  terminal: { ...layout.terminal, ...views.terminal },
})

/**
 * Раскладка после перехода в проект projectId: виды проекта, откуда ушли, откладываются под
 * его id, а на экран встают виды нового - у проекта, где человек ещё не был, по умолчанию.
 * Ничья раскладка (первый запуск после версии без проектов) достаётся проекту как есть:
 * обновление не должно перекладывать окно. Тот же проект - то же состояние.
 */
export const switchedProject = (state: ProjectLayouts, projectId: string): ProjectLayouts => {
  if (state.projectId === projectId) return state
  if (state.projectId === null) return { ...state, projectId }

  const { [projectId]: views = DEFAULT_PROJECT_VIEWS, ...others } = state.viewsByProject

  return {
    ...withViews(state, views),
    projectId,
    viewsByProject: { ...others, [state.projectId]: viewsOf(state) },
  }
}

/**
 * Виды только открытых проектов: закрытый, открытый заново, получит новый id, и старые виды
 * не нашлись бы никогда. Никого не убрали - тот же объект.
 */
export const keptProjects = (
  viewsByProject: Record<string, ProjectViews>,
  projectIds: readonly string[],
): Record<string, ProjectViews> => {
  const open = new Set(projectIds)
  const kept = Object.entries(viewsByProject).filter(([projectId]) => open.has(projectId))

  return kept.length === Object.keys(viewsByProject).length
    ? viewsByProject
    : Object.fromEntries(kept)
}

const restoreViews = (saved: unknown): ProjectViews => {
  const { side, main, provider, terminal } = asRecord(saved)
  const { isOpen } = asRecord(terminal)

  return {
    side: restoreArea(side, DEFAULT_PROJECT_VIEWS.side, SIDE_VIEW_IDS),
    main: restoreArea(main, DEFAULT_PROJECT_VIEWS.main, MAIN_VIEW_IDS),
    provider: restoreArea(provider, DEFAULT_PROJECT_VIEWS.provider, PROVIDER_VIEW_IDS),
    terminal: {
      isOpen: typeof isOpen === 'boolean' ? isOpen : DEFAULT_PROJECT_VIEWS.terminal.isOpen,
    },
  }
}

/**
 * Проекты раскладки из localStorage: чья она и виды остальных проектов, каждый проверен, как
 * раскладка (restoreLayout). Раскладка от версии без проектов - ничья и без видов.
 */
export const restoreProjects = (
  persisted: unknown,
): Pick<ProjectLayouts, 'projectId' | 'viewsByProject'> => {
  const { projectId, viewsByProject } = asRecord(persisted)

  return {
    projectId: typeof projectId === 'string' ? projectId : null,
    viewsByProject: Object.fromEntries(
      Object.entries(asRecord(viewsByProject)).map(([id, views]) => [id, restoreViews(views)]),
    ),
  }
}
