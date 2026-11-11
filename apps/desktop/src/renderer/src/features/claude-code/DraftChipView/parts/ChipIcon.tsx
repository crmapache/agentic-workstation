import { FileIcon } from '@agentic-workstation/ui/FileIcon'

import styles from '../DraftChipView.module.scss'
import type { ChipIconProps } from '../DraftChipView.types'
import { CHIP_ICONS, CHIP_PATH_KINDS } from '../../chips.constants'
import { isPathChip } from '../../chips.utils'

/**
 * Значок чипа. Файл, кусок файла и папка - иконкой типа, как в дереве и подсказке «@»:
 * по ней видно, что за файл, ещё до имени. Остальное - значком вида.
 */
export const ChipIcon = ({ chip }: ChipIconProps) => {
  const { kind } = chip

  if (isPathChip(kind)) return <FileIcon path={chip.value} kind={CHIP_PATH_KINDS[kind]} size="sm" />

  const Icon = CHIP_ICONS[kind]

  return <Icon className={styles.icon} aria-hidden />
}
