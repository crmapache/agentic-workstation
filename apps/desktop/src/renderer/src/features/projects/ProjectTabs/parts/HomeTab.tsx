import { useTranslation } from 'react-i18next'

import { ClosableTab } from '@agentic-workstation/ui/ClosableTab'

import { IGNORE_CLOSE, HOME_TAB_ICON_SIZE } from '../ProjectTabs.constants'
import type { HomeTabProps } from '../ProjectTabs.types'
import { tabHint } from '../../ProjectTab/ProjectTab.utils'
import { WorkMark } from '../../ProjectTab/parts/WorkMark'
import { displayPath } from '../../../../lib/path.utils'
import { useAppInfo } from '../../../../state/app-info.queries'
import { HOME_ICON } from '../../../../state/project-avatar.constants'

/**
 * Вкладка дома (ADR 0059) в начале ряда проектов: квадрат со знаком дома, всегда на виду - ряд
 * проектов листается без неё. Не закрывается и не перетаскивается. Позвавшие разговоры дома -
 * светом самой вкладки (места под точки в квадрате нет) и строками в подсказке; работа, которая
 * идёт сама, - тем же маленьким спиннером, что у проектов, на месте знака, по центру квадрата.
 */
export const HomeTab = ({ project, isActive, calls, work, onActivate }: HomeTabProps) => {
  const { t } = useTranslation()
  const { data: appInfo } = useAppInfo()
  const latest = calls.at(-1)
  const label = t('projects.home')

  return (
    <ClosableTab
      pinned
      label={label}
      hint={`${label}\n${tabHint(displayPath(project.rootPath, appInfo?.homeDir), work, calls)}`}
      active={isActive}
      closeLabel={label}
      leading={
        work.length > 0 ? (
          <WorkMark work={work} />
        ) : (
          <HOME_ICON size={HOME_TAB_ICON_SIZE} aria-hidden />
        )
      }
      call={latest?.tone ?? null}
      callSince={latest?.at}
      onActivate={() => onActivate(project.id)}
      onClose={IGNORE_CLOSE}
    />
  )
}
