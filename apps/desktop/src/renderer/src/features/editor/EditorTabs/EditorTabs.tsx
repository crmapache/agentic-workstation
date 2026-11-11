import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { tabTarget } from '../../../state/editor-tabs.utils'
import styles from './EditorTabs.module.scss'
import type { EditorTabsProps } from './EditorTabs.types'
import { tabLabels } from './EditorTabs.utils'
import { EditorTab } from './parts/EditorTab'
import { TabMenu } from './parts/TabMenu'

/**
 * Полоса вкладок над редактором: файлы, разница файла с последним коммитом и локальная
 * история, в порядке открытия, ряд за рядом - не влезло в ширину, переносится вниз, как
 * многорядные вкладки WebStorm. Больше тридцати не бывает: новая закрывает самую первую из открытых.
 */
export const EditorTabs = ({ projectId, projectName, keys, active }: EditorTabsProps) => {
  const { t } = useTranslation()
  const [menu, setMenu] = useState<{ key: string; anchor: HTMLElement } | null>(null)
  const targets = useMemo(() => keys.map((key) => ({ key, target: tabTarget(key) })), [keys])
  const labels = useMemo(() => tabLabels(targets.map(({ target }) => target.path)), [targets])

  const handleMenu = (key: string, anchor: HTMLElement) => setMenu({ key, anchor })

  const handleMenuClosed = () => setMenu(null)

  return (
    <div className={styles.editorTabs}>
      <div role="tablist" aria-label={t('editor.tabs.label')} className={styles.tabList}>
        {targets.map(({ key, target }) => (
          <EditorTab
            key={key}
            projectId={projectId}
            tabKey={key}
            target={target}
            // История всего проекта - вкладка без пути: подпись у неё - имя проекта.
            label={(target.path === '' ? projectName : labels.get(target.path)) ?? target.path}
            isActive={key === active}
            onMenu={handleMenu}
          />
        ))}
      </div>
      <TabMenu
        projectId={projectId}
        keys={keys}
        // Вкладку закрыли, пока меню было открыто (файл удалили), - меню уходит вместе с ней.
        target={menu && keys.includes(menu.key) ? menu : null}
        onClose={handleMenuClosed}
      />
    </div>
  )
}
