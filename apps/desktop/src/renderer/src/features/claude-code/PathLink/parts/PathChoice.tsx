import { useTranslation } from 'react-i18next'

import { FileIcon } from '@agentic-workstation/ui/FileIcon'
import { Menu } from '@agentic-workstation/ui/Menu'
import { MenuItem } from '@agentic-workstation/ui/MenuItem'
import { MenuSection } from '@agentic-workstation/ui/MenuSection'

import type { PathChoiceProps } from '../PathLink.types'

/**
 * Меню выбора, когда голое имя нашлось в нескольких местах проекта, как «Go to File»:
 * в строках пути от корня - имя у всех одно, различает их только папка.
 */
export const PathChoice = ({ path, candidates, onChoose }: PathChoiceProps) => {
  const { t } = useTranslation()

  return (
    <Menu label={t('claudeCode.paths.chooseLabel', { path })} autoFocus>
      <MenuSection title={t('claudeCode.paths.chooseTitle')}>
        {candidates.map((candidate) => (
          <MenuItem
            key={candidate}
            leading={<FileIcon path={candidate} kind="file" />}
            label={candidate}
            onSelect={() => onChoose(candidate)}
          />
        ))}
      </MenuSection>
    </Menu>
  )
}
