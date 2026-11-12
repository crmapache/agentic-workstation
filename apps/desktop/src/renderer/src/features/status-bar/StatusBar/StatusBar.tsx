import { useTranslation } from 'react-i18next'

import { ResourceUsage } from '../ResourceUsage/ResourceUsage'
import { StatusDivider } from '../StatusDivider/StatusDivider'
import { displayPath, isOutsidePath } from '../../../lib/path.utils'
import { useAppInfo } from '../../../state/app-info.queries'
import { useSelectedPath } from '../../../state/selection.store'
import { useActiveProject } from '../../../state/workspace.queries'
import styles from './StatusBar.module.scss'
import type { StatusBarProps } from './StatusBar.types'

/**
 * Зона 4: строка состояния. Слева - путь открытого файла (от проекта, а файл вне проекта -
 * своим путём через ~), справа - кнопки других фич (items), процессор и память IDE и её версия,
 * через черту и с одинаковыми полями.
 */
export const StatusBar = ({ items }: StatusBarProps) => {
  const { t } = useTranslation()
  const project = useActiveProject()
  const selectedFile = useSelectedPath(project?.id)
  const { data: appInfo } = useAppInfo()
  const path =
    project && selectedFile
      ? isOutsidePath(selectedFile)
        ? displayPath(selectedFile, appInfo?.homeDir)
        : `${project.name}/${selectedFile}`
      : project?.name

  return (
    <footer className={styles.statusBar}>
      <span className={styles.path}>{path}</span>
      <div className={styles.segments}>
        {items}
        <StatusDivider />
        <ResourceUsage />
        <StatusDivider />
        {appInfo && (
          <span className={styles.version}>
            {t('statusBar.version', { version: appInfo.version })}
          </span>
        )}
      </div>
    </footer>
  )
}
