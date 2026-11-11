import type { MouseEvent } from 'react'
import { X, PencilLine } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Tooltip } from '@agentic-workstation/ui/Tooltip'

import { chipLabel, chipTitle } from '../chips.utils'
import { PictureHover } from '../PictureHover/PictureHover'
import styles from './DraftChipView.module.scss'
import type { DraftChipViewProps } from './DraftChipView.types'
import { ChipIcon } from './parts/ChipIcon'

/** Нажатие по кнопке чипа не уводит каретку из поля. */
const keepCaret = (event: MouseEvent) => event.preventDefault()

/**
 * Вложение сообщения плашкой: значок (у файла и папки - иконка типа), короткая подпись
 * (имя файла, «Image #3», начало цитаты) и подсказка - только если подпись что-то скрыла. Одна на поле ввода,
 * очередь и ленту: чип для человека один, где бы его ни нарисовали. Цвет - по смыслу:
 * ссылки на файлы - справочным тоном, команда - акцентом, текст - нейтральный. У чипа с
 * картинкой подсказки нет: под курсором - сама картинка (как в ACC).
 */
export const DraftChipView = ({
  chip,
  picture,
  opens = false,
  onRemove,
  onExpand,
}: DraftChipViewProps) => {
  const { t } = useTranslation()
  const title = chipTitle(chip)
  const label = chipLabel(chip)
  const body = (
    <span className={styles.body}>
      <ChipIcon chip={chip} />
      <span className={styles.label}>{label}</span>
    </span>
  )

  return (
    <span className={styles.draftChip} data-kind={chip.kind}>
      {picture ? (
        <PictureHover source={picture} opens={opens}>
          {body}
        </PictureHover>
      ) : title ? (
        <Tooltip label={title} placement="top">
          {body}
        </Tooltip>
      ) : (
        body
      )}
      {(onExpand || onRemove) && (
        <span className={styles.actions}>
          {onExpand && (
            <button
              type="button"
              className={styles.action}
              aria-label={t('claudeCode.chips.expand')}
              onMouseDown={keepCaret}
              onClick={onExpand}>
              <PencilLine className={styles.actionIcon} aria-hidden />
            </button>
          )}
          {onRemove && (
            <button
              type="button"
              className={styles.action}
              aria-label={t('claudeCode.chips.remove', { name: label })}
              onMouseDown={keepCaret}
              onClick={onRemove}>
              <X className={styles.actionIcon} aria-hidden />
            </button>
          )}
        </span>
      )}
    </span>
  )
}
