import type { MouseEvent } from 'react'
import clsx from 'clsx'
import { FileX } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { FileIcon } from '@agentic-workstation/ui/FileIcon'
import { Menu } from '@agentic-workstation/ui/Menu'
import { MenuItem } from '@agentic-workstation/ui/MenuItem'
import { Popover } from '@agentic-workstation/ui/Popover'
import { usePopover } from '@agentic-workstation/ui/Popover.hooks'
import { Tooltip } from '@agentic-workstation/ui/Tooltip'

import { ROW_ICON_SIZE, ROW_ICON_STROKE } from '../claude.constants'
import { fitStepMark } from '../composer-fit.hooks'
import { useEditorChip } from './EditorChip.hooks'
import styles from './EditorChip.module.scss'
import type { EditorChipProps } from './EditorChip.types'

/** Нажатие не уводит каретку из поля. */
const keepCaret = (event: MouseEvent) => event.preventDefault()

/**
 * Открытый файл в ряду под полем (как в ACC): он уходит с сообщением заметкой для
 * модели. Нажатие - меню из трёх пунктов: с каждым сообщением, не с этим (или только с
 * этим, когда отправка выключена) и никогда. Уходит - иконка типа файла; не уходит -
 * перечёркнутый листок, а при выключенной настройке ещё и без имени: дорога обратно там
 * же, где выключили.
 */
export const EditorChip = ({ conversationKey, editor, dropped }: EditorChipProps) => {
  const { t } = useTranslation()
  const popover = usePopover()
  const chip = useEditorChip(conversationKey, editor)

  if (!editor || !chip || dropped?.has('editorChip')) return null

  const { goes, muted, label, choice } = chip
  const hint = muted
    ? t('claudeCode.editor.muted', { place: editor.path })
    : goes
      ? t('claudeCode.editor.on', { place: editor.path })
      : t('claudeCode.editor.off', { place: editor.path })

  return (
    <>
      <Tooltip label={hint} placement="top">
        <button
          {...popover.triggerProps}
          {...(chip.muted && fitStepMark('editorChip'))}
          type="button"
          className={clsx(styles.editorChip, !goes && styles.off)}
          aria-haspopup="menu"
          aria-label={hint}
          onMouseDown={keepCaret}>
          {goes ? (
            <FileIcon path={editor.path} kind="file" size="sm" />
          ) : (
            <FileX size={ROW_ICON_SIZE} strokeWidth={ROW_ICON_STROKE} aria-hidden />
          )}
          {/* Ушедшее имя стоит невидимым без ширины: замер ряда знает, сколько ему нужно. */}
          {!muted && (
            <span
              {...fitStepMark('editorName')}
              className={clsx(styles.name, dropped?.has('editorName') && styles.nameGone)}>
              {label}
            </span>
          )}
        </button>
      </Tooltip>
      <Popover {...popover.popoverProps}>
        {popover.isOpen && (
          <Menu label={t('claudeCode.editor.menu')} autoFocus>
            <MenuItem
              selection="single"
              checked={choice === 'always'}
              label={t('claudeCode.editor.always')}
              description={t('claudeCode.editor.alwaysSub')}
              onSelect={chip.always}
            />
            <MenuItem
              selection="single"
              checked={choice === 'once'}
              label={chip.shared ? t('claudeCode.editor.skip') : t('claudeCode.editor.only')}
              description={
                chip.shared ? t('claudeCode.editor.skipSub') : t('claudeCode.editor.onlySub')
              }
              onSelect={chip.once}
            />
            <MenuItem
              selection="single"
              checked={choice === 'never'}
              label={t('claudeCode.editor.never')}
              description={t('claudeCode.editor.neverSub')}
              onSelect={chip.never}
            />
          </Menu>
        )}
      </Popover>
    </>
  )
}
