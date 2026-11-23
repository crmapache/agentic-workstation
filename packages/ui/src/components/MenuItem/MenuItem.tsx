import type { MouseEvent } from 'react'
import clsx from 'clsx'
import { ChevronRight } from 'lucide-react'

import { ChoiceMark } from '../ChoiceMark/ChoiceMark'
import { MENU_ICON_SIZE, MENU_ITEM_ROLE, MENU_ICON_STROKE_WIDTH } from './MenuItem.constants'
import styles from './MenuItem.module.scss'
import type { MenuItemProps } from './MenuItem.types'

/**
 * Пункт меню: иконка или значок, подпись, по желанию вторая строка и подсказка
 * справа (объяснение во второй строке - с переносом, wrapDescription). Выбор закрывает
 * всплывающую панель, в которой пункт стоит (с keepOpen - нет: дальше следующий шаг). С selection -
 * вариант выбора с отметкой (вопрос с вариантами ответа). С iconTone и chevron -
 * строка бокового меню: иконка в плитке, значение справа, стрелка на следующий экран. С expanded -
 * пункт, за которым меню сбоку (его ставит MenuSubmenu).
 */
export const MenuItem = ({
  label,
  description,
  wrapDescription = false,
  icon: Icon,
  leading,
  current = false,
  disabled = false,
  hint,
  hintTone,
  iconTone,
  chevron = false,
  selection,
  checked = false,
  keepOpen = false,
  expanded,
  onSelect,
}: MenuItemProps) => {
  const opensMenu = expanded !== undefined

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (selection !== 'multiple' && !keepOpen && !opensMenu)
      event.currentTarget.closest<HTMLElement>('[popover]')?.hidePopover()
    onSelect()
  }

  const mark = selection && (
    <ChoiceMark shape={selection === 'single' ? 'circle' : 'square'} checked={checked} />
  )
  const visual =
    mark ??
    leading ??
    (Icon ? (
      <Icon size={MENU_ICON_SIZE} strokeWidth={MENU_ICON_STROKE_WIDTH} aria-hidden />
    ) : (
      <span className={styles.placeholder} />
    ))

  return (
    <button
      type="button"
      role={selection ? MENU_ITEM_ROLE[selection] : 'menuitem'}
      disabled={disabled}
      aria-current={current || undefined}
      aria-checked={selection ? checked : undefined}
      aria-haspopup={opensMenu ? 'menu' : undefined}
      aria-expanded={expanded}
      className={clsx(
        styles.menuItem,
        (current || (selection && checked)) && styles.current,
        expanded && styles.expanded,
      )}
      onClick={handleClick}>
      <span className={clsx(styles.visual, iconTone && [styles.tile, styles[iconTone]])}>
        {visual}
      </span>
      <span className={styles.text}>
        <span className={styles.label}>{label}</span>
        {description && (
          <span className={clsx(styles.description, wrapDescription && styles.wrap)}>
            {description}
          </span>
        )}
      </span>
      {hint && (
        <span className={clsx(styles.hint, hintTone && [styles.toned, styles[hintTone]])}>
          {hint}
        </span>
      )}
      {(chevron || opensMenu) && (
        <ChevronRight
          className={styles.chevron}
          size={MENU_ICON_SIZE}
          strokeWidth={MENU_ICON_STROKE_WIDTH}
          aria-hidden
        />
      )}
    </button>
  )
}
