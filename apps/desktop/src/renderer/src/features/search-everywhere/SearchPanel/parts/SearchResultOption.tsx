import { useTranslation } from 'react-i18next'

import { FileIcon } from '@agentic-workstation/ui/FileIcon'
import { ListBoxOption } from '@agentic-workstation/ui/ListBoxOption'

import type { SearchResultOptionProps } from '../SearchPanel.types'
import { splitPath } from '../../../../lib/path.utils'

/**
 * Строка результата поиска. Файл - иконка типа, имя и папка серым; действие - подпись и
 * сочетание справа; найденный текст - иконка его файла, строка кода и «файл:строка»
 * справа: по иконке видно, в каком файле нашлось, ещё до подсказки.
 */
export const SearchResultOption = ({ result, ...option }: SearchResultOptionProps) => {
  const { t } = useTranslation()

  if (result.kind === 'file') {
    return (
      <ListBoxOption
        {...option}
        leading={<FileIcon path={result.file.path} kind="file" />}
        label={result.file.name}
        highlight={result.match.ranges}
        description={result.file.folder}
      />
    )
  }

  if (result.kind === 'action') {
    return (
      <ListBoxOption
        {...option}
        icon={result.action.icon}
        label={result.action.label}
        highlight={result.match.ranges}
        hint={result.action.shortcut}
      />
    )
  }

  const { relativePath, line, preview, matchStart, matchLength } = result.match

  return (
    <ListBoxOption
      {...option}
      code
      leading={<FileIcon path={relativePath} kind="file" />}
      label={preview}
      highlight={[{ start: matchStart, length: matchLength }]}
      hint={t('searchEverywhere.lineHint', { name: splitPath(relativePath).name, line })}
    />
  )
}
