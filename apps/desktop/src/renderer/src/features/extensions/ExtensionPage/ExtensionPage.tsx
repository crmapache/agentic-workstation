import { useTranslation } from 'react-i18next'

import { EmptyState } from '@agentic-workstation/ui/EmptyState'
import { PageHeader } from '@agentic-workstation/ui/PageHeader'

import { ExtensionSurface } from '../ExtensionSurface/ExtensionSurface'
import { extensionIcon } from '../../../lib/extension-icons'
import { useExtensions, useExtensionViewTrees } from '../../../state/extensions.queries'
import styles from './ExtensionPage.module.scss'
import type { ExtensionPageProps } from './ExtensionPage.types'

/**
 * Вид расширения целиком (ADR 0091): шапка вида IDE с его иконкой и именем и дерево узлов под
 * ней. В левой панели шапка меньше, как у дерева файлов.
 */
export const ExtensionPage = ({ viewKey }: ExtensionPageProps) => {
  const { t } = useTranslation()
  const { data } = useExtensions()
  const { data: trees } = useExtensionViewTrees()
  const view = data?.extensions
    .flatMap((item) => item.contributions.views)
    .find((item) => item.key === viewKey)

  if (!view) return null

  return (
    <div className={styles.page}>
      <PageHeader
        size={view.place === 'side' ? 'sm' : 'md'}
        icon={extensionIcon(view.icon)}
        title={view.title}
      />
      <div className={styles.scroller}>
        <div className={styles.content}>
          {trees?.[viewKey]?.tree ? (
            <ExtensionSurface viewKey={viewKey} />
          ) : (
            <EmptyState icon={extensionIcon(view.icon)} title={t('extensions.view.empty')} />
          )}
        </div>
      </div>
    </div>
  )
}
