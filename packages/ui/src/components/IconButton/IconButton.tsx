import clsx from 'clsx'

import { CallLight } from '../CallLight/CallLight'
import { Spinner } from '../Spinner/Spinner'
import { Tooltip } from '../Tooltip/Tooltip'
import { ICON_SIZE, BUSY_SPINNER_SIZE, ICON_STROKE_WIDTH } from './IconButton.constants'
import styles from './IconButton.module.scss'
import type { IconButtonProps } from './IconButton.types'

/**
 * Кнопка только с иконкой: переключатели видов в боковых полосах, закрытие вкладки,
 * «открыть проект», отправка сообщения (primary). Подпись обязательна - это и
 * подсказка, и имя для скринридера. Недоступная, которая объясняет почему, -
 * aria-disabled вместо disabled: подсказка всплывает, нажатие ничего не делает.
 * call - свет позвавшего (CallLight): в полосе иконок так горит вид, где кто-то позвал человека.
 * busy - идёт работа по нажатию: на месте иконки Spinner. Кнопка с текстом - Button.
 */
export const IconButton = ({
  icon: Icon,
  label,
  size = 'md',
  variant = 'ghost',
  active,
  tooltipPlacement,
  call,
  callSince,
  busy = false,
  type = 'button',
  onClick,
  ...rest
}: IconButtonProps) => {
  const isUnavailable = rest['aria-disabled'] === true || rest['aria-disabled'] === 'true'

  return (
    <Tooltip label={label} placement={tooltipPlacement}>
      <button
        type={type}
        aria-label={label}
        aria-pressed={active}
        aria-busy={busy || undefined}
        className={clsx(
          styles.iconButton,
          styles[size],
          styles[variant],
          active && styles.active,
          call && styles.calling,
        )}
        data-call={call ?? undefined}
        onClick={isUnavailable ? undefined : onClick}
        {...rest}>
        {call !== undefined && <CallLight call={call} since={callSince} />}
        {busy ? (
          <Spinner size={BUSY_SPINNER_SIZE[size]} tone="neutral" />
        ) : (
          <Icon size={ICON_SIZE[size]} strokeWidth={ICON_STROKE_WIDTH} aria-hidden />
        )}
      </button>
    </Tooltip>
  )
}
