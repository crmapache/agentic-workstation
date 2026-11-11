import clsx from 'clsx'

import { ResizeHandle } from '@agentic-workstation/ui/ResizeHandle'

import { ViewStack } from '../ViewStack/ViewStack'
import styles from './SidePanel.module.scss'
import type { SidePanelProps } from './SidePanel.types'

/**
 * Боковая колонка рабочей области: зона 5 (виды вроде дерева файлов) и зона 7 (GUI
 * провайдера LLM, под ним - терминал, ADR 0037). Лист показывает активный вид, остальные
 * открытые держит смонтированными, но скрытыми. Ширину колонки меняет ручка у внутреннего
 * края; колонка стоит, пока открыт лист или то, что под ним (dock).
 */
export const SidePanel = <ViewId extends string>({
  views,
  activeViewId,
  isOpen,
  width,
  minWidth,
  placement,
  resizeLabel,
  dock,
  isDockOpen = false,
  onResize,
  ref,
}: SidePanelProps<ViewId>) => {
  const handleEdge = placement === 'start' ? 'end' : 'start'

  const handleResize = (delta: number) => onResize(placement === 'start' ? delta : -delta)

  return (
    <aside
      ref={ref}
      className={clsx(styles.sidePanel, !isOpen && !isDockOpen && styles.closed)}
      // eslint-disable-next-line no-restricted-syntax -- ширину задают перетаскивание и место в окне
      style={{ width, minWidth }}>
      <div
        className={clsx(styles.sheet, !isOpen && styles.closed)}
        // По нему «открыть панель» узнаёт, что фокус уже в правой панели (actions/claude-panel.ts):
        // лист, а не колонка - фокус в терминале под ним панелью Claude Code не считается.
        data-placement={placement}>
        <ViewStack views={views} activeViewId={activeViewId} isOpen={isOpen} />
      </div>
      {dock}
      <ResizeHandle edge={handleEdge} inGap label={resizeLabel} onResize={handleResize} />
    </aside>
  )
}
