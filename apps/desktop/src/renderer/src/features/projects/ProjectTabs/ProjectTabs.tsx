import { useTranslation } from 'react-i18next'

import { ProjectTab } from '../ProjectTab/ProjectTab'
import { NO_WORK, NO_CALLS } from '../ProjectTab/ProjectTab.constants'
import { useTabDrag } from '../../../lib/tab-drag.hooks'
import { useWheelToSide } from '../../../lib/wheel-to-side.hooks'
import { useWorkspace, useWorkspaceActions } from '../../../state/workspace.queries'
import styles from './ProjectTabs.module.scss'
import type { ProjectTabsProps } from './ProjectTabs.types'
import { HomeTab } from './parts/HomeTab'

/**
 * Строка вкладок открытых проектов под шапкой: первой - дом (ADR 0059), закреплённый квадрат
 * ровно над кнопками полосы видов под ним, за ним проекты делят ширину окна поровну, а не влезли на своём минимуме (узкое окно, много
 * проектов) - ряд проектов листается вбок, колесом тоже, а дом остаётся на месте. Сама полоса
 * стоит всегда, даже до загрузки списка, - иначе первый ответ сдвигал бы всё окно вниз. Открыть
 * проект - переключатель в шапке. У каждой вкладки - точки разговоров проекта, которые позвали
 * человека (callsOf), и знак работы, которая в нём идёт сама (workOf). Порядок проектов меняют
 * перетаскиванием (useTabDrag), дом не двигается.
 */
export const ProjectTabs = ({ callsOf, workOf }: ProjectTabsProps) => {
  const { t } = useTranslation()
  const { data } = useWorkspace()
  const { closeProject, activateProject, moveProject } = useWorkspaceActions()
  const attachWheel = useWheelToSide()
  const all = data?.projects ?? []
  const home = all.find((project) => project.home)
  const projects = all.filter((project) => !project.home)
  const drag = useTabDrag(
    projects.map((project) => project.id),
    moveProject,
  )
  const { view } = drag

  return (
    <div className={styles.projectTabs}>
      {all.length > 0 && (
        <div role="tablist" aria-label={t('projects.tabsLabel')} className={styles.tabs}>
          {home && (
            <div className={styles.homeSlot}>
              <HomeTab
                project={home}
                isActive={home.id === data?.activeProjectId}
                calls={callsOf?.(home.rootPath) ?? NO_CALLS}
                work={workOf?.(home.rootPath) ?? NO_WORK}
                onActivate={activateProject}
              />
            </div>
          )}
          {projects.length > 0 && (
            <div
              ref={attachWheel}
              className={styles.tabList}
              data-tab-row=""
              data-landing={drag.isLanding ? '' : undefined}>
              {projects.map((project) => (
                <ProjectTab
                  key={project.id}
                  project={project}
                  isActive={project.id === data?.activeProjectId}
                  calls={callsOf?.(project.rootPath) ?? NO_CALLS}
                  work={workOf?.(project.rootPath) ?? NO_WORK}
                  lifted={view.draggedId === project.id}
                  offset={
                    view.draggedId === project.id ? view.offset : (view.shifts[project.id] ?? null)
                  }
                  register={drag.register}
                  onPress={drag.onPress}
                  onActivate={activateProject}
                  onClose={closeProject}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
