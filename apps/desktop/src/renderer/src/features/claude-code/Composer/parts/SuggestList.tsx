import { useTranslation } from 'react-i18next'

import { FileIcon } from '@agentic-workstation/ui/FileIcon'
import { ListBox } from '@agentic-workstation/ui/ListBox'
import { ListBoxOption } from '@agentic-workstation/ui/ListBoxOption'

import { SUGGEST_ICONS } from '../Composer.constants'
import styles from '../Composer.module.scss'
import type { SuggestListProps } from '../Composer.types'
import { suggestOptionId } from '../Composer.utils'

/**
 * Подсказка над полем (как в ACC): команды с пояснением и группой справа (panel,
 * built-in), значения аргумента, файлы и папки - иконкой типа и с папкой серым. Фокус
 * остаётся в поле, стрелки двигают выделение, мышь только подсвечивает.
 */
export const SuggestList = ({
  id,
  rows,
  highlight,
  isFiles,
  onPick,
  onHover,
}: SuggestListProps) => {
  const { t } = useTranslation()

  return (
    <div className={styles.suggest}>
      <ListBox
        id={id}
        label={isFiles ? t('claudeCode.mention.label') : t('claudeCode.slash.label')}>
        {rows.map((row, index) => {
          const { kind } = row

          return (
            <ListBoxOption
              key={row.id}
              id={suggestOptionId(id, index)}
              label={row.label}
              highlight={row.highlight}
              description={row.description}
              hint={
                row.group && row.group !== 'project'
                  ? t(`claudeCode.slash.groups.${row.group}`)
                  : undefined
              }
              icon={kind === 'command' || kind === 'value' ? SUGGEST_ICONS[kind] : undefined}
              leading={
                kind === 'file' || kind === 'folder' ? (
                  <FileIcon path={row.id} kind={kind} />
                ) : undefined
              }
              active={index === highlight}
              onSelect={() => onPick(row)}
              onActivate={() => onHover(index)}
            />
          )
        })}
      </ListBox>
    </div>
  )
}
