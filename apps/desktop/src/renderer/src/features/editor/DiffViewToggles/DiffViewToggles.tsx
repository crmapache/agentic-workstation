import { Rows2, Columns2, ChevronsDownUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconButton } from '@agentic-workstation/ui/IconButton'

import { useDiffViewStore } from '../diff-view.store'
import styles from './DiffViewToggles.module.scss'

/**
 * Вид разницы, общий для разницы с коммитом и локальной истории: свёрнуто ли неизменённое и
 * две колонки или одна. Выбор один на все разницы и помнится между запусками.
 */
export const DiffViewToggles = () => {
  const { t } = useTranslation()
  const layout = useDiffViewStore((state) => state.layout)
  const collapsed = useDiffViewStore((state) => state.collapsed)
  const setLayout = useDiffViewStore((state) => state.setLayout)
  const toggleCollapsed = useDiffViewStore((state) => state.toggleCollapsed)

  return (
    <>
      <IconButton
        icon={ChevronsDownUp}
        size="sm"
        label={t('editor.diff.collapse')}
        active={collapsed}
        onClick={toggleCollapsed}
      />
      <span role="group" aria-label={t('editor.diff.layout')} className={styles.layout}>
        <IconButton
          icon={Columns2}
          size="sm"
          label={t('editor.diff.sideBySide')}
          active={layout === 'sideBySide'}
          onClick={() => setLayout('sideBySide')}
        />
        <IconButton
          icon={Rows2}
          size="sm"
          label={t('editor.diff.unified')}
          active={layout === 'unified'}
          onClick={() => setLayout('unified')}
        />
      </span>
    </>
  )
}
