import { IconButton } from '@agentic-workstation/ui/IconButton'

import styles from '../WalkthroughPanel.module.scss'
import type { ToolButtonProps } from '../WalkthroughPanel.types'

/**
 * Кнопка панели: значок и подпись под ним. Подсказка над значком в окне шириной с панель не
 * всплывёт - поэтому подпись видна всегда; имя для скринридера - у самой кнопки.
 */
export const ToolButton = ({
  icon,
  label,
  active = false,
  disabled = false,
  onPress,
}: ToolButtonProps) => (
  <div className={styles.tool}>
    <IconButton
      icon={icon}
      label={label}
      variant={active ? 'primary' : 'ghost'}
      active={active}
      aria-disabled={disabled}
      onClick={onPress}
    />
    <span className={disabled ? styles.captionOff : styles.caption} aria-hidden>
      {label}
    </span>
  </div>
)
