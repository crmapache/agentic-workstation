import { useTranslation } from 'react-i18next'

import { Switch } from '@agentic-workstation/ui/Switch'

import { REFERENCES_DELAY_MS } from '../FileTreeView.constants'
import type { ReferencesSwitchProps } from '../FileTreeView.types'
import { useFileReferences } from '../../file-tree.queries'
import { useDebouncedValue } from '../../../../lib/debounce.hooks'

/**
 * «Update references», как в WebStorm: сколько импортов и ссылок на переносимое в скольких
 * файлах. Ссылок нет - переключатель погашен: переписывать нечего. Ищет главный процесс по
 * текущему диску; перенос переищет их ещё раз сам.
 */
export const ReferencesSwitch = ({ projectId, move, checked, onChange }: ReferencesSwitchProps) => {
  const { t } = useTranslation()
  // Откуда - не меняется, пока окно открыто; ждём, когда остановится набор нового места.
  const settledTo = useDebouncedValue(move?.to ?? null, REFERENCES_DELAY_MS)
  const settled = move && settledTo !== null ? { from: move.from, to: settledTo } : null
  const { data, isFetching } = useFileReferences(projectId, settled)
  const searching = (move?.to ?? null) !== settledTo || isFetching
  const found = data && data.total > 0
  const description = searching
    ? t('fileTree.references.searching')
    : found
      ? [
          t('fileTree.references.found', { count: data.total, files: data.files.length }),
          data.truncated ? t('fileTree.references.truncated') : '',
        ]
          .filter(Boolean)
          .join(' ')
      : t('fileTree.references.none')

  return (
    <Switch
      label={t('fileTree.references.label')}
      description={description}
      checked={checked && Boolean(found)}
      disabled={searching || !found}
      onChange={onChange}
    />
  )
}
