import { createPortal } from 'react-dom'
import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

import { Popover } from '@agentic-workstation/ui/Popover'
import { Tooltip } from '@agentic-workstation/ui/Tooltip'

import { usePathOpening } from './PathLink.hooks'
import styles from './PathLink.module.scss'
import type { PathLinkProps } from './PathLink.types'
import { PathChoice } from './parts/PathChoice'

/**
 * Путь в тексте ленты (ответ, своё сообщение, ошибка, карточка вызова): нажатие
 * открывает файл в IDE на нужном месте (и текст или картинку вне проекта - вкладкой), папку -
 * показывает в дереве, папку и остальное вне проекта - отдаёт системе. Кнопка, а не <a>: адреса
 * у пути нет. Внешняя ссылка на сайт - другое, её рисует LinkedText. Без раскладки окна
 * (витрина) - просто текст.
 */
export const PathLink = ({
  request,
  folder = false,
  tone = 'link',
  className,
  children,
}: PathLinkProps) => {
  const { t } = useTranslation()
  const { canOpen, isMissing, candidates, anchorRef, popoverProps, open, choose } =
    usePathOpening(request)
  // Что сделает нажатие - подсказка говорит до него; после промаха - что файла нет.
  const hint = isMissing
    ? t('agentPanel.paths.missing')
    : folder
      ? t('agentPanel.paths.openFolder')
      : t('agentPanel.paths.openFile')

  if (!canOpen) return <span className={className}>{children}</span>

  return (
    <>
      <Tooltip label={hint}>
        <button
          ref={anchorRef}
          type="button"
          aria-description={hint}
          className={clsx(styles.pathLink, styles[tone], isMissing && styles.missing, className)}
          onClick={open}>
          {children}
        </button>
      </Tooltip>
      {/* В body: панель - блок, а ссылка стоит посреди абзаца; верхний слой всё равно свой. */}
      {candidates &&
        createPortal(
          <Popover {...popoverProps} width="lg">
            <PathChoice path={request.path} candidates={candidates} onChoose={choose} />
          </Popover>,
          document.body,
        )}
    </>
  )
}
