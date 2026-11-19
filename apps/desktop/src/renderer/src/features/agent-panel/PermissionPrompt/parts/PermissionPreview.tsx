import { useMemo } from 'react'

import { PREVIEW_DIFF_ROWS } from '../PermissionPrompt.constants'
import styles from '../PermissionPrompt.module.scss'
import type { PermissionPreviewProps } from '../PermissionPrompt.types'
import { editRows } from '../../diff.utils'
import { inputText } from '../../panel.utils'
import { DiffView } from '../../DiffView/DiffView'

/**
 * Что именно разрешают: команда целиком, дифф правки, адрес. Решать надо по сути
 * действия, а не по имени инструмента.
 */
export const PermissionPreview = ({ request }: PermissionPreviewProps) => {
  const { action, input } = request
  const rows = useMemo(() => editRows({ action, result: null }), [action])

  if (action.kind === 'command' && action.command) {
    return <pre className={styles.command}>{`$ ${action.command}`}</pre>
  }

  if (rows.length > 0) {
    return (
      <div className={styles.diff}>
        <DiffView rows={rows} collapsedRows={PREVIEW_DIFF_ROWS} />
      </div>
    )
  }

  return (
    <pre className={styles.command}>
      {action.kind === 'web'
        ? action.target
        : inputText(input, 'url') || JSON.stringify(input, null, 2)}
    </pre>
  )
}
