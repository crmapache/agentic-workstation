import { Puzzle, Sparkles, FolderOpen } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { PageHeader } from '@agentic-workstation/ui/PageHeader'
import { Tabs } from '@agentic-workstation/ui/Tabs'

import { useExtensionActions } from '../extensions.actions'
import { useExtensionsStore } from '../extensions.store'
import { ExtensionsModals } from '../ExtensionsModals/ExtensionsModals'
import { StorePage } from '../StorePage/StorePage'
import { useExtensions } from '../../../state/extensions.queries'
import styles from './ExtensionsView.module.scss'
import { ExtensionsHelp } from './parts/ExtensionsHelp'
import { InstalledPage } from './parts/InstalledPage'

/**
 * Вид Extensions в середине окна (ADR 0091): свои расширения плитками и магазин. Новое
 * расширение пишет ИИ разговором в папке расширения; подробности, права и настройки - окном.
 */
export const ExtensionsView = () => {
  const { t } = useTranslation()
  const { data } = useExtensions()
  const tab = useExtensionsStore((store) => store.tab)
  const setTab = useExtensionsStore((store) => store.setTab)
  const open = useExtensionsStore((store) => store.open)
  const actions = useExtensionActions()

  if (!data) return null

  return (
    <div className={styles.view}>
      <PageHeader
        icon={Puzzle}
        title={t('extensions.title')}
        help={<ExtensionsHelp />}
        actions={
          <div className={styles.actions}>
            <Button
              variant="ghost"
              size="sm"
              icon={FolderOpen}
              onClick={() => void actions.reveal(null)}>
              {t('extensions.openFolder')}
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={Sparkles}
              onClick={() => open({ kind: 'new' })}>
              {t('extensions.newExtension')}
            </Button>
          </div>
        }
        toolbar={
          <Tabs
            label={t('extensions.tabs.label')}
            value={tab}
            items={[
              {
                id: 'installed',
                label: t('extensions.tabs.installed'),
                count: data.extensions.length || undefined,
              },
              { id: 'store', label: t('extensions.tabs.store') },
            ]}
            onChange={setTab}
          />
        }
      />
      <div className={styles.scroller}>
        <div className={styles.page}>
          {tab === 'installed' ? <InstalledPage state={data} /> : <StorePage installed={data} />}
        </div>
      </div>
      <ExtensionsModals state={data} />
    </div>
  )
}
