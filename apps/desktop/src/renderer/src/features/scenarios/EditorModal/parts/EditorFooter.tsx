import { useTranslation } from 'react-i18next'

import { isBlocking } from '@shared/scenario-rules'

import { Badge } from '@agentic-workstation/ui/Badge'
import { Button } from '@agentic-workstation/ui/Button'
import { Tooltip } from '@agentic-workstation/ui/Tooltip'

import styles from '../EditorModal.module.scss'
import type { EditorFooterProps } from '../EditorModal.types'

/**
 * Подвал редактора: слева - сколько находок (сами они под оглавлением) или почему не
 * сохранилось, справа Cancel / Save. Несохранённый сценарий Cancel выбрасывает, поэтому кнопка
 * так и называется. Отказ сохранения стоит строкой, пока человек решает, что с ним делать.
 */
export const EditorFooter = ({
  problems,
  fresh,
  saving,
  refusal,
  onCancel,
  onSave,
}: EditorFooterProps) => {
  const { t } = useTranslation()

  return (
    <>
      <div className={styles.footerStart}>
        {refusal && (
          <span role="alert" className={styles.refusal}>
            {refusal}
          </span>
        )}
        {!refusal && problems.length > 0 && (
          <Tooltip label={t('scenarios.editor.issuesHint')}>
            <Badge tone={problems.some(isBlocking) ? 'danger' : 'warning'}>
              {t('scenarios.editor.issues', { count: problems.length })}
            </Badge>
          </Tooltip>
        )}
      </div>
      <div className={styles.footerEnd}>
        <Button variant="ghost" onClick={onCancel}>
          {fresh ? t('scenarios.editor.discard') : t('common.cancel')}
        </Button>
        <Button variant="primary" disabled={saving} onClick={onSave}>
          {saving ? t('scenarios.editor.saving') : t('scenarios.editor.save')}
        </Button>
      </div>
    </>
  )
}
