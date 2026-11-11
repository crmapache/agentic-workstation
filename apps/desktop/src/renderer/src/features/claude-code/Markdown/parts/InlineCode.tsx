import { useMemo } from 'react'
import type { KeyboardEvent } from 'react'
import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

import { Tooltip } from '@agentic-workstation/ui/Tooltip'

import styles from '../Markdown.module.scss'
import type { InlineCodeProps } from '../Markdown.types'
import { useCopy } from '../../clipboard.hooks'
import { useKnownFiles } from '../../paths.hooks'
import { readPathRef } from '../../paths.utils'
import { PathLink } from '../../PathLink/PathLink'
import { useOpenFileAction } from '../../../../state/open-file.context'

/**
 * Код в бэктиках, как в ACC: путь открывает файл, остальное (флаг, ветка, имя)
 * копируется нажатием - кнопка рядом с куском в два слова была бы больше самого куска.
 * Без раскладки окна открыть нечем - путь тоже копируется.
 */
export const InlineCode = ({ text }: InlineCodeProps) => {
  const { t } = useTranslation()
  const canOpen = useOpenFileAction() !== null
  const known = useKnownFiles()
  const { isCopied, copy } = useCopy()
  const path = useMemo(
    () => (canOpen ? readPathRef(text, true, known) : null),
    [canOpen, text, known],
  )

  // Нажатие после выделения - это выделение: человек берёт больше этого куска, и
  // подменить ему буфер посреди дела было бы нечестно.
  const handleClick = () => {
    if (window.getSelection()?.isCollapsed === false) return
    copy(text)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    copy(text)
  }

  if (path) {
    return (
      <PathLink request={path.request} folder={path.folder}>
        <code className={styles.inlineCode}>{text}</code>
      </PathLink>
    )
  }

  return (
    <Tooltip
      label={isCopied ? t('claudeCode.markdown.copied') : t('claudeCode.markdown.clickToCopy')}>
      <code
        role="button"
        tabIndex={0}
        className={clsx(styles.inlineCode, styles.copyable, isCopied && styles.copied)}
        onClick={handleClick}
        onKeyDown={handleKeyDown}>
        {text}
      </code>
    </Tooltip>
  )
}
