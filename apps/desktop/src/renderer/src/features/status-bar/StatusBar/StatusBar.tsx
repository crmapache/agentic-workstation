import { Fragment } from 'react'
import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

import { Tooltip } from '@agentic-workstation/ui/Tooltip'

import { ResourceUsage } from '../ResourceUsage/ResourceUsage'
import { StatusDivider } from '../StatusDivider/StatusDivider'
import { useCopy } from '../../../lib/clipboard.hooks'
import { useAppInfo } from '../../../state/app-info.queries'
import { useSelectedPath } from '../../../state/selection.store'
import { useActiveProject } from '../../../state/workspace.queries'
import styles from './StatusBar.module.scss'
import type { StatusBarProps } from './StatusBar.types'
import { statusPath } from './StatusBar.utils'

/**
 * Зона 4: строка состояния. Слева - путь открытого файла (от проекта, а файл вне проекта -
 * своим путём через ~), нажатие копирует его полный путь; справа - кнопки других фич (items),
 * процессор и память IDE и её версия, через черту и с одинаковыми полями.
 */
export const StatusBar = ({ items = [] }: StatusBarProps) => {
  const { t } = useTranslation()
  const project = useActiveProject()
  const selectedFile = useSelectedPath(project?.id)
  const { data: appInfo } = useAppInfo()
  const { isCopied, copy } = useCopy()
  const path = project && statusPath(project, selectedFile, appInfo?.homeDir)

  const handleCopy = () => {
    if (path) copy(path.full)
  }

  return (
    <footer className={styles.statusBar}>
      <div className={styles.pathCell}>
        {path && (
          <Tooltip
            label={isCopied ? t('statusBar.pathCopied') : t('statusBar.copyPath')}
            placement="top">
            <button
              type="button"
              className={clsx(styles.path, isCopied && styles.copied)}
              onClick={handleCopy}>
              {path.shown}
            </button>
          </Tooltip>
        )}
      </div>
      <div className={styles.segments}>
        {/* Кнопки фич стоят по порядку и не меняются - ключом им служит место. */}
        {items.map((item, index) => (
          <Fragment key={index}>
            {item}
            <StatusDivider />
          </Fragment>
        ))}
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
