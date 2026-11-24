import { useTranslation } from 'react-i18next'

import { useBarMenu } from './ActivityBar.hooks'
import styles from './ActivityBar.module.scss'
import type { ActivityBarProps } from './ActivityBar.types'
import { barButtons } from './ActivityBar.utils'
import { BarGroupRow } from './parts/BarGroupRow'
import { BarMenu } from './parts/BarMenu'

/**
 * Вертикальная полоса иконок: зона 2 переключает виды левой панели, зона 3 - GUI
 * провайдеров LLM справа, зона 8 - виды середины окна. Один компонент на все три.
 * Подсказка встаёт в сторону от края полосы, чтобы не закрыть соседние иконки. Внизу
 * полосы - виды, которые открывают изредка (коннекторы, расширения, уведомления), и то, что
 * открывается под областью (терминал под панелью провайдера, ADR 0037).
 * На углу иконки - число того, что ждёт человека, или, когда его нет, точка: у вида что-то
 * изменилось. Вид, где кто-то позвал человека, горит светом зова, пока его не покажут.
 * Кнопки перетаскиваются внутри своей группы (виды или низ) и прячутся правой кнопкой; вернуть -
 * галочкой там же или в меню View (ADR 0112).
 */
export const ActivityBar = <ViewId extends string>(props: ActivityBarProps<ViewId>) => {
  const { t } = useTranslation()
  const { anchor, setAnchor, point, openId, close, onContextMenu } = useBarMenu()
  const { bar, edge, label } = props
  const groups = barButtons(props, t)
  const tooltipPlacement = edge === 'start' ? 'end' : 'start'

  return (
    <nav aria-label={label} className={styles.activityBar} onContextMenu={onContextMenu}>
      <BarGroupRow bar={bar} group="top" buttons={groups.top} tooltipPlacement={tooltipPlacement} />
      {groups.bottom.length > 0 && (
        <BarGroupRow
          bar={bar}
          group="bottom"
          buttons={groups.bottom}
          tooltipPlacement={tooltipPlacement}
        />
      )}
      <span
        ref={setAnchor}
        className={styles.anchor}
        // eslint-disable-next-line no-restricted-syntax -- якорь меню встаёт в точку нажатия
        style={point ?? undefined}
      />
      {openId !== undefined && anchor && (
        <BarMenu
          bar={bar}
          label={label}
          groups={groups}
          targetId={openId}
          anchor={anchor}
          onClose={close}
        />
      )}
    </nav>
  )
}
