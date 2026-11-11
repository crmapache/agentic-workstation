import { useTranslation } from 'react-i18next'

import type { ScenarioScope } from '@shared/scenarios'

import { Tabs } from '@agentic-workstation/ui/Tabs'
import { TextField } from '@agentic-workstation/ui/TextField'

import styles from '../EditorModal.module.scss'
import type { NamePaneProps } from '../EditorModal.types'

/**
 * Имя и полка. Полка - не настройка, а какой это файл: сохранение под другой полкой
 * переносит файл (это делает главный процесс), здесь меняется только draft.scope. Полки
 * репозитория нет, если нет его папки - тогда выбор молчит и объясняет почему.
 */
export const NamePane = ({ draft, canShare, onChange }: NamePaneProps) => {
  const { t } = useTranslation()
  const items = [
    {
      id: 'project' as const,
      label: t('scenarios.editor.inRepository'),
      hint: canShare ? undefined : t('scenarios.editor.name.noRepository'),
    },
    { id: 'user' as const, label: t('scenarios.editor.everyProject') },
  ]

  const handleScope = (scope: ScenarioScope) => {
    if (scope === 'project' && !canShare) return

    onChange((one) => ({ ...one, scope }))
  }

  return (
    <>
      <TextField
        label={t('scenarios.editor.name.label')}
        value={draft.name}
        placeholder={t('scenarios.editor.untitled')}
        onChange={(name) => onChange((one) => ({ ...one, name }))}
      />
      <div className={styles.field}>
        <span className={styles.fieldLabel}>{t('scenarios.editor.name.keptIn')}</span>
        <div className={styles.addRow}>
          <Tabs
            label={t('scenarios.editor.name.keptIn')}
            items={items}
            value={draft.scope}
            onChange={handleScope}
          />
        </div>
      </div>
    </>
  )
}
