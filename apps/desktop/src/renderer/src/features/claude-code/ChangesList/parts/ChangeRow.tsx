import { useState } from 'react'
import clsx from 'clsx'
import { Redo2, Undo2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { FileIcon } from '@agentic-workstation/ui/FileIcon'
import { IconButton } from '@agentic-workstation/ui/IconButton'
import { Tooltip } from '@agentic-workstation/ui/Tooltip'

import styles from '../ChangesList.module.scss'
import type { ChangeRowProps } from '../ChangesList.types'
import { rowNote, addedShown } from '../ChangesList.utils'
import { relativePath } from '../../claude.utils'
import { useFeedScope } from '../../feed-scope.context'
import { splitPath } from '../../../../lib/path.utils'
import { useOpenFileAction } from '../../../../state/open-file.context'

/**
 * Строка файла хода: иконка типа, папка (теряет начало, а не имя), имя, слова о
 * последнем нажатии, строки плюсом и минусом (у созданного - только плюс, посчитать
 * нечем - «±»). Вся строка открывает файл по полному пути из вызова; справа - откат, та же стрелка
 * зеркально возвращает. Откаченная - тише, цифры зачёркнуты.
 */
export const ChangeRow = ({ change, slot, actionable, press, onToggle }: ChangeRowProps) => {
  const { t } = useTranslation()
  const { projectPath } = useFeedScope()
  const openFile = useOpenFileAction()
  // Открыть не вышло - файла нет. Помнится при том, откачена ли строка: откат и возврат
  // создают и удаляют файл, и после них старый промах уже не правда.
  const [goneWhen, setGoneWhen] = useState<boolean | null>(null)
  const shown = relativePath(change.path, projectPath)
  const { folder, name } = splitPath(shown)
  const note = rowNote(change, press, goneWhen === change.reverted)

  const handleOpen = async () => {
    const outcome = await openFile?.({ path: change.path })

    setGoneWhen(outcome?.kind === 'missing' ? change.reverted : null)
  }

  const content = (
    <>
      <span className={styles.icon}>
        <FileIcon path={shown} kind="file" size="sm" />
      </span>
      <span className={styles.folder}>
        <span className={styles.folderText}>{folder && `${folder}/`}</span>
      </span>
      <span className={styles.name}>{name}</span>
      {note && <span className={clsx(styles.note, note.bad && styles.bad)}>{t(note.key)}</span>}
      {change.counted ? (
        <>
          <span className={styles.added}>{`+${addedShown(change)}`}</span>
          {!change.created && <span className={styles.removed}>{`−${change.removed}`}</span>}
        </>
      ) : (
        <span className={styles.uncounted}>{t('claudeCode.changes.uncounted')}</span>
      )}
    </>
  )

  return (
    <li className={clsx(styles.line, change.reverted && styles.reverted)}>
      {openFile ? (
        <Tooltip label={t('claudeCode.changes.open')} stretch>
          <button
            type="button"
            className={clsx(styles.row, styles.link)}
            aria-label={t('claudeCode.changes.openPath', { path: shown })}
            onClick={handleOpen}>
            {content}
          </button>
        </Tooltip>
      ) : (
        <span className={styles.row}>{content}</span>
      )}
      {actionable ? (
        <IconButton
          icon={change.reverted ? Redo2 : Undo2}
          size="sm"
          label={change.reverted ? t('claudeCode.changes.restore') : t('claudeCode.changes.revert')}
          disabled={press !== undefined}
          onClick={() => onToggle(change)}
        />
      ) : (
        slot && <span className={styles.slot} />
      )}
    </li>
  )
}
